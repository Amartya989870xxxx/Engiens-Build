import type { ResearchResult, ResearchSource, SearchHit } from "../../../shared/contract.js";
import type { RepositoryContext } from "../../../shared/contract.js";
import type { TinyFishDeps } from "./tinyfish.js";
import { tinyfishFetch, tinyfishSearch } from "./tinyfish.js";
import { truncate } from "../lib/http.js";

const MAX_FETCH_CANDIDATES = 3;
const PER_SOURCE_CHAR_LIMIT = 10_000;

const OFFICIAL_DOMAINS = [
  "docs.", "developer.", "dev.", "api.", "help.", "github.com",
  "razorpay.com", "stripe.com", "twilio.com", "aws.amazon.com",
  "cloud.google.com", "firebase.google.com", "supabase.com",
  "auth0.com", "prisma.io", "nextjs.org", "react.dev",
  "expressjs.com", "fastify.dev", "python.org", "pypi.org", "npmjs.com"
];

export function buildSearchQueries(request: string, repo: RepositoryContext): { queries: string[]; preferredDomains: string[] } {
  const primaryLang = repo.repo.primaryLanguage || (repo.stack.ecosystems[0] ?? "");
  const topFramework = repo.stack.technologies.find(t => t.category === "framework")?.name || "";

  // 1. Direct targeted query with tech stack
  const query1 = `${request} ${topFramework} ${primaryLang} documentation`.trim().replace(/\s+/g, " ");

  // 2. Focused official API / SDK query
  const query2 = `${request} official docs API integration`.trim().replace(/\s+/g, " ");

  const queries = [query1];
  if (query2 !== query1) queries.push(query2);

  return {
    queries,
    preferredDomains: OFFICIAL_DOMAINS
  };
}

export function rankAndFilterSearchResults(hits: SearchHit[]): SearchHit[] {
  const seen = new Set<string>();
  const uniqueHits: SearchHit[] = [];

  for (const hit of hits) {
    try {
      const parsed = new URL(hit.url);
      const host = parsed.hostname.toLowerCase();
      // Skip social/forums/irrelevant
      if (host.includes("reddit.com") || host.includes("twitter.com") || host.includes("quora.com") || host.includes("youtube.com")) {
        continue;
      }
      const normUrl = `${parsed.protocol}//${parsed.host}${parsed.pathname}`.replace(/\/$/, "");
      if (seen.has(normUrl)) continue;
      seen.add(normUrl);

      const isOfficial = OFFICIAL_DOMAINS.some(d => host.includes(d));
      uniqueHits.push({
        ...hit,
        official: isOfficial,
        score: (hit.official ? 20 : 0) + (10 - Math.min(hit.position, 10))
      });
    } catch {
      // invalid URL
    }
  }

  return uniqueHits.sort((a, b) => b.score - a.score);
}

export async function conductResearch(
  request: string,
  repo: RepositoryContext,
  deps: TinyFishDeps,
  onProgress?: (msg: string) => void
): Promise<ResearchResult> {
  const startTime = Date.now();
  const { queries, preferredDomains } = buildSearchQueries(request, repo);
  const searchResults: SearchHit[] = [];
  const errors: ResearchResult["errors"] = [];

  onProgress?.(`Starting web research across ${queries.length} queries...`);

  for (const q of queries) {
    try {
      onProgress?.(`Searching: "${q}"...`);
      const hits = await tinyfishSearch(q, deps, `Official documentation and API reference for: ${request}`);
      for (const h of hits) {
        searchResults.push({
          title: h.title,
          url: h.url,
          snippet: h.snippet,
          siteName: h.siteName,
          position: h.position,
          query: q,
          official: OFFICIAL_DOMAINS.some(d => h.url.toLowerCase().includes(d)),
          score: 0
        });
      }
    } catch (err: any) {
      errors.push({ stage: "search", message: err.message || "Search failed", query: q });
    }
  }

  const ranked = rankAndFilterSearchResults(searchResults);
  const candidatesToFetch = ranked.slice(0, MAX_FETCH_CANDIDATES);
  const sources: ResearchSource[] = [];

  if (candidatesToFetch.length > 0) {
    onProgress?.(`Fetching content for ${candidatesToFetch.length} selected documentation sources...`);
    try {
      const fetchRes = await tinyfishFetch(candidatesToFetch.map(c => c.url), deps);
      for (const [idx, page] of fetchRes.pages.entries()) {
        const hit = candidatesToFetch.find(c => c.url === page.url) || candidatesToFetch[idx];
        const truncatedContent = truncate(page.text, PER_SOURCE_CHAR_LIMIT);
        sources.push({
          id: `S${idx + 1}`,
          title: page.title || hit?.title || page.url,
          url: page.url,
          finalUrl: page.finalUrl,
          siteName: hit?.siteName || null,
          snippet: hit?.snippet || "",
          description: page.description || null,
          content: truncatedContent.text,
          contentChars: truncatedContent.text.length,
          truncated: truncatedContent.truncated,
          official: Boolean(hit?.official)
        });
      }
      for (const fe of fetchRes.errors) {
        errors.push({ stage: "fetch", message: fe.error, url: fe.url });
      }
    } catch (err: any) {
      errors.push({ stage: "fetch", message: err.message || "Fetch failed" });
    }
  }

  return {
    status: sources.length > 0 ? "ok" : errors.length > 0 ? "failed" : "partial",
    queries,
    queryStrategy: "heuristic",
    preferredDomains,
    searchResults: ranked,
    sources,
    errors,
    durationMs: Date.now() - startTime
  };
}
