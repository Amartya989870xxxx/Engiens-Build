import { GoogleGenAI } from "@google/genai";
import type { AppConfig } from "../config/env.js";
import type { EngineeringPlan, RepositoryContext, ResearchResult } from "../../../shared/contract.js";
import { engineeringPlanSchema } from "../../../shared/contract.js";
import { AppError } from "../lib/errors.js";
import { buildPrompt } from "./gemini.js";

export type AIProviderName = "gemini" | "groq";

export interface AIModelDescriptor {
  provider: AIProviderName;
  model: string;
  contextWindow: number;
}

export interface TextExecutionResult {
  text: string;
  provider: AIProviderName;
  model: string;
  fallbackOccurred: boolean;
  failedAttempts: number;
  durationMs: number;
}

export interface JsonExecutionResult<T> {
  data: T;
  provider: AIProviderName;
  model: string;
  fallbackOccurred: boolean;
  failedAttempts: number;
  durationMs: number;
}

export interface RouterExecutionResult {
  plan: EngineeringPlan;
  provider: AIProviderName;
  model: string;
  fallbackOccurred: boolean;
  failedAttempts: number;
  durationMs: number;
}

export interface IntelligenceRouterDeps {
  config: AppConfig;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
  customCandidateModels?: AIModelDescriptor[];
  geminiCallImpl?: (model: string, prompt: string) => Promise<string>;
}

/** Error classification for provider routing */
export type AIErrorCategory =
  | "AUTH_INVALID"
  | "RATE_LIMITED"
  | "QUOTA_EXHAUSTED"
  | "SERVICE_UNAVAILABLE"
  | "MODEL_UNAVAILABLE"
  | "SCHEMA_MISMATCH"
  | "TIMEOUT"
  | "CLIENT_ERROR"
  | "UNKNOWN";

export function classifyAIError(err: any): { category: AIErrorCategory; retryable: boolean; isProjectExhausted: boolean } {
  const status = err.status || err.statusCode || (err.response && err.response.status);
  const msg = (err.message || "").toLowerCase();

  if (status === 401 || msg.includes("api key not valid") || msg.includes("invalid_api_key") || msg.includes("unauthorized")) {
    return { category: "AUTH_INVALID", retryable: false, isProjectExhausted: false };
  }

  if (
    status === 429 ||
    msg.includes("rate limit") ||
    msg.includes("too many requests") ||
    msg.includes("resource_exhausted") ||
    msg.includes("quota")
  ) {
    const isExhausted = msg.includes("quota") || msg.includes("resource_exhausted") || msg.includes("billing");
    return {
      category: isExhausted ? "QUOTA_EXHAUSTED" : "RATE_LIMITED",
      retryable: true,
      isProjectExhausted: isExhausted,
    };
  }

  if (status === 503 || status === 502 || status === 504 || msg.includes("overloaded") || msg.includes("unavailable")) {
    return { category: "SERVICE_UNAVAILABLE", retryable: true, isProjectExhausted: false };
  }

  if (status === 404 || msg.includes("not found") || msg.includes("is no longer available") || msg.includes("model_not_found")) {
    return { category: "MODEL_UNAVAILABLE", retryable: true, isProjectExhausted: false };
  }

  if (err.name === "AbortError" || msg.includes("timeout")) {
    return { category: "TIMEOUT", retryable: true, isProjectExhausted: false };
  }

  if (msg.includes("schema") || msg.includes("json")) {
    return { category: "SCHEMA_MISMATCH", retryable: true, isProjectExhausted: false };
  }

  return { category: "UNKNOWN", retryable: false, isProjectExhausted: false };
}

/** Verified candidate reasoning models in strict fallback sequence */
export const DEFAULT_AI_CANDIDATE_MODELS: AIModelDescriptor[] = [
  // 1. Gemini Primary Tier
  { provider: "gemini", model: "gemini-3.8-flash", contextWindow: 1_000_000 },
  { provider: "gemini", model: "gemini-3.5-flash", contextWindow: 1_000_000 },
  { provider: "gemini", model: "gemini-flash-latest", contextWindow: 1_000_000 },

  // 2. Groq Secondary Tier (ordered by reasoning depth & architecture suitability)
  { provider: "groq", model: "openai/gpt-oss-120b", contextWindow: 131_072 },
  { provider: "groq", model: "qwen/qwen3.8-27b", contextWindow: 131_072 },
  { provider: "groq", model: "openai/gpt-oss-20b", contextWindow: 131_072 },
];

