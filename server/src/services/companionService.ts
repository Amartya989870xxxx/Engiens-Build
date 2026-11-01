import crypto from "node:crypto";
import type { AppConfig } from "../config/env.js";
import type {
  CompanionChatRequest,
  CompanionChatResponse,
  CompanionWorkRequest,
  CompanionWorkResponse,
  CompanionSourceItem,
  CompanionWorkRecommendation,
  SearchHit,
} from "../../../shared/contract.js";
import { z } from "zod";
import { tinyfishSearch, tinyfishFetch } from "./tinyfish.js";
import { rankAndFilterSearchResults } from "./researchOrchestrator.js";
import { DexorIntelligenceRouter } from "./intelligenceRouter.js";
import { inspectRepository } from "./github/github.js";

export interface CompanionServiceDeps {
  config: AppConfig;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}

const workRecommendationSchema = z.object({
  taskSummary: z.string(),
  architectureAlignment: z.object({
    stackSummary: z.string(),
    detectedTechnologies: z.array(z.string()),
    architecturePattern: z.string(),
  }),
  implementationApproach: z.object({
    overview: z.string(),
    steps: z.array(
      z.object({
        title: z.string(),
        description: z.string(),
        relevantFiles: z.array(z.string()),
      })
    ),
  }),
  targetFiles: z.array(
    z.object({
      path: z.string(),
      action: z.enum(["create", "modify"]),
      reason: z.string(),
    })
  ),
  codeSnippet: z
    .object({
      language: z.string(),
      description: z.string(),
      code: z.string(),
    })
    .optional(),
  testingStrategy: z.array(z.string()),
  risksAndSecurity: z.array(z.string()),
});

/**
 * Determines whether TinyFish web research should be triggered.
 */
function shouldTriggerResearch(userMessage: string, triggerOverride?: boolean): boolean {
  if (triggerOverride !== undefined) return triggerOverride;

  const msg = userMessage.toLowerCase();
  const researchSignals = [
    "doc",
    "docs",
    "documentation",
    "api",
    "sdk",
    "integration",
    "integrate",
    "how to",
    "latest",
    "version",
    "endpoint",
    "webhook",
    "guide",
    "tutorial",
    "razorpay",
    "stripe",
    "auth0",
    "express",
    "react",
    "prisma",
    "tailwind",
    "firebase",
    "github",
  ];

  return researchSignals.some((signal) => msg.includes(signal));
}

