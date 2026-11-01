import { GoogleGenAI } from "@google/genai";
import type { AppConfig } from "../config/env.js";
import { requireGeminiKey } from "../config/env.js";
import type { EngineeringPlan, RepositoryContext, ResearchResult } from "../../../shared/contract.js";
import { engineeringPlanSchema } from "../../../shared/contract.js";
import { AppError } from "../lib/errors.js";

export interface GeminiDeps {
  config: AppConfig;
  signal?: AbortSignal;
}

export function buildPrompt(request: string, repo: RepositoryContext, research: ResearchResult): string {
  const fileSummaries = repo.files.map(f => {
    return `### File: ${f.path} (${f.reason})\n\`\`\`\n${f.content}\n\`\`\``;
  }).join("\n\n");

  const sourcesSummary = research.sources.map(s => {
    return `### Source [${s.id}]: ${s.title} (${s.url})\nOfficial: ${s.official}\n\`\`\`\n${s.content}\n\`\`\``;
  }).join("\n\n");

  return `You are Engiens Build, an expert principal software architect and AI engineering teammate.
Your task is to analyze the user's engineering request in the context of an actual verified codebase AND live retrieved documentation from TinyFish.

USER REQUEST:
${request}

VERIFIED REPOSITORY METADATA:
Name: ${repo.repo.fullName}
Primary Language: ${repo.repo.primaryLanguage || "Unknown"}
Default Branch: ${repo.repo.defaultBranch}
Detected Stack: ${repo.stack.ecosystems.join(", ")} | Tech: ${repo.stack.technologies.map(t => `${t.name} (${t.category})`).join(", ")}
Manifests: ${repo.stack.manifests.join(", ")}
Total Files in Tree: ${repo.tree.totalFiles}

REPOSITORY OUTLINE (Depth-limited structure):
${repo.tree.outline}

INSPECTED REPOSITORY SOURCE FILES:
${fileSummaries || "No source files were directly loaded."}

RETRIEVED TINYFISH RESEARCH & OFFICIAL DOCUMENTATION:
${sourcesSummary || "No external research documentation was retrieved."}

INSTRUCTIONS:
1. Ground your reasoning in the actual repository architecture, code patterns, and dependencies.
2. Ground all third-party API / SDK advice in the retrieved TinyFish documentation sources. Cite sourceUrls accurately using the exact URLs from the sources above.
3. Be specific: do not propose generic boilerplate. If modifying a file, show realistic targeted code or diffs that respect existing project patterns.
4. Distinguish between 'documentation' (backed by research), 'repository' (backed by inspected code), and 'reasoning' (engineering assessment).
5. Output ONLY a valid raw JSON object matching the exact top-level keys below (do not wrap in an outer object, do not wrap in markdown):
{
  "repositoryUnderstanding": { "summary": "...", "detectedStack": [...], "architecture": "...", "importantFiles": [{ "path": "...", "role": "..." }], "patterns": [...] },
  "requirementInterpretation": { "summary": "...", "expectedBehaviour": [...], "assumptions": [...], "openQuestions": [...] },
  "research": { "findings": [{ "finding": "...", "sourceUrls": [...], "relevance": "..." }], "supportedDecisions": [{ "decision": "...", "sourceUrls": [...] }], "gaps": [...] },
  "implementationStrategy": { "overview": "...", "steps": [{ "title": "...", "detail": "...", "files": [...], "basis": "documentation" | "repository" | "reasoning", "sourceUrls": [...] }], "filesToCreate": [{ "path": "...", "reason": "..." }], "filesToModify": [{ "path": "...", "reason": "..." }], "dependencies": [{ "name": "...", "reason": "...", "sourceUrls": [...] }] },
  "proposedChanges": [{ "path": "...", "changeType": "create" | "modify" | "delete", "language": "...", "explanation": "...", "code": "...", "notes": [...], "basis": "documentation" | "repository" | "reasoning", "sourceUrls": [...] }],
  "testing": { "unit": [...], "integration": [...], "edgeCases": [...], "validationSteps": [...] },
  "risks": { "security": [...], "compatibility": [...], "breakingChanges": [...], "missingInformation": [...], "tradeoffs": [...] }
}`;
}

export async function generateEngineeringPlan(
  request: string,
  repo: RepositoryContext,
  research: ResearchResult,
  deps: GeminiDeps
): Promise<EngineeringPlan> {
  const apiKey = requireGeminiKey(deps.config);
  const ai = new GoogleGenAI({ apiKey });
  const modelName = deps.config.geminiModel || "gemini-3.8-flash";

  const prompt = buildPrompt(request, repo, research);

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        // Enforce JSON schema from Zod
        // @google/genai accepts JSON schema directly
      }
    });

    const text = response.text;
    if (!text) {
      throw new AppError({
        code: "GEMINI_EMPTY_RESPONSE",
        message: "Gemini returned an empty response.",
        status: 502,
        service: "gemini"
      });
    }

  // Clean markdown code fences if model wrapped the JSON
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  }

  let parsedJson: any;
  try {
    parsedJson = JSON.parse(cleaned);
  } catch (e: any) {
    throw new AppError({
      code: "GEMINI_INVALID_JSON",
      message: "Gemini response was not valid JSON.",
      status: 502,
      service: "gemini",
      details: text.slice(0, 500)
    });
  }

  // Handle case where Gemini wraps response in an outer object, e.g. { "plan": { ... } } or { "engineeringPlan": { ... } }
  if (parsedJson && typeof parsedJson === "object") {
    if (!parsedJson.repositoryUnderstanding && (parsedJson.plan || parsedJson.engineeringPlan || parsedJson.result)) {
      parsedJson = parsedJson.plan || parsedJson.engineeringPlan || parsedJson.result;
    }
  }

  const validation = engineeringPlanSchema.safeParse(parsedJson);
    if (!validation.success) {
      // Return best effort parsed JSON if it has the core fields, or throw
      if (typeof parsedJson === "object" && parsedJson !== null && "implementationStrategy" in parsedJson) {
        return parsedJson as EngineeringPlan;
      }
      throw new AppError({
        code: "GEMINI_SCHEMA_MISMATCH",
        message: "Gemini output failed schema validation: " + validation.error.message,
        status: 502,
        service: "gemini",
        details: validation.error.issues
      });
    }

    return validation.data;
  } catch (err: any) {
    if (err instanceof AppError) throw err;
    throw new AppError({
      code: "GEMINI_ERROR",
      message: err.message || "Failed to generate plan with Gemini.",
      status: 502,
      service: "gemini",
      cause: err
    });
  }
}
