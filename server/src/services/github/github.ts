import type { LanguageShare, RepoMetadata, RepositoryContext, RepositorySummary, SelectedFile } from "../../../../shared/contract.js";
import type { AppConfig } from "../../config/env.js";
import { AppError, invalidResponseError, upstreamError } from "../../lib/errors.js";
import { type FetchLike, mapWithConcurrency, readTextLimited, timedFetch, truncate } from "../../lib/http.js";
import { SELECTION_LIMITS, type TreeEntry, buildOutline, selectFiles } from "./selection.js";
import { detectStack } from "./stack.js";
import { type RepoRef, parseGitHubUrl } from "./url.js";
import { GitHubAppAuthService } from "./appAuth.js";
import { z } from "zod";

const API = "https://api.github.com";
const RAW = "https://raw.githubusercontent.com";
const API_TIMEOUT_MS = 12_000;
const RAW_TIMEOUT_MS = 10_000;
const CACHE_TTL_MS = 10 * 60_000;
const MAX_TREE_PATHS = 4_000;

const repoSchema = z.object({
  name: z.string(),
  full_name: z.string(),
  html_url: z.string(),
  description: z.string().nullable(),
  default_branch: z.string(),
  stargazers_count: z.number(),
  forks_count: z.number(),
  language: z.string().nullable(),
  topics: z.array(z.string()).optional(),
  license: z.object({ spdx_id: z.string().nullable().optional(), name: z.string().nullable().optional() }).nullable().optional(),
  pushed_at: z.string().nullable().optional(),
  size: z.number(),
  fork: z.boolean(),
  archived: z.boolean(),
  private: z.boolean(),
  owner: z.object({ login: z.string() }),
});

const treeSchema = z.object({
  sha: z.string(),
  truncated: z.boolean(),
  tree: z.array(
    z.object({
      path: z.string(),
      type: z.enum(["blob", "tree", "commit"]),
      size: z.number().optional(),
    }),
  ),
});

const languagesSchema = z.record(z.string(), z.number());

interface CachedRepo {
  at: number;
  meta: RepoMetadata;
  languages: LanguageShare[];
  entries: TreeEntry[];
  treeTruncated: boolean;
  requests: number;
}

const repoCache = new Map<string, CachedRepo>();
const fileCache = new Map<string, { at: number; text: string; truncated: boolean }>();

export function clearGitHubCache() {
  repoCache.clear();
  fileCache.clear();
}

export interface GitHubDeps {
  config: AppConfig;
  fetchImpl?: FetchLike;
  signal?: AbortSignal;
  /** Optional multi-tenant GitHub App auth service override */
  appAuthService?: GitHubAppAuthService | null;
  /** Optional installation ID override per request (supports multi-user) */
  installationId?: string | number;
}

/**
 * Resolves authentication token for GitHub API with strict priority:
 * 1. GitHub App installation token (when App ID, Private Key, and Installation ID are available)
 * 2. GITHUB_TOKEN fallback
 * 3. None (unauthenticated public API access)
 */
export async function resolveGitHubAuthToken(deps: GitHubDeps): Promise<string | undefined> {
  const targetInstallationId = deps.installationId || deps.config.githubInstallationId;

  // 1. GitHub App Priority
  const appAuth = deps.appAuthService ?? GitHubAppAuthService.fromConfig(deps.config);
  if (appAuth && targetInstallationId) {
    try {
      const token = await appAuth.getInstallationToken(targetInstallationId);
      if (token) return token;
    } catch (err: any) {
      // If explicit GitHub App config failed, bubble up the error rather than silently failing to rate limits
      if (err instanceof AppError) throw err;
      throw new AppError({
        code: "GITHUB_APP_AUTH_ERROR",
        message: `Failed to authenticate using GitHub App: ${err.message}`,
        status: 502,
        service: "github",
        cause: err,
      });
    }
  }

  // 2. GITHUB_TOKEN Fallback
  if (deps.config.githubToken) {
    return deps.config.githubToken;
  }

  // 3. Unauthenticated public access
  return undefined;
}

async function apiHeaders(deps: GitHubDeps): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "engiens-build",
  };
  const token = await resolveGitHubAuthToken(deps);
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

