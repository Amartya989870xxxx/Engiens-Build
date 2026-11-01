import express, { type Request, type Response, type NextFunction } from "express";
import crypto from "node:crypto";
import type { AppConfig } from "./config/env.js";
import { inspectRequestSchema, buildPlanRequestSchema, companionChatRequestSchema, companionWorkRequestSchema } from "../../shared/contract.js";
import type { HealthResponse, BuildPlanResult, CompanionChatResponse, CompanionWorkResponse } from "../../shared/contract.js";
import { inspectRepository, toRepositorySummary } from "./services/github/github.js";
import { conductResearch } from "./services/researchOrchestrator.js";
import { DexorIntelligenceRouter } from "./services/intelligenceRouter.js";
import { handleCompanionChat, handleCompanionWork } from "./services/companionService.js";
import { verifyPlanAgainstFacts } from "./services/verification.js";
import { AppError, ValidationError, redactSecrets } from "./lib/errors.js";

export function createApp(config: AppConfig) {
  const app = express();

  app.use(express.json({ limit: "2mb" }));

  // CORS for local development
  app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    if (req.method === "OPTIONS") {
      res.sendStatus(200);
      return;
    }
    next();
  });

  // GET /api/health
  app.get("/api/health", (_req: Request, res: Response) => {
    const hasGitHubApp = Boolean(config.githubAppId && config.githubPrivateKeyPath && config.githubInstallationId);
    const hasGitHubToken = Boolean(config.githubToken);
    const health: HealthResponse = {
      status: "ok",
      version: "0.1.0",
      uptimeSeconds: Math.floor(process.uptime()),
      services: {
        tinyfish: { configured: Boolean(config.tinyfishApiKey) },
        gemini: { configured: Boolean(config.geminiApiKey), model: config.geminiModel },
        groq: {
          configured: Boolean(config.groqApiKey),
          models: ["openai/gpt-oss-120b", "qwen/qwen3.8-27b", "openai/gpt-oss-20b"],
        },
        github: { authenticated: hasGitHubApp || hasGitHubToken },
      },
    };
    res.json(health);
  });

  // POST /api/repositories/inspect
  app.post("/api/repositories/inspect", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = inspectRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError("Invalid request body", parsed.error.issues);
      }
      const { repoUrl, request } = parsed.data;
      const ctx = await inspectRepository(repoUrl, request, { config });
      res.json(toRepositorySummary(ctx));
    } catch (err) {
      next(err);
    }
  });

  // POST /api/build/plan
  app.post("/api/build/plan", async (req: Request, res: Response, next: NextFunction) => {
    const totalStart = Date.now();
    try {
      const parsed = buildPlanRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError("Invalid build plan request", parsed.error.issues);
      }
      const { repoUrl, request } = parsed.data;

      // 1. Inspect repository
      const repoStart = Date.now();
      const repoCtx = await inspectRepository(repoUrl, request, { config });
      const repositoryMs = Date.now() - repoStart;

      // 2. Conduct TinyFish research
      const researchStart = Date.now();
      const research = await conductResearch(request, repoCtx, { config });
      const researchMs = Date.now() - researchStart;

      // 3. Reason with Dexor Intelligence Router (Gemini primary -> Groq fallback)
      const reasoningStart = Date.now();
      const executionResult = await DexorIntelligenceRouter.execute(request, repoCtx, research, { config });
      const reasoningMs = Date.now() - reasoningStart;

      // 4. Verification
      const verification = verifyPlanAgainstFacts(executionResult.plan, repoCtx, research);

      const result: BuildPlanResult = {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        request,
        model: executionResult.model,
        provider: executionResult.provider,
        fallbackOccurred: executionResult.fallbackOccurred,
        failedAttempts: executionResult.failedAttempts,
        repository: toRepositorySummary(repoCtx),
        research: {
          status: research.status,
          queries: research.queries,
          queryStrategy: research.queryStrategy,
          preferredDomains: research.preferredDomains,
          searchResults: research.searchResults,
          sources: research.sources.map(s => ({
            id: s.id,
            title: s.title,
            url: s.url,
            finalUrl: s.finalUrl,
            siteName: s.siteName,
            snippet: s.snippet,
            description: s.description,
            contentChars: s.contentChars,
            truncated: s.truncated,
            official: s.official,
            excerpt: s.content.slice(0, 600) + (s.content.length > 600 ? "..." : "")
          })),
          errors: research.errors,
          durationMs: research.durationMs
        },
        plan: executionResult.plan,
        verification,
        timings: {
          repositoryMs,
          researchMs,
          reasoningMs,
          totalMs: Date.now() - totalStart
        }
      };

      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  // POST /api/companion/chat
  app.post("/api/companion/chat", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = companionChatRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError("Invalid companion chat request", parsed.error.issues);
      }
      const response = await handleCompanionChat(parsed.data, { config });
      res.json(response);
    } catch (err) {
      next(err);
    }
  });

  // POST /api/companion/work
  app.post("/api/companion/work", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = companionWorkRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError("Invalid companion work request", parsed.error.issues);
      }
      const response = await handleCompanionWork(parsed.data, { config });
      res.json(response);
    } catch (err) {
      next(err);
    }
  });

  // Global Error Handler
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const secrets = [config.tinyfishApiKey, config.geminiApiKey, config.githubToken].filter(Boolean) as string[];
    const rawMessage = err.message || "An unexpected error occurred.";
    const safeMessage = redactSecrets(rawMessage, secrets);

    if (err instanceof AppError) {
      res.status(err.status).json({
        error: {
          code: err.code,
          message: safeMessage,
          service: err.service,
          retryable: err.retryable,
          details: err.details
        }
      });
      return;
    }

    res.status(500).json({
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: safeMessage,
        service: "server",
        retryable: false
      }
    });
  });

  return app;
}