export class DexorIntelligenceRouter {
  // Cooldown tracker: modelIdentifier -> cooldownExpiresAt
  private static cooldowns = new Map<string, number>();

  static isCoolingDown(key: string): boolean {
    const expires = this.cooldowns.get(key);
    if (!expires) return false;
    if (Date.now() > expires) {
      this.cooldowns.delete(key);
      return false;
    }
    return true;
  }

  static setCooldown(key: string, durationMs: number = 60_000) {
    this.cooldowns.set(key, Date.now() + durationMs);
  }

  static clearCooldowns() {
    this.cooldowns.clear();
  }

  /**
   * Routes the reasoning prompt through available providers with automated fallback.
   */
  static async execute(
    request: string,
    repo: RepositoryContext,
    research: ResearchResult,
    deps: IntelligenceRouterDeps
  ): Promise<RouterExecutionResult> {
    const startTime = Date.now();
    const candidates = deps.customCandidateModels || DEFAULT_AI_CANDIDATE_MODELS;
    const prompt = buildPrompt(request, repo, research);

    let failedAttempts = 0;
    const errorsEncountered: Array<{ candidate: string; error: string; category: AIErrorCategory }> = [];
    let geminiProjectQuotaExhausted = false;

    for (const descriptor of candidates) {
      const modelKey = `${descriptor.provider}:${descriptor.model}`;

      // Check if candidate is under cooldown
      if (this.isCoolingDown(modelKey) || this.isCoolingDown(descriptor.provider)) {
        continue;
      }

      // If Gemini project quota was exhausted, skip remaining Gemini models
      if (descriptor.provider === "gemini" && geminiProjectQuotaExhausted) {
        continue;
      }

      // Check API key presence
      if (descriptor.provider === "gemini" && !deps.config.geminiApiKey) {
        continue;
      }
      if (descriptor.provider === "groq" && !deps.config.groqApiKey) {
        continue;
      }

      try {
        let rawJsonText = "";

        if (descriptor.provider === "gemini") {
          rawJsonText = await this.callGemini(descriptor.model, prompt, deps);
        } else if (descriptor.provider === "groq") {
          rawJsonText = await this.callGroq(descriptor.model, prompt, deps);
        }

        // Validate structured JSON output
        const plan = this.parseAndValidate(rawJsonText);

        return {
          plan,
          provider: descriptor.provider,
          model: descriptor.model,
          fallbackOccurred: failedAttempts > 0,
          failedAttempts,
          durationMs: Date.now() - startTime,
        };
      } catch (err: any) {
        failedAttempts++;
        const classification = classifyAIError(err);
        errorsEncountered.push({
          candidate: modelKey,
          error: err.message || "Unknown error",
          category: classification.category,
        });

        // Fatal: Non-retryable authentication failure on the current provider
        if (classification.category === "AUTH_INVALID") {
          // Cooldown the whole provider
          this.setCooldown(descriptor.provider, 300_000);
          continue;
        }

        // Project-level quota exhaustion
        if (classification.isProjectExhausted) {
          if (descriptor.provider === "gemini") {
            geminiProjectQuotaExhausted = true;
          }
          this.setCooldown(descriptor.provider, 120_000);
          continue;
        }

        // Retryable: Cool down this specific model
        if (classification.retryable) {
          this.setCooldown(modelKey, 60_000);
          continue;
        }

        // If it's a non-retryable client error, throw immediately
        if (classification.category === "CLIENT_ERROR") {
          throw err;
        }
      }
    }

    // If all providers failed
    const errorDetails = errorsEncountered.map((e) => `[${e.candidate} - ${e.category}]: ${e.error}`).join("; ");
    throw new AppError({
      code: "ALL_AI_PROVIDERS_EXHAUSTED",
      message: `All configured AI reasoning providers failed. Details: ${errorDetails}`,
      status: 502,
      service: "gemini",
      details: errorsEncountered,
    });
  }

