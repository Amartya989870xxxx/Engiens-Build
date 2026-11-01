/**
 * Shared API contract between the Express backend and the React client.
 *
 * The backend validates every inbound request and every Gemini response with
 * these schemas. The client only imports *types* from here (`import type`), so
 * no secrets or server code ever reach the browser bundle.
 */
import { z } from "zod";

/* -------------------------------------------------------------------------- */
/* Requests                                                                    */
/* -------------------------------------------------------------------------- */

export const inspectRequestSchema = z.object({
  repoUrl: z.string().trim().min(1, "Repository URL is required").max(500),
  /** Optional build request — used to bias which source files are selected. */
  request: z.string().trim().max(4000).optional(),
});
export type InspectRequest = z.infer<typeof inspectRequestSchema>;

export const buildPlanRequestSchema = z.object({
  repoUrl: z.string().trim().min(1, "Repository URL is required").max(500),
  request: z
    .string()
    .trim()
    .min(12, "Describe the feature or task in at least a sentence")
    .max(4000, "Keep the request under 4000 characters"),
});
export type BuildPlanRequest = z.infer<typeof buildPlanRequestSchema>;

/* -------------------------------------------------------------------------- */
/* Repository context (verified facts gathered from GitHub)                    */
/* -------------------------------------------------------------------------- */

export interface RepoMetadata {
  owner: string;
  name: string;
  fullName: string;
  url: string;
  description: string | null;
  defaultBranch: string;
  stars: number;
  forks: number;
  primaryLanguage: string | null;
  topics: string[];
  license: string | null;
  pushedAt: string | null;
  sizeKb: number;
  isFork: boolean;
  archived: boolean;
}

export interface LanguageShare {
  name: string;
  bytes: number;
  percent: number;
}

/** A technology detected from a manifest file — a verified repository fact. */
export interface DetectedTech {
  name: string;
  category: "framework" | "library" | "tooling" | "testing" | "database" | "runtime" | "language";
  /** File that proves this detection, e.g. `package.json`. */
  evidence: string;
  version?: string;
}

export interface SelectedFile {
  path: string;
  size: number;
  reason: string;
  content: string;
  truncated: boolean;
}

export interface RepositoryContext {
  repo: RepoMetadata;
  languages: LanguageShare[];
  stack: {
    ecosystems: string[];
    technologies: DetectedTech[];
    dependencies: string[];
    manifests: string[];
  };
  tree: {
    totalFiles: number;
    totalDirectories: number;
    truncated: boolean;
    /** Compact ASCII rendering of the directory structure (depth-limited). */
    outline: string;
    /** Every file path in the tree (bounded), used for verification. */
    paths: string[];
  };
  files: SelectedFile[];
  limitations: string[];
  stats: {
    filesConsidered: number;
    filesSelected: number;
    charsIncluded: number;
    githubRequests: number;
  };
}

/** Repository context as sent to the browser (file bodies are omitted). */
export type RepositorySummary = Omit<RepositoryContext, "files" | "tree"> & {
  tree: Omit<RepositoryContext["tree"], "paths">;
  files: Array<Omit<SelectedFile, "content"> & { chars: number }>;
};

/* -------------------------------------------------------------------------- */
/* Research (TinyFish)                                                         */
/* -------------------------------------------------------------------------- */

export interface SearchHit {
  title: string;
  url: string;
  snippet: string;
  siteName: string | null;
  position: number;
  query: string;
  official: boolean;
  score: number;
}

export interface ResearchSource {
  id: string; // S1, S2 ...
  title: string;
  url: string;
  finalUrl: string;
  siteName: string | null;
  snippet: string;
  description: string | null;
  content: string;
  contentChars: number;
  truncated: boolean;
  official: boolean;
}

export interface ResearchError {
  stage: "plan" | "search" | "fetch";
  message: string;
  query?: string;
  url?: string;
}

export interface ResearchResult {
  status: "ok" | "partial" | "failed";
  queries: string[];
  queryStrategy: "gemini" | "heuristic";
  preferredDomains: string[];
  searchResults: SearchHit[];
  sources: ResearchSource[];
  errors: ResearchError[];
  durationMs: number;
}

