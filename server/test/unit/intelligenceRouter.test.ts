import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  DexorIntelligenceRouter,
  classifyAIError,
  DEFAULT_AI_CANDIDATE_MODELS,
  type IntelligenceRouterDeps,
} from "../../src/services/intelligenceRouter.js";
import type { AppConfig } from "../../src/config/env.js";
import type { RepositoryContext, ResearchResult, EngineeringPlan } from "../../../shared/contract.js";

const mockValidPlan: EngineeringPlan = {
  repositoryUnderstanding: {
    summary: "Standard TypeScript app",
    detectedStack: ["Node.js", "TypeScript"],
    architecture: "Modular monolith",
    importantFiles: [{ path: "src/index.ts", role: "Entrypoint" }],
    patterns: ["Factory pattern"],
  },
  requirementInterpretation: {
    summary: "Add new endpoint",
    expectedBehaviour: ["Returns 200"],
    assumptions: ["Node 22 runtime"],
    openQuestions: [],
  },
  research: {
    findings: [{ finding: "Use headers", sourceUrls: ["https://docs.tinyfish.ai"], relevance: "Auth" }],
    supportedDecisions: [{ decision: "Use bearer auth", sourceUrls: ["https://docs.tinyfish.ai"] }],
    gaps: [],
  },
  implementationStrategy: {
    overview: "Implement feature cleanly",
    steps: [{ title: "Step 1", detail: "Write handler", files: ["src/feature.ts"], basis: "reasoning", sourceUrls: [] }],
    filesToCreate: [{ path: "src/feature.ts", reason: "Feature logic" }],
    filesToModify: [],
    dependencies: [],
  },
  proposedChanges: [
    {
      path: "src/feature.ts",
      changeType: "create",
      language: "ts",
      explanation: "Add new feature handler",
      code: "export const feature = true;",
      notes: [],
      basis: "reasoning",
      sourceUrls: [],
    },
  ],
  testing: {
    unit: ["test feature handler"],
    integration: [],
    edgeCases: [],
    validationSteps: ["verify HTTP 200"],
  },
  risks: {
    security: [],
    compatibility: [],
    breakingChanges: [],
    missingInformation: [],
    tradeoffs: [],
  },
};

const mockRepoContext: RepositoryContext = {
  repo: {
    owner: "test-org",
    name: "test-repo",
    fullName: "test-org/test-repo",
    url: "https://github.com/test-org/test-repo",
    description: "A test repo",
    defaultBranch: "main",
    stars: 10,
    forks: 2,
    primaryLanguage: "TypeScript",
    topics: ["test"],
    license: "MIT",
    pushedAt: "2026-01-01T00:00:00Z",
    sizeKb: 100,
    isFork: false,
    archived: false,
  },
  languages: [{ name: "TypeScript", bytes: 1000, percent: 100 }],
  stack: {
    ecosystems: ["Node.js"],
    technologies: [{ name: "vitest", category: "testing", evidence: "package.json" }],
    dependencies: ["vitest"],
    manifests: ["package.json"],
  },
  tree: {
    totalFiles: 2,
    totalDirectories: 1,
    truncated: false,
    outline: "src/\n  index.ts\npackage.json",
    paths: ["package.json", "src/index.ts"],
  },
  files: [
    {
      path: "src/index.ts",
      size: 25,
      reason: "Primary entrypoint",
      content: "console.log('test');",
      truncated: false,
    },
  ],
  limitations: [],
  stats: {
    filesConsidered: 2,
    filesSelected: 1,
    charsIncluded: 25,
    githubRequests: 2,
  },
};

const mockResearch: ResearchResult = {
  status: "ok",
  queries: ["test query"],
  queryStrategy: "heuristic",
  preferredDomains: [],
  searchResults: [],
  sources: [],
  errors: [],
  durationMs: 100,
};

const mockConfig: AppConfig = {
  tinyfishApiKey: "tf-test",
  geminiApiKey: "gemini-test",
  geminiModel: "gemini-3.8-flash",
  groqApiKey: "gsk-test",
  githubToken: undefined,
  githubAppId: undefined,
  githubInstallationId: undefined,
  githubPrivateKeyPath: undefined,
  port: 8787,
  nodeEnv: "test",
};