async function githubJson<T>(path: string, schema: z.ZodType<T>, context: string, deps: GitHubDeps): Promise<T> {
  const headers = await apiHeaders(deps);
  const res = await timedFetch(`${API}${path}`, {
    headers,
    timeoutMs: API_TIMEOUT_MS,
    service: "github",
    context,
    fetchImpl: deps.fetchImpl,
    signal: deps.signal,
  });
  if (!res.ok) {
    if ((res.status === 403 || res.status === 429) && res.headers.get("x-ratelimit-remaining") === "0") {
      const reset = Number(res.headers.get("x-ratelimit-reset"));
      const mins = Number.isFinite(reset) ? Math.max(1, Math.ceil((reset * 1000 - Date.now()) / 60_000)) : null;
      throw new AppError({
        code: "GITHUB_RATE_LIMITED",
        message: `GitHub's API rate limit is exhausted${mins ? `; it resets in ~${mins} min` : ""}. Check GitHub App or token configuration.`,
        status: 429,
        service: "github",
        retryable: true,
      });
    }
    if (res.status === 401) {
      throw new AppError({
        code: "GITHUB_AUTH_INVALID",
        message: "GitHub rejected authentication credentials. Verify GitHub App installation permissions or token.",
        status: 401,
        service: "github",
      });
    }
    if (res.status === 403) {
      throw new AppError({
        code: "GITHUB_ACCESS_DENIED",
        message: "Access to this repository was denied by GitHub. Ensure the repository exists and the GitHub App is installed on it.",
        status: 403,
        service: "github",
      });
    }
    if (res.status === 404) {
      throw new AppError({
        code: "GITHUB_REPO_NOT_FOUND",
        message: "Repository not found. If this is a private repository, ensure the Engiens Build GitHub App is installed on its account.",
        status: 404,
        service: "github",
      });
    }
    if (res.status === 409) {
      throw new AppError({ code: "GITHUB_REPO_EMPTY", message: "This repository is empty.", status: 422, service: "github" });
    }
    throw upstreamError("github", res.status, context);
  }
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw invalidResponseError("github", context);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw invalidResponseError("github", context);
  return parsed.data;
}

async function loadRepo(ref: RepoRef, deps: GitHubDeps): Promise<CachedRepo> {
  const key = `${ref.owner}/${ref.repo}`.toLowerCase();
  const cached = repoCache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return { ...cached, requests: 0 };

  const base = `/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}`;
  const repo = await githubJson(base, repoSchema, "loading repository metadata", deps);

  const [languagesRaw, tree] = await Promise.all([
    githubJson(`${base}/languages`, languagesSchema, "loading repository languages", deps).catch(() => ({}) as Record<string, number>),
    githubJson(
      `${base}/git/trees/${encodeURIComponent(repo.default_branch)}?recursive=1`,
      treeSchema,
      "loading the repository file tree",
      deps,
    ),
  ]);

  const totalBytes = Object.values(languagesRaw).reduce((a, b) => a + b, 0) || 1;
  const languages: LanguageShare[] = Object.entries(languagesRaw)
    .sort(([, a], [, b]) => b - a)
    .map(([name, bytes]) => ({ name, bytes, percent: Math.round((bytes / totalBytes) * 1000) / 10 }));

  const meta: RepoMetadata = {
    owner: repo.owner.login,
    name: repo.name,
    fullName: repo.full_name,
    url: repo.html_url,
    description: repo.description,
    defaultBranch: repo.default_branch,
    stars: repo.stargazers_count,
    forks: repo.forks_count,
    primaryLanguage: repo.language,
    topics: repo.topics ?? [],
    license: repo.license?.spdx_id && repo.license.spdx_id !== "NOASSERTION" ? repo.license.spdx_id : (repo.license?.name ?? null),
    pushedAt: repo.pushed_at ?? null,
    sizeKb: repo.size,
    isFork: repo.fork,
    archived: repo.archived,
  };

  const entry: CachedRepo = {
    at: Date.now(),
    meta,
    languages,
    entries: tree.tree.map((t) => ({ path: t.path, type: t.type, size: t.size })),
    treeTruncated: tree.truncated,
    requests: 3,
  };
  repoCache.set(key, entry);
  return entry;
}