/** Research as sent to the browser (full page bodies trimmed to a preview). */
export type ResearchSummary = Omit<ResearchResult, "sources"> & {
  sources: Array<Omit<ResearchSource, "content"> & { excerpt: string }>;
};

/* -------------------------------------------------------------------------- */
/* Engineering plan (Gemini structured output)                                 */
/* -------------------------------------------------------------------------- */

const basis = z
  .enum(["documentation", "repository", "reasoning"])
  .describe(
    "documentation = backed by a fetched source (cite sourceUrls); repository = backed by an inspected repository file; reasoning = engineering judgement without direct evidence",
  );

const sourceUrls = z
  .array(z.string())
  .describe("URLs from the provided research sources that support this item. Empty if none.");

export const engineeringPlanSchema = z.object({
  repositoryUnderstanding: z.object({
    summary: z.string(),
    detectedStack: z.array(z.string()),
    architecture: z.string(),
    importantFiles: z.array(z.object({ path: z.string(), role: z.string() })),
    patterns: z.array(z.string()).describe("Existing conventions observed in the inspected code"),
  }),
  requirementInterpretation: z.object({
    summary: z.string(),
    expectedBehaviour: z.array(z.string()),
    assumptions: z.array(z.string()),
    openQuestions: z.array(z.string()),
  }),
  research: z.object({
    findings: z.array(
      z.object({
        finding: z.string(),
        sourceUrls,
        relevance: z.string(),
      }),
    ),
    supportedDecisions: z.array(z.object({ decision: z.string(), sourceUrls })),
    gaps: z.array(z.string()).describe("What the retrieved documentation did NOT cover"),
  }),
  implementationStrategy: z.object({
    overview: z.string(),
    steps: z.array(
      z.object({
        title: z.string(),
        detail: z.string(),
        files: z.array(z.string()),
        basis,
        sourceUrls,
      }),
    ),
    filesToCreate: z.array(z.object({ path: z.string(), reason: z.string() })),
    filesToModify: z.array(z.object({ path: z.string(), reason: z.string() })),
    dependencies: z.array(
      z.object({
        name: z.string(),
        reason: z.string(),
        sourceUrls,
      }),
    ),
  }),
  proposedChanges: z.array(
    z.object({
      path: z.string(),
      changeType: z.enum(["create", "modify", "delete"]),
      language: z.string().describe("Language id for syntax highlighting, e.g. ts, tsx, js, py, json, diff"),
      explanation: z.string(),
      code: z.string().describe("Complete new file for create; focused unified-diff style or the changed section for modify"),
      notes: z.array(z.string()),
      basis,
      sourceUrls,
    }),
  ),
  testing: z.object({
    unit: z.array(z.string()),
    integration: z.array(z.string()),
    edgeCases: z.array(z.string()),
    validationSteps: z.array(z.string()),
  }),
  risks: z.object({
    security: z.array(z.string()),
    compatibility: z.array(z.string()),
    breakingChanges: z.array(z.string()),
    missingInformation: z.array(z.string()),
    tradeoffs: z.array(z.string()),
  }),
});
export type EngineeringPlan = z.infer<typeof engineeringPlanSchema>;

/** Server-side checks of the model output against verified facts. */
export interface PlanVerification {
  /** Cited URLs that were not among the retrieved research sources. */
  unknownCitations: string[];
  /** Files the model wants to modify that do not exist in the repository tree. */
  modifiedFilesNotInRepo: string[];
  /** Files the model wants to create that already exist. */
  createdFilesAlreadyExist: string[];
  /** Important files the model referenced that are not in the repository tree. */
  referencedFilesNotInRepo: string[];
  warnings: string[];
}

export interface BuildPlanResult {
  id: string;
  createdAt: string;
  request: string;
  model: string;
  provider: "gemini" | "groq";
  fallbackOccurred: boolean;
  failedAttempts: number;
  repository: RepositorySummary;
  research: ResearchSummary;
  plan: EngineeringPlan;
  verification: PlanVerification;
  timings: { repositoryMs: number; researchMs: number; reasoningMs: number; totalMs: number };
}