  /**
   * Executes conversational / textual prompt with automated fallback across Gemini and Groq.
   */
  static async executeText(
    prompt: string,
    systemPrompt: string,
    deps: IntelligenceRouterDeps
  ): Promise<TextExecutionResult> {
    const startTime = Date.now();
    const candidates = deps.customCandidateModels || DEFAULT_AI_CANDIDATE_MODELS;

    let failedAttempts = 0;
    const errorsEncountered: Array<{ candidate: string; error: string; category: AIErrorCategory }> = [];
    let geminiProjectQuotaExhausted = false;

    for (const descriptor of candidates) {
      const modelKey = `${descriptor.provider}:${descriptor.model}`;

      if (this.isCoolingDown(modelKey) || this.isCoolingDown(descriptor.provider)) {
        continue;
      }
      if (descriptor.provider === "gemini" && geminiProjectQuotaExhausted) {
        continue;
      }
      if (descriptor.provider === "gemini" && !deps.config.geminiApiKey) {
        continue;
      }
      if (descriptor.provider === "groq" && !deps.config.groqApiKey) {
        continue;
      }

      try {
        let textResult = "";
        if (descriptor.provider === "gemini") {
          textResult = await this.callGeminiText(descriptor.model, prompt, systemPrompt, deps);
        } else if (descriptor.provider === "groq") {
          textResult = await this.callGroqText(descriptor.model, prompt, systemPrompt, deps);
        }

        return {
          text: textResult,
          provider: descriptor.provider,
          model: descriptor.model,
          fallbackOccurred: failedAttempts > 0,
          failedAttempts,
          durationMs: Date.now() - startTime,
        };
      } catch (err: any) {
        failedAttempts++;
        const classification = classifyAIError(err);
        errorsEncountered.push({
          candidate: modelKey,
          error: err.message || "Unknown error",
          category: classification.category,
        });

        if (classification.category === "AUTH_INVALID") {
          this.setCooldown(descriptor.provider, 300_000);
          continue;
        }
        if (classification.isProjectExhausted) {
          if (descriptor.provider === "gemini") {
            geminiProjectQuotaExhausted = true;
          }
          this.setCooldown(descriptor.provider, 120_000);
          continue;
        }
        if (classification.retryable) {
          this.setCooldown(modelKey, 60_000);
          continue;
        }
        if (classification.category === "CLIENT_ERROR") {
          throw err;
        }
      }
    }

    const errorDetails = errorsEncountered.map((e) => `[${e.candidate} - ${e.category}]: ${e.error}`).join("; ");
    throw new AppError({
      code: "ALL_AI_PROVIDERS_EXHAUSTED",
      message: `All configured AI reasoning providers failed. Details: ${errorDetails}`,
      status: 502,
      service: "gemini",
      details: errorsEncountered,
    });
  }

  /**
   * Executes structured JSON prompt with Zod validation and automated fallback.
   */
  static async executeJson<T>(
    prompt: string,
    systemPrompt: string,
    schema: { safeParse: (data: unknown) => { success: true; data: T } | { success: false; error: any } },
    deps: IntelligenceRouterDeps
  ): Promise<JsonExecutionResult<T>> {
    const startTime = Date.now();
    const candidates = deps.customCandidateModels || DEFAULT_AI_CANDIDATE_MODELS;

    let failedAttempts = 0;
    const errorsEncountered: Array<{ candidate: string; error: string; category: AIErrorCategory }> = [];
    let geminiProjectQuotaExhausted = false;

    for (const descriptor of candidates) {
      const modelKey = `${descriptor.provider}:${descriptor.model}`;

      if (this.isCoolingDown(modelKey) || this.isCoolingDown(descriptor.provider)) {
        continue;
      }
      if (descriptor.provider === "gemini" && geminiProjectQuotaExhausted) {
        continue;
      }
      if (descriptor.provider === "gemini" && !deps.config.geminiApiKey) {
        continue;
      }
      if (descriptor.provider === "groq" && !deps.config.groqApiKey) {
        continue;
      }

      try {
        let rawJson = "";
        if (descriptor.provider === "gemini") {
          rawJson = await this.callGemini(descriptor.model, `${systemPrompt}\n\n${prompt}`, deps);
        } else if (descriptor.provider === "groq") {
          rawJson = await this.callGroq(descriptor.model, prompt, deps);
        }

        let cleaned = rawJson.trim();
        if (cleaned.startsWith("```")) {
          cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
        }
        const parsed = JSON.parse(cleaned);
        const val = schema.safeParse(parsed);
        if (!val.success) {
          throw new Error(`Schema mismatch: ${val.error.message}`);
        }

        return {
          data: val.data,
          provider: descriptor.provider,
          model: descriptor.model,
          fallbackOccurred: failedAttempts > 0,
          failedAttempts,
          durationMs: Date.now() - startTime,
        };
      } catch (err: any) {
        failedAttempts++;
        const classification = classifyAIError(err);
        errorsEncountered.push({
          candidate: modelKey,
          error: err.message || "Unknown error",
          category: classification.category,
        });

        if (classification.category === "AUTH_INVALID") {
          this.setCooldown(descriptor.provider, 300_000);
          continue;
        }
        if (classification.isProjectExhausted) {
          if (descriptor.provider === "gemini") {
            geminiProjectQuotaExhausted = true;
          }
          this.setCooldown(descriptor.provider, 120_000);
          continue;
        }
        if (classification.retryable) {
          this.setCooldown(modelKey, 60_000);
          continue;
        }
        if (classification.category === "CLIENT_ERROR") {
          throw err;
        }
      }
    }

    const errorDetails = errorsEncountered.map((e) => `[${e.candidate} - ${e.category}]: ${e.error}`).join("; ");
    throw new AppError({
      code: "ALL_AI_PROVIDERS_EXHAUSTED",
      message: `All configured AI reasoning providers failed. Details: ${errorDetails}`,
      status: 502,
      service: "gemini",
      details: errorsEncountered,
    });
  }