describe("DexorIntelligenceRouter", () => {
  beforeEach(() => {
    DexorIntelligenceRouter.clearCooldowns();
    vi.clearAllMocks();
  });

  describe("Error Classification", () => {
    it("classifies 401 and invalid api key as AUTH_INVALID (non-retryable)", () => {
      const res = classifyAIError({ status: 401, message: "Invalid API Key" });
      expect(res.category).toBe("AUTH_INVALID");
      expect(res.retryable).toBe(false);
      expect(res.isProjectExhausted).toBe(false);
    });

    it("classifies 429 rate limit as RATE_LIMITED (retryable)", () => {
      const res = classifyAIError({ status: 429, message: "Too many requests" });
      expect(res.category).toBe("RATE_LIMITED");
      expect(res.retryable).toBe(true);
      expect(res.isProjectExhausted).toBe(false);
    });

    it("detects project quota exhaustion correctly", () => {
      const res = classifyAIError({
        status: 429,
        message: "Resource has been exhausted (e.g. check quota)",
      });
      expect(res.category).toBe("QUOTA_EXHAUSTED");
      expect(res.retryable).toBe(true);
      expect(res.isProjectExhausted).toBe(true);
    });

    it("classifies 503 as SERVICE_UNAVAILABLE (retryable)", () => {
      const res = classifyAIError({ status: 503, message: "Model is overloaded" });
      expect(res.category).toBe("SERVICE_UNAVAILABLE");
      expect(res.retryable).toBe(true);
    });

    it("classifies 404 as MODEL_UNAVAILABLE (retryable)", () => {
      const res = classifyAIError({ status: 404, message: "models/gemini-old is not found" });
      expect(res.category).toBe("MODEL_UNAVAILABLE");
      expect(res.retryable).toBe(true);
    });
  });

  describe("Routing & Fallback Execution", () => {
    it("succeeds with Gemini primary model on first attempt", async () => {
      const deps: IntelligenceRouterDeps = {
        config: mockConfig,
        geminiCallImpl: vi.fn().mockResolvedValue(JSON.stringify(mockValidPlan)),
      };

      const result = await DexorIntelligenceRouter.execute(
        "Build feature",
        mockRepoContext,
        mockResearch,
        deps
      );

      expect(result.provider).toBe("gemini");
      expect(result.model).toBe("gemini-3.8-flash");
      expect(result.fallbackOccurred).toBe(false);
      expect(result.failedAttempts).toBe(0);
      expect(result.plan.implementationStrategy.overview).toBe("Implement feature cleanly");
      expect(deps.geminiCallImpl).toHaveBeenCalledTimes(1);
    });

    it("falls back to gemini-3.5-flash when primary model encounters rate limit", async () => {
      const mockGemini = vi
        .fn()
        .mockRejectedValueOnce({ status: 429, message: "Rate limit reached for gemini-3.8-flash" })
        .mockResolvedValueOnce(JSON.stringify(mockValidPlan));

      const deps: IntelligenceRouterDeps = {
        config: mockConfig,
        geminiCallImpl: mockGemini,
      };

      const result = await DexorIntelligenceRouter.execute(
        "Build feature",
        mockRepoContext,
        mockResearch,
        deps
      );

      expect(result.provider).toBe("gemini");
      expect(result.model).toBe("gemini-3.5-flash");
      expect(result.fallbackOccurred).toBe(true);
      expect(result.failedAttempts).toBe(1);
      expect(mockGemini).toHaveBeenCalledTimes(2);
    });

    it("skips all remaining Gemini models and switches directly to Groq when Gemini project quota is exhausted", async () => {
      const mockGemini = vi.fn().mockRejectedValue({
        status: 429,
        message: "RESOURCE_EXHAUSTED: quota exceeded for project 123456",
      });

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: JSON.stringify(mockValidPlan) } }],
        }),
      });

      const deps: IntelligenceRouterDeps = {
        config: mockConfig,
        geminiCallImpl: mockGemini,
        fetchImpl: mockFetch as any,
      };

      const result = await DexorIntelligenceRouter.execute(
        "Build feature",
        mockRepoContext,
        mockResearch,
        deps
      );

      expect(result.provider).toBe("groq");
      expect(result.model).toBe("openai/gpt-oss-120b");
      expect(result.fallbackOccurred).toBe(true);
      // Gemini should only be attempted ONCE because quota exhaustion skips remaining gemini models
      expect(mockGemini).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("falls back from Groq primary to Groq secondary model on 429", async () => {
      const mockGemini = vi.fn().mockRejectedValue({
        status: 429,
        message: "RESOURCE_EXHAUSTED: quota exceeded",
      });

      let groqCallCount = 0;
      const mockFetch = vi.fn().mockImplementation(async () => {
        groqCallCount++;
        if (groqCallCount === 1) {
          return {
            ok: false,
            status: 429,
            text: async () => JSON.stringify({ error: { message: "Groq rate limit exceeded" } }),
          };
        }
        return {
          ok: true,
          json: async () => ({
            choices: [{ message: { content: JSON.stringify(mockValidPlan) } }],
          }),
        };
      });

      const deps: IntelligenceRouterDeps = {
        config: mockConfig,
        geminiCallImpl: mockGemini,
        fetchImpl: mockFetch as any,
      };

      const result = await DexorIntelligenceRouter.execute(
        "Build feature",
        mockRepoContext,
        mockResearch,
        deps
      );

      expect(result.provider).toBe("groq");
      expect(result.model).toBe("qwen/qwen3.8-27b");
      expect(result.fallbackOccurred).toBe(true);
      expect(groqCallCount).toBe(2);
    });

    it("strips markdown code fencing from JSON outputs cleanly", async () => {
      const fencedJson = "```json\n" + JSON.stringify(mockValidPlan) + "\n```";
      const deps: IntelligenceRouterDeps = {
        config: mockConfig,
        geminiCallImpl: vi.fn().mockResolvedValue(fencedJson),
      };

      const result = await DexorIntelligenceRouter.execute(
        "Build feature",
        mockRepoContext,
        mockResearch,
        deps
      );

      expect(result.plan.implementationStrategy.overview).toBe("Implement feature cleanly");
    });

    it("throws ALL_AI_PROVIDERS_EXHAUSTED when all candidates fail", async () => {
      const mockGemini = vi.fn().mockRejectedValue({ status: 503, message: "Gemini down" });
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        text: async () => "Groq down",
      });

      const deps: IntelligenceRouterDeps = {
        config: mockConfig,
        geminiCallImpl: mockGemini,
        fetchImpl: mockFetch as any,
      };

      await expect(
        DexorIntelligenceRouter.execute("Build feature", mockRepoContext, mockResearch, deps)
      ).rejects.toThrowError(/All configured AI reasoning providers failed/i);
    });

    it("respects model cooldowns and skips recently cooled down candidates", async () => {
      // Cooldown the primary gemini model
      DexorIntelligenceRouter.setCooldown("gemini:gemini-3.8-flash", 60_000);

      const mockGemini = vi.fn().mockResolvedValue(JSON.stringify(mockValidPlan));

      const deps: IntelligenceRouterDeps = {
        config: mockConfig,
        geminiCallImpl: mockGemini,
      };

      const result = await DexorIntelligenceRouter.execute(
        "Build feature",
        mockRepoContext,
        mockResearch,
        deps
      );

      // It skipped 3.8-flash and immediately picked 3.5-flash
      expect(result.model).toBe("gemini-3.5-flash");
      expect(mockGemini).toHaveBeenCalledTimes(1);
    });

    it("skips Groq models when groqApiKey is not provided", async () => {
      const configWithoutGroq: AppConfig = {
        ...mockConfig,
        groqApiKey: undefined,
      };

      const mockGemini = vi.fn().mockRejectedValue({
        status: 429,
        message: "quota exceeded",
      });

      const mockFetch = vi.fn();

      const deps: IntelligenceRouterDeps = {
        config: configWithoutGroq,
        geminiCallImpl: mockGemini,
        fetchImpl: mockFetch as any,
      };

      await expect(
        DexorIntelligenceRouter.execute("Build feature", mockRepoContext, mockResearch, deps)
      ).rejects.toThrowError(/All configured AI reasoning providers failed/i);

      // Groq was skipped so fetchImpl was never called
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });
});