/* -------------------------------------------------------------------------- */
/* Streaming progress protocol (NDJSON)                                        */
/* -------------------------------------------------------------------------- */

export type PlanStage = "repository" | "research-plan" | "search" | "fetch" | "reasoning" | "validation";

export type PlanStreamEvent =
  | { type: "stage"; stage: PlanStage; status: "running" | "done" | "warning" | "error"; detail?: string }
  | { type: "result"; data: BuildPlanResult }
  | { type: "error"; error: ApiErrorBody["error"] };

/* -------------------------------------------------------------------------- */
/* Errors & health                                                             */
/* -------------------------------------------------------------------------- */

export type ErrorService = "github" | "tinyfish" | "gemini" | "config" | "validation" | "server";

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    service: ErrorService;
    retryable: boolean;
    details?: unknown;
  };
}

export interface HealthResponse {
  status: "ok";
  version: string;
  uptimeSeconds: number;
  services: {
    tinyfish: { configured: boolean };
    gemini: { configured: boolean; model: string };
    groq: { configured: boolean; models: string[] };
    github: { authenticated: boolean };
  };
}

/* -------------------------------------------------------------------------- */
/* Dexor Browser Companion Contracts                                          */
/* -------------------------------------------------------------------------- */

export interface CapturedPageContext {
  url: string;
  title: string;
  domain: string;
  selectedText?: string;
  pageContent: string;
  contentLength?: number;
  capturedAt?: string;
}

export const capturedPageContextSchema = z.object({
  url: z.string().url().max(2000),
  title: z.string().max(500),
  domain: z.string().max(255),
  selectedText: z.string().max(10000).optional(),
  pageContent: z.string().max(50000),
  contentLength: z.number().int().nonnegative().optional(),
  capturedAt: z.string().optional(),
});

export const companionChatRequestSchema = z.object({
  message: z.string().trim().min(1, "Message cannot be empty").max(4000),
  pageContext: capturedPageContextSchema.optional(),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(10000),
      })
    )
    .max(20)
    .optional(),
  triggerResearch: z.boolean().optional(),
});
export type CompanionChatRequest = z.infer<typeof companionChatRequestSchema>;

export interface CompanionSourceItem {
  id: number;
  title: string;
  url: string;
  snippet?: string;
  official?: boolean;
}

export interface CompanionChatResponse {
  id: string;
  reply: string;
  sources: CompanionSourceItem[];
  researchPerformed: boolean;
  researchQuery?: string;
  model: string;
  provider: "gemini" | "groq";
  fallbackOccurred: boolean;
  createdAt: string;
}

export const companionWorkRequestSchema = z.object({
  task: z.string().trim().min(5, "Describe the engineering task").max(4000),
  repoUrl: z.string().trim().max(500).optional(),
  pageContext: capturedPageContextSchema.optional(),
});
export type CompanionWorkRequest = z.infer<typeof companionWorkRequestSchema>;

export interface CompanionWorkRecommendation {
  taskSummary: string;
  architectureAlignment: {
    stackSummary: string;
    detectedTechnologies: string[];
    architecturePattern: string;
  };
  implementationApproach: {
    overview: string;
    steps: Array<{
      title: string;
      description: string;
      relevantFiles: string[];
    }>;
  };
  targetFiles: Array<{
    path: string;
    action: "create" | "modify";
    reason: string;
  }>;
  codeSnippet?: {
    language: string;
    description: string;
    code: string;
  };
  testingStrategy: string[];
  risksAndSecurity: string[];
}

export interface CompanionWorkResponse {
  id: string;
  recommendation: CompanionWorkRecommendation;
  repoSummary?: {
    fullName: string;
    primaryLanguage: string | null;
    stars: number;
    filesCount: number;
  };
  sources: CompanionSourceItem[];
  researchPerformed: boolean;
  workspaceContinuationUrl: string;
  model: string;
  provider: "gemini" | "groq";
  fallbackOccurred: boolean;
  createdAt: string;
}