  private static async callGeminiText(
    model: string,
    prompt: string,
    systemPrompt: string,
    deps: IntelligenceRouterDeps
  ): Promise<string> {
    if (deps.geminiCallImpl) {
      return deps.geminiCallImpl(model, prompt);
    }

    const ai = new GoogleGenAI({ apiKey: deps.config.geminiApiKey! });
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        systemInstruction: systemPrompt,
      },
    });

    const text = response.text;
    if (!text) throw new Error("Gemini returned empty text response");
    return text;
  }

  private static async callGroqText(
    model: string,
    prompt: string,
    systemPrompt: string,
    deps: IntelligenceRouterDeps
  ): Promise<string> {
    const fetchFn = deps.fetchImpl || fetch;
    const res = await fetchFn("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${deps.config.groqApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt },
        ],
        temperature: 0.3,
      }),
      signal: deps.signal,
    });

    if (!res.ok) {
      const errBody = await res.text();
      let parsedMsg = errBody;
      try {
        parsedMsg = JSON.parse(errBody).error?.message || errBody;
      } catch {}
      const err: any = new Error(`Groq API error (${res.status}): ${parsedMsg}`);
      err.status = res.status;
      throw err;
    }

    const data = (await res.json()) as any;
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("Groq returned empty text response");
    return content;
  }

  private static async callGemini(model: string, prompt: string, deps: IntelligenceRouterDeps): Promise<string> {
    if (deps.geminiCallImpl) {
      return deps.geminiCallImpl(model, prompt);
    }

    const ai = new GoogleGenAI({ apiKey: deps.config.geminiApiKey! });
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      },
    });

    const text = response.text;
    if (!text) {
      throw new Error("Gemini returned empty text response");
    }
    return text;
  }

  private static async callGroq(model: string, prompt: string, deps: IntelligenceRouterDeps): Promise<string> {
    const fetchFn = deps.fetchImpl || fetch;
    const res = await fetchFn("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${deps.config.groqApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content:
              "You are Engiens Build, an expert principal software architect. You output ONLY valid raw JSON adhering to the exact engineering plan schema required.",
          },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
        temperature: 0.2,
      }),
      signal: deps.signal,
    });

    if (!res.ok) {
      const errBody = await res.text();
      let parsedMsg = errBody;
      try {
        const parsed = JSON.parse(errBody);
        parsedMsg = parsed.error?.message || errBody;
      } catch {}
      const err: any = new Error(`Groq API error (${res.status}): ${parsedMsg}`);
      err.status = res.status;
      throw err;
    }

    const data = (await res.json()) as any;
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("Groq returned empty text response");
    }
    return content;
  }

  private static parseAndValidate(raw: string): EngineeringPlan {
    let cleaned = raw.trim();
    if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    }

    let parsed: any;
    try {
      parsed = JSON.parse(cleaned);
    } catch (err: any) {
      throw new Error(`Invalid JSON output: ${err.message}`);
    }

    if (parsed && typeof parsed === "object") {
      if (!parsed.repositoryUnderstanding && (parsed.plan || parsed.engineeringPlan || parsed.result)) {
        parsed = parsed.plan || parsed.engineeringPlan || parsed.result;
      }
    }

    const val = engineeringPlanSchema.safeParse(parsed);
    if (!val.success) {
      if (typeof parsed === "object" && parsed !== null && "implementationStrategy" in parsed) {
        return parsed as EngineeringPlan;
      }
      throw new Error(`Schema validation failed: ${val.error.message}`);
    }

    return val.data;
  }
}