export async function handleCompanionChat(
  req: CompanionChatRequest,
  deps: CompanionServiceDeps
): Promise<CompanionChatResponse> {
  const needsResearch = shouldTriggerResearch(req.message, req.triggerResearch);
  const sources: CompanionSourceItem[] = [];
  let researchQuery: string | undefined;

  // 1. Conduct TinyFish research if needed and key is configured
  if (needsResearch && deps.config.tinyfishApiKey) {
    try {
      const pageDomain = req.pageContext?.domain || "";
      researchQuery = `${req.message} ${pageDomain}`.trim().slice(0, 150);

      const searchHits = await tinyfishSearch(researchQuery, {
        config: deps.config,
        fetchImpl: deps.fetchImpl,
        signal: deps.signal,
      });

      const hits: SearchHit[] = searchHits.map((h) => ({
        title: h.title,
        url: h.url,
        snippet: h.snippet,
        siteName: h.siteName,
        position: h.position,
        query: researchQuery!,
        official: false,
        score: 0,
      }));

      const ranked = rankAndFilterSearchResults(hits).slice(0, 3);
      const urlsToFetch = ranked.map((r) => r.url);

      let fetchedTexts: Record<string, string> = {};
      if (urlsToFetch.length > 0) {
        try {
          const fetchRes = await tinyfishFetch(urlsToFetch, {
            config: deps.config,
            fetchImpl: deps.fetchImpl,
            signal: deps.signal,
          });
          for (const item of fetchRes.pages) {
            fetchedTexts[item.url] = item.text || item.title || "";
          }
        } catch {
          // Fallback to snippets if fetch fails
        }
      }

      ranked.forEach((r, idx) => {
        sources.push({
          id: idx + 1,
          title: r.title || r.siteName || "Official Documentation",
          url: r.url,
          snippet: fetchedTexts[r.url]?.slice(0, 500) || r.snippet || "",
          official: r.official,
        });
      });
    } catch (err: any) {
      console.warn("[Dexor Companion] TinyFish research notice:", err.message);
    }
  }

  // 2. Build companion prompt
  const systemPrompt = `You are Dexor, the web-aware AI engineering companion for Engiens Build.
You work alongside developers directly inside their browser as an authoritative, concise, and technically rigorous senior engineer.
Always deliver practical, actionable engineering guidance with code examples when helpful.
When citing facts or documentation retrieved via TinyFish or from the captured webpage, refer to them clearly.
Format your responses using clean GitHub-flavored markdown.`;

  let prompt = `USER REQUEST:\n${req.message}\n\n`;

  if (req.pageContext) {
    prompt += `ACTIVE WEBPAGE CONTEXT:\n`;
    prompt += `- Title: ${req.pageContext.title}\n`;
    prompt += `- URL: ${req.pageContext.url}\n`;
    prompt += `- Domain: ${req.pageContext.domain}\n`;
    if (req.pageContext.selectedText) {
      prompt += `- Selected Text:\n"""\n${req.pageContext.selectedText}\n"""\n`;
    }
    prompt += `- Captured Page Content (Excerpt):\n"""\n${req.pageContext.pageContent.slice(0, 12000)}\n"""\n\n`;
  }

  if (sources.length > 0) {
    prompt += `TINYFISH RETRIEVED SOURCES:\n`;
    sources.forEach((s) => {
      prompt += `[Source ${s.id}]: ${s.title} (${s.url})\n${s.snippet}\n\n`;
    });
  }

  if (req.history && req.history.length > 0) {
    prompt += `PREVIOUS MESSAGES IN SESSION:\n`;
    req.history.slice(-6).forEach((h) => {
      prompt += `${h.role === "user" ? "Developer" : "Dexor"}: ${h.content}\n`;
    });
    prompt += `\n`;
  }

  // 3. Execute through DexorIntelligenceRouter (Gemini primary -> Groq fallback)
  const routerRes = await DexorIntelligenceRouter.executeText(prompt, systemPrompt, {
    config: deps.config,
    fetchImpl: deps.fetchImpl,
    signal: deps.signal,
  });

  return {
    id: crypto.randomUUID(),
    reply: routerRes.text,
    sources,
    researchPerformed: sources.length > 0,
    researchQuery,
    model: routerRes.model,
    provider: routerRes.provider,
    fallbackOccurred: routerRes.fallbackOccurred,
    createdAt: new Date().toISOString(),
  };
}

