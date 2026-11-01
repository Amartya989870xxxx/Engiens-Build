/**
 * TinyFish REST client (Search + Fetch).
 *
 * Contract verified against the official docs (docs.tinyfish.ai/search-api and
 * docs.tinyfish.ai/fetch-api):
 *  - Search: GET https://api.search.tinyfish.ai?query=…  (X-API-Key header)
 *            → { query, results: [{ position, site_name, title, snippet, url }], total_results, page }
 *  - Fetch:  POST https://api.fetch.tinyfish.ai  body { urls: [...≤10], format }
 *            → { results: [{ url, final_url, title, description, language, format, text }], errors: [{ url, error }] }
 *            Per-URL failures arrive in `errors[]` alongside HTTP 200.
 *
 * The application authenticates with its own TINYFISH_API_KEY; it does not
 * depend on the IDE's MCP proxy.
 */
import { z } from "zod";
import type { AppConfig } from "../config/env.js";
import { requireTinyFishKey } from "../config/env.js";
import { invalidResponseError, upstreamError } from "../lib/errors.js";
import { type FetchLike, readTextLimited, timedFetch } from "../lib/http.js";

export const TINYFISH_SEARCH_URL = "https://api.search.tinyfish.ai";
export const TINYFISH_FETCH_URL = "https://api.fetch.tinyfish.ai";

const SEARCH_TIMEOUT_MS = 15_000;
const FETCH_TIMEOUT_MS = 60_000;
const MAX_RESPONSE_BYTES = 4_000_000;
export const MAX_FETCH_URLS = 10;

const searchResponseSchema = z.object({
  query: z.string().optional(),
  results: z.array(
    z.object({
      position: z.number().optional(),
      site_name: z.string().nullable().optional(),
      title: z.string().nullable().optional(),
      snippet: z.string().nullable().optional(),
      url: z.string(),
      date: z.string().nullable().optional(),
    }),
  ),
  total_results: z.number().optional(),
  page: z.number().optional(),
});

const fetchResponseSchema = z.object({
  results: z.array(
    z.object({
      url: z.string(),
      final_url: z.string().nullable().optional(),
      title: z.string().nullable().optional(),
      description: z.string().nullable().optional(),
      language: z.string().nullable().optional(),
      format: z.string().nullable().optional(),
      text: z.unknown().optional(),
    }),
  ),
  errors: z
    .array(z.object({ url: z.string().optional(), error: z.unknown().optional() }).passthrough())
    .optional()
    .default([]),
});

export interface TinyFishSearchResult {
  position: number;
  title: string;
  url: string;
  snippet: string;
  siteName: string | null;
}

export interface TinyFishPage {
  url: string;
  finalUrl: string;
  title: string | null;
  description: string | null;
  text: string;
}

export interface TinyFishFetchResult {
  pages: TinyFishPage[];
  errors: Array<{ url: string; error: string }>;
}

export interface TinyFishDeps {
  config: AppConfig;
  fetchImpl?: FetchLike;
  signal?: AbortSignal;
}

/** Builds the Search request URL exactly as documented. Exported for tests. */
export function buildSearchUrl(query: string, purpose?: string): string {
  const url = new URL(TINYFISH_SEARCH_URL);
  url.searchParams.set("query", query);
  if (purpose) url.searchParams.set("purpose", purpose.slice(0, 2000));
  return url.toString();
}

async function parseJson(res: Response, context: string): Promise<unknown> {
  const { text, truncated } = await readTextLimited(res, MAX_RESPONSE_BYTES);
  if (truncated) throw invalidResponseError("tinyfish", `${context} (response exceeded size limit)`);
  try {
    return JSON.parse(text);
  } catch {
    throw invalidResponseError("tinyfish", context);
  }
}

export async function tinyfishSearch(query: string, deps: TinyFishDeps, purpose?: string): Promise<TinyFishSearchResult[]> {
  const apiKey = requireTinyFishKey(deps.config);
  const context = "searching the web";
  const res = await timedFetch(buildSearchUrl(query, purpose), {
    method: "GET",
    headers: { "X-API-Key": apiKey, Accept: "application/json" },
    timeoutMs: SEARCH_TIMEOUT_MS,
    service: "tinyfish",
    context,
    fetchImpl: deps.fetchImpl,
    signal: deps.signal,
  });
  if (!res.ok) throw upstreamError("tinyfish", res.status, context);
  const parsed = searchResponseSchema.safeParse(await parseJson(res, context));
  if (!parsed.success) throw invalidResponseError("tinyfish", context);

  return parsed.data.results
    .filter((r) => /^https?:\/\//i.test(r.url))
    .map((r, i) => ({
      position: r.position ?? i + 1,
      title: (r.title ?? "").trim() || r.url,
      url: r.url,
      snippet: (r.snippet ?? "").trim(),
      siteName: r.site_name ?? null,
    }));
}

function errorText(error: unknown): string {
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const e = error as Record<string, unknown>;
    const msg = e.message ?? e.code ?? e.error;
    if (typeof msg === "string") return msg;
  }
  return "fetch failed";
}

export async function tinyfishFetch(urls: readonly string[], deps: TinyFishDeps): Promise<TinyFishFetchResult> {
  const apiKey = requireTinyFishKey(deps.config);
  const list = [...new Set(urls)].slice(0, MAX_FETCH_URLS);
  if (list.length === 0) return { pages: [], errors: [] };
  const context = "fetching documentation pages";

  const res = await timedFetch(TINYFISH_FETCH_URL, {
    method: "POST",
    headers: { "X-API-Key": apiKey, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ urls: list, format: "markdown" }),
    timeoutMs: FETCH_TIMEOUT_MS,
    service: "tinyfish",
    context,
    fetchImpl: deps.fetchImpl,
    signal: deps.signal,
  });
  if (!res.ok) throw upstreamError("tinyfish", res.status, context);
  const parsed = fetchResponseSchema.safeParse(await parseJson(res, context));
  if (!parsed.success) throw invalidResponseError("tinyfish", context);

  const pages: TinyFishPage[] = [];
  const errors: TinyFishFetchResult["errors"] = parsed.data.errors.map((e) => ({ url: e.url ?? "unknown", error: errorText(e.error) }));
  for (const r of parsed.data.results) {
    const text = typeof r.text === "string" ? r.text : r.text == null ? "" : JSON.stringify(r.text);
    if (!text.trim()) {
      errors.push({ url: r.url, error: "page returned no extractable text" });
      continue;
    }
    pages.push({ url: r.url, finalUrl: r.final_url ?? r.url, title: r.title ?? null, description: r.description ?? null, text });
  }
  return { pages, errors };
}