async function loadFile(meta: RepoMetadata, path: string, deps: GitHubDeps): Promise<{ text: string; truncated: boolean } | null> {
  const key = `${meta.fullName}@${meta.defaultBranch}:${path}`.toLowerCase();
  const cached = fileCache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached;

  const authToken = await resolveGitHubAuthToken(deps);

  // If authenticated (GitHub App token or personal token), use raw GitHub Contents API for private repository access.
  // Otherwise, use raw.githubusercontent.com for fast unauthenticated public fetching.
  if (authToken) {
    const apiPath = `/repos/${encodeURIComponent(meta.owner)}/${encodeURIComponent(meta.name)}/contents/${path
      .split("/")
      .map(encodeURIComponent)
      .join("/")}?ref=${encodeURIComponent(meta.defaultBranch)}`;

    const res = await timedFetch(`${API}${apiPath}`, {
      headers: {
        Accept: "application/vnd.github.raw",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "engiens-build",
        Authorization: `Bearer ${authToken}`,
      },
      timeoutMs: API_TIMEOUT_MS,
      service: "github",
      context: `downloading ${path}`,
      fetchImpl: deps.fetchImpl,
      signal: deps.signal,
    });

    if (!res.ok) return null;
    const { text, truncated: byteTruncated } = await readTextLimited(res, SELECTION_LIMITS.maxFileBytes);
    if (text.includes("\u0000")) return null;
    const capped = truncate(text, SELECTION_LIMITS.maxFileChars);
    const value = { text: capped.text, truncated: capped.truncated || byteTruncated };
    fileCache.set(key, { at: Date.now(), ...value });
    return value;
  }

  // Public unauthenticated fallback via raw CDN
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  const url = `${RAW}/${encodeURIComponent(meta.owner)}/${encodeURIComponent(meta.name)}/${meta.defaultBranch
    .split("/")
    .map(encodeURIComponent)
    .join("/")}/${encodedPath}`;
  const res = await timedFetch(url, {
    headers: { "User-Agent": "engiens-build" },
    timeoutMs: RAW_TIMEOUT_MS,
    service: "github",
    context: `downloading ${path}`,
    fetchImpl: deps.fetchImpl,
    signal: deps.signal,
  });
  if (!res.ok) return null;
  const { text, truncated: byteTruncated } = await readTextLimited(res, SELECTION_LIMITS.maxFileBytes);
  if (text.includes("\u0000")) return null;
  const capped = truncate(text, SELECTION_LIMITS.maxFileChars);
  const value = { text: capped.text, truncated: capped.truncated || byteTruncated };
  fileCache.set(key, { at: Date.now(), ...value });
  return value;
}

/**
 * Inspects a GitHub repository (public or authorized private) and builds a bounded, model-ready
 * context. Never executes repository code; only reads selected text files.
 */
export async function inspectRepository(repoUrl: string, request: string | undefined, deps: GitHubDeps): Promise<RepositoryContext> {
  const ref = parseGitHubUrl(repoUrl);
  const repo = await loadRepo(ref, deps);
  const limitations: string[] = [];

  const blobs = repo.entries.filter((e) => e.type === "blob");
  const candidates = selectFiles(repo.entries, request);

  const downloaded = await mapWithConcurrency(candidates, SELECTION_LIMITS.concurrency, async (c) => {
    try {
      const file = await loadFile(repo.meta, c.path, deps);
      return file ? { candidate: c, file } : null;
    } catch (err) {
      if (err instanceof AppError && err.code === "REQUEST_ABORTED") throw err;
      return null;
    }
  });

  const files: SelectedFile[] = [];
  let chars = 0;
  let failed = 0;
  for (const item of downloaded) {
    if (!item) {
      failed++;
      continue;
    }
    if (chars + item.file.text.length > SELECTION_LIMITS.maxTotalChars) {
      limitations.push(`Skipped ${item.candidate.path}: total source budget reached.`);
      continue;
    }
    files.push({
      path: item.candidate.path,
      size: item.candidate.size,
      reason: item.candidate.reason,
      content: item.file.text,
      truncated: item.file.truncated,
    });
    chars += item.file.text.length;
  }

  const stack = detectStack(files);
  const manifests = files
    .filter((f) => /(^|\/)(package\.json|requirements\.txt|pyproject\.toml|pom\.xml|build\.gradle(\.kts)?|go\.mod|cargo\.toml|gemfile|composer\.json|pubspec\.yaml)$/i.test(f.path))
    .map((f) => f.path);

  if (repo.treeTruncated) limitations.push("GitHub truncated the recursive file tree (very large repository); some paths are not visible.");
  if (failed > 0) limitations.push(`${failed} selected file(s) could not be downloaded.`);
  if (files.some((f) => f.truncated)) limitations.push("Some large files were truncated to fit the context budget.");
  if (blobs.length > files.length) {
    limitations.push(`Only ${files.length} of ${blobs.length} files were read; conclusions about unread files are inferences from paths only.`);
  }
  if (manifests.length === 0) limitations.push("No dependency manifest was found; the stack is inferred from file extensions only.");
  if (repo.meta.archived) limitations.push("This repository is archived (read-only upstream).");

  const allPaths = repo.entries.filter((e) => e.type === "blob").map((e) => e.path);
  return {
    repo: repo.meta,
    languages: repo.languages,
    stack: { ...stack, manifests },
    tree: {
      totalFiles: blobs.length,
      totalDirectories: repo.entries.filter((e) => e.type === "tree").length,
      truncated: repo.treeTruncated,
      outline: buildOutline(repo.entries),
      paths: allPaths.slice(0, MAX_TREE_PATHS),
    },
    files,
    limitations,
    stats: {
      filesConsidered: blobs.length,
      filesSelected: files.length,
      charsIncluded: chars,
      githubRequests: repo.requests,
    },
  };
}

export function toRepositorySummary(ctx: RepositoryContext): RepositorySummary {
  const { paths: _paths, ...tree } = ctx.tree;
  return {
    ...ctx,
    tree,
    files: ctx.files.map(({ content, ...rest }) => ({ ...rest, chars: content.length })),
  };
}