export async function handleCompanionWork(
  req: CompanionWorkRequest,
  deps: CompanionServiceDeps
): Promise<CompanionWorkResponse> {
  const sources: CompanionSourceItem[] = [];
  let repoSummary: CompanionWorkResponse["repoSummary"] | undefined;
  let repoOutline = "";
  let detectedStack: string[] = [];

  // 1. Inspect repository if repoUrl is provided
  if (req.repoUrl) {
    try {
      const repoCtx = await inspectRepository(req.repoUrl, req.task, {
        config: deps.config,
        fetchImpl: deps.fetchImpl,
        signal: deps.signal,
      });

      repoSummary = {
        fullName: repoCtx.repo.fullName,
        primaryLanguage: repoCtx.repo.primaryLanguage,
        stars: repoCtx.repo.stars,
        filesCount: repoCtx.tree.totalFiles,
      };

      repoOutline = repoCtx.tree.outline;
      detectedStack = repoCtx.stack.technologies.map((t) => `${t.name} (${t.category})`);
    } catch (err: any) {
      console.warn("[Dexor Companion] Repo inspect notice:", err.message);
    }
  }

  // 2. Perform TinyFish research
  if (deps.config.tinyfishApiKey) {
    try {
      const query = `${req.task} ${req.pageContext?.domain || ""} integration docs`.trim().slice(0, 150);
      const searchRes = await tinyfishSearch(query, {
        config: deps.config,
        fetchImpl: deps.fetchImpl,
        signal: deps.signal,
      });

      const hits: SearchHit[] = searchRes.map((h) => ({
        title: h.title,
        url: h.url,
        snippet: h.snippet,
        siteName: h.siteName,
        position: h.position,
        query,
        official: false,
        score: 0,
      }));

      const ranked = rankAndFilterSearchResults(hits).slice(0, 3);
      ranked.forEach((r, idx) => {
        sources.push({
          id: idx + 1,
          title: r.title || r.siteName || "Official Reference",
          url: r.url,
          snippet: r.snippet || "",
          official: r.official,
        });
      });
    } catch (err: any) {
      console.warn("[Dexor Companion] Work research notice:", err.message);
    }
  }

  // 3. Construct structured prompt
  const systemPrompt = `You are Dexor, the web-aware AI engineering teammate for Engiens Build.
You are generating a structured, actionable engineering recommendation for a developer based on their active task, browser context, and repository context.
Output ONLY valid JSON strictly matching the requested schema.`;

  let prompt = `ENGINEERING TASK:\n${req.task}\n\n`;

  if (req.pageContext) {
    prompt += `CAPTURED WEBPAGE / DOCUMENTATION:\n`;
    prompt += `URL: ${req.pageContext.url}\n`;
    prompt += `Title: ${req.pageContext.title}\n`;
    prompt += `Content: ${req.pageContext.pageContent.slice(0, 8000)}\n\n`;
  }

  if (repoSummary) {
    prompt += `REPOSITORY CONTEXT (${repoSummary.fullName}):\n`;
    prompt += `Primary Language: ${repoSummary.primaryLanguage}\n`;
    prompt += `Detected Stack: ${detectedStack.join(", ")}\n`;
    prompt += `Structure Outline:\n${repoOutline.slice(0, 3000)}\n\n`;
  }

  if (sources.length > 0) {
    prompt += `TINYFISH RESEARCH REFERENCES:\n`;
    sources.forEach((s) => {
      prompt += `[${s.id}] ${s.title}: ${s.url}\n`;
    });
    prompt += `\n`;
  }

  prompt += `Provide a JSON object adhering to:
{
  "taskSummary": "Concise summary of requirement",
  "architectureAlignment": {
    "stackSummary": "How this relates to the stack",
    "detectedTechnologies": ["tech1", "tech2"],
    "architecturePattern": "Pattern to use"
  },
  "implementationApproach": {
    "overview": "High level strategy",
    "steps": [
      { "title": "Step title", "description": "Details", "relevantFiles": ["path/to/file"] }
    ]
  },
  "targetFiles": [
    { "path": "path/file.ts", "action": "create"|"modify", "reason": "Explanation" }
  ],
  "codeSnippet": {
    "language": "javascript",
    "description": "Snippet description",
    "code": "// Implementation snippet"
  },
  "testingStrategy": ["Unit test 1", "Integration test 2"],
  "risksAndSecurity": ["Security note", "Edge case"]
}`;

  const routerRes = await DexorIntelligenceRouter.executeJson<CompanionWorkRecommendation>(
    prompt,
    systemPrompt,
    workRecommendationSchema,
    {
      config: deps.config,
      fetchImpl: deps.fetchImpl,
      signal: deps.signal,
    }
  );

  const continuationParams = new URLSearchParams();
  if (req.repoUrl) continuationParams.set("repoUrl", req.repoUrl);
  continuationParams.set("request", req.task);

  const workspaceContinuationUrl = `http://localhost:5173/?${continuationParams.toString()}`;

  return {
    id: crypto.randomUUID(),
    recommendation: routerRes.data,
    repoSummary,
    sources,
    researchPerformed: sources.length > 0,
    workspaceContinuationUrl,
    model: routerRes.model,
    provider: routerRes.provider,
    fallbackOccurred: routerRes.fallbackOccurred,
    createdAt: new Date().toISOString(),
  };
}
