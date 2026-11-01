/**
 * Repository file selection rules.
 *
 * Decides which files are safe and useful to send to the model. Pure functions
 * so they can be unit-tested without network access.
 */

export interface TreeEntry {
  path: string;
  type: "blob" | "tree" | "commit";
  size?: number;
}

export interface FileCandidate {
  path: string;
  size: number;
  score: number;
  reason: string;
}

export const SELECTION_LIMITS = {
  maxFiles: 24,
  maxFileBytes: 150_000, // never download files larger than this
  maxFileChars: 12_000, // per-file content budget sent to the model
  maxTotalChars: 110_000, // total source budget sent to the model
  concurrency: 4,
} as const;

const IGNORED_DIRS = new Set([
  "node_modules", "dist", "build", "out", ".git", ".next", ".nuxt", ".svelte-kit", ".output",
  "coverage", "vendor", "vendors", "third_party", "third-party", "bower_components", "target",
  "__pycache__", ".venv", "venv", "env", ".tox", ".mypy_cache", ".pytest_cache", ".gradle",
  ".idea", ".vscode", ".turbo", ".cache", ".parcel-cache", "Pods", "DerivedData", ".yarn",
  ".pnpm-store", "public/build", "storybook-static", ".terraform", "tmp", "temp", "logs",
]);

const LOCKFILES = new Set([
  "package-lock.json", "yarn.lock", "pnpm-lock.yaml", "bun.lockb", "bun.lock", "npm-shrinkwrap.json",
  "poetry.lock", "pipfile.lock", "cargo.lock", "gemfile.lock", "composer.lock", "go.sum", "uv.lock",
  "pdm.lock", "mix.lock", "pubspec.lock", "podfile.lock", "packages.lock.json", "flake.lock",
]);

const BINARY_EXT = new Set([
  "png", "jpg", "jpeg", "gif", "webp", "avif", "ico", "bmp", "tiff", "psd", "svg", "eps",
  "woff", "woff2", "ttf", "otf", "eot", "mp3", "mp4", "wav", "ogg", "webm", "mov", "avi", "flac",
  "zip", "tar", "gz", "tgz", "bz2", "xz", "7z", "rar", "jar", "war", "ear", "class", "dll", "exe",
  "so", "dylib", "a", "o", "obj", "bin", "dat", "db", "sqlite", "sqlite3", "pdf", "doc", "docx",
  "xls", "xlsx", "ppt", "pptx", "wasm", "pyc", "pyo", "node", "map", "lockb", "ipynb", "parquet",
  "pkl", "pt", "onnx", "h5", "keystore", "jks",
]);

const SECRET_NAME_RE =
  /(^|\/)(\.env(\..*)?|\.npmrc|\.pypirc|\.netrc|\.htpasswd|id_rsa.*|id_ed25519.*|id_dsa.*|.*\.pem|.*\.key|.*\.p12|.*\.pfx|.*\.crt|.*\.cer|credentials(\..*)?|secrets?(\..*)?|service[-_]?account.*\.json|.*\.secret(s)?(\..*)?|\.aws\/.*|\.docker\/config\.json)$/i;

const GENERATED_RE = /(\.min\.(js|css)$|\.bundle\.js$|\.chunk\.js$|\.generated\.|_pb2\.py$|\.pb\.go$|\.d\.ts\.map$|-lock\.json$)/i;

const SOURCE_EXT = new Set([
  "ts", "tsx", "js", "jsx", "mjs", "cjs", "vue", "svelte", "astro", "py", "rb", "go", "rs", "java",
  "kt", "kts", "scala", "cs", "php", "swift", "dart", "ex", "exs", "c", "cc", "cpp", "h", "hpp",
  "sql", "graphql", "gql", "prisma", "proto",
]);

const CONFIG_EXT = new Set(["json", "yaml", "yml", "toml", "ini", "cfg", "xml", "gradle", "properties", "md", "txt"]);

/** Root/nested manifests that describe the stack. */
const MANIFESTS: Record<string, string> = {
  "package.json": "Node.js package manifest",
  "tsconfig.json": "TypeScript configuration",
  "requirements.txt": "Python dependencies",
  "pyproject.toml": "Python project manifest",
  "setup.py": "Python package setup",
  "pipfile": "Python dependencies (Pipenv)",
  "pom.xml": "Maven build configuration",
  "build.gradle": "Gradle build configuration",
  "build.gradle.kts": "Gradle build configuration",
  "settings.gradle": "Gradle settings",
  "go.mod": "Go module manifest",
  "cargo.toml": "Rust crate manifest",
  "gemfile": "Ruby dependencies",
  "composer.json": "PHP dependencies",
  "pubspec.yaml": "Dart/Flutter manifest",
  "mix.exs": "Elixir project manifest",
  "deno.json": "Deno configuration",
};

const BUILD_CONFIG_RE =
  /(^|\/)(vite|next|nuxt|svelte|astro|webpack|rollup|tsup|babel|jest|vitest|playwright|tailwind|postcss|remix|angular|nest-cli|turbo|nx|drizzle|prisma)\.config\.(js|cjs|mjs|ts|json)$|(^|\/)(angular|nest-cli|turbo|nx|vercel|netlify)\.json$|(^|\/)dockerfile$|(^|\/)docker-compose\.ya?ml$|(^|\/)schema\.prisma$|(^|\/)manage\.py$|(^|\/)makefile$/i;

const ENTRY_RE =
  /(^|\/)(src\/)?(index|main|app|server|application|program|bootstrap|router|routes|urls|wsgi|asgi)\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|kt|rb|php)$/i;

const ROLE_DIR_RE =
  /(^|\/)(routes?|routers?|controllers?|api|apis|handlers?|services?|lib|libs|middlewares?|models?|schemas?|integrations?|clients?|providers?|config|endpoints?|views|pages|app|modules?|domain|repositories|utils|hooks|store)(\/|$)/i;

const TEST_RE = /(^|\/)(__tests__|tests?|spec|e2e|cypress)(\/|$)|\.(test|spec)\.[a-z]+$/i;

const STOP_WORDS = new Set([
  "the", "and", "for", "with", "that", "this", "into", "from", "add", "adding", "implement", "build",
  "create", "make", "using", "use", "our", "app", "application", "project", "feature", "support",
  "should", "would", "could", "want", "need", "like", "please", "new", "existing", "code", "file",
  "files", "page", "when", "then", "also", "have", "has", "are", "can", "will", "all", "any", "via",
  "integration", "integrate", "a", "an", "to", "of", "in", "on", "it", "is", "be", "as", "by", "or",
]);

export function extensionOf(path: string): string {
  const base = path.split("/").pop() ?? "";
  const idx = base.lastIndexOf(".");
  return idx > 0 ? base.slice(idx + 1).toLowerCase() : "";
}

/** Returns a reason string if the path must never be read, otherwise null. */
export function exclusionReason(path: string, size = 0): string | null {
  const lower = path.toLowerCase();
  const segments = lower.split("/");
  const base = segments[segments.length - 1] ?? "";
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i] ?? "";
    if (IGNORED_DIRS.has(seg) || IGNORED_DIRS.has(segments.slice(0, i + 1).join("/"))) return "ignored directory";
  }
  if (SECRET_NAME_RE.test(lower)) return "potential secret or credential file";
  if (LOCKFILES.has(base)) return "lockfile";
  if (BINARY_EXT.has(extensionOf(lower))) return "binary or generated asset";
  if (GENERATED_RE.test(lower)) return "minified or generated file";
  if (size > SELECTION_LIMITS.maxFileBytes) return "file too large";
  return null;
}

/** Extracts meaningful keywords from the developer's request for path matching. */
export function requestKeywords(request: string | undefined): string[] {
  if (!request) return [];
  const words = request
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
  return [...new Set(words)].slice(0, 12);
}

/** Scores a single file; returns null when it should not be considered. */
export function scoreFile(path: string, size: number, keywords: readonly string[] = []): FileCandidate | null {
  if (exclusionReason(path, size)) return null;
  const lower = path.toLowerCase();
  const base = lower.split("/").pop() ?? "";
  const depth = lower.split("/").length - 1;
  const ext = extensionOf(lower);
  const isSource = SOURCE_EXT.has(ext);
  const isConfigLike = CONFIG_EXT.has(ext) || base === "dockerfile" || base === "makefile" || base === "gemfile" || base === "pipfile";
  if (!isSource && !isConfigLike) return null;

  let score = 0;
  const reasons: string[] = [];

  if (MANIFESTS[base]) {
    score += depth === 0 ? 100 : 70 - Math.min(depth, 4) * 5;
    reasons.push(MANIFESTS[base]);
  } else if (/^readme(\.[a-z]+)?$/.test(base)) {
    if (depth === 0) {
      score += 95;
      reasons.push("project README");
    } else {
      score += 20;
      reasons.push("nested README");
    }
  } else if (BUILD_CONFIG_RE.test(lower)) {
    score += 60;
    reasons.push("build / framework configuration");
  } else if (ENTRY_RE.test(lower) && isSource) {
    score += 75 - Math.min(depth, 5) * 4;
    reasons.push("application entry point");
  } else if (isSource && ROLE_DIR_RE.test(lower)) {
    score += 40;
    reasons.push("route / service / module code");
  } else if (isSource) {
    score += 18;
    reasons.push("source file");
  } else if (ext === "md" || ext === "txt") {
    score += 4;
    reasons.push("documentation");
  } else {
    score += 6;
    reasons.push("configuration");
  }

  const hits = keywords.filter((k) => lower.includes(k));
  if (hits.length > 0) {
    score += 35 + 10 * (hits.length - 1);
    reasons.push(`matches request (${hits.join(", ")})`);
  }

  if (TEST_RE.test(lower)) {
    score -= 25;
    reasons.push("test");
  }
  if (lower.includes("example") || lower.includes("fixture") || lower.includes("mock") || lower.includes("docs/")) score -= 12;
  score -= Math.max(0, depth - 2) * 3;
  if (size === 0) score -= 30;
  if (size > 60_000) score -= 15;

  return score > 0 ? { path, size, score, reason: reasons.join(" · ") } : null;
}

/**
 * Picks the files to download for model context, respecting the file count
 * limit and an estimated character budget.
 */
export function selectFiles(entries: readonly TreeEntry[], request?: string, limits = SELECTION_LIMITS): FileCandidate[] {
  const keywords = requestKeywords(request);
  const candidates = entries
    .filter((e) => e.type === "blob")
    .map((e) => scoreFile(e.path, e.size ?? 0, keywords))
    .filter((c): c is FileCandidate => c !== null)
    .sort((a, b) => b.score - a.score || a.path.length - b.path.length);

  const chosen: FileCandidate[] = [];
  let budget = 0;
  for (const c of candidates) {
    if (chosen.length >= limits.maxFiles) break;
    const est = Math.min(c.size, limits.maxFileChars);
    if (budget + est > limits.maxTotalChars && chosen.length >= 6) continue;
    chosen.push(c);
    budget += est;
  }
  return chosen;
}

/** Builds a compact depth-limited ASCII outline of the repository tree. */
export function buildOutline(entries: readonly TreeEntry[], maxDepth = 3, maxLines = 160): string {
  interface Node { children: Map<string, Node>; isDir: boolean; fileCount: number }
  const root: Node = { children: new Map(), isDir: true, fileCount: 0 };
  for (const e of entries) {
    if (e.type === "commit") continue;
    const parts = e.path.split("/");
    if (parts.some((p, i) => i < parts.length - 1 && IGNORED_DIRS.has(p.toLowerCase()))) continue;
    if (IGNORED_DIRS.has((parts[0] ?? "").toLowerCase()) && parts.length === 1 && e.type === "tree") continue;
    let node = root;
    parts.forEach((part, i) => {
      const isLast = i === parts.length - 1;
      let child = node.children.get(part);
      if (!child) {
        child = { children: new Map(), isDir: !isLast || e.type === "tree", fileCount: 0 };
        node.children.set(part, child);
      }
      if (isLast && e.type === "blob") node.fileCount += 1;
      node = child;
    });
  }

  const lines: string[] = [];
  const walk = (node: Node, prefix: string, depth: number) => {
    const sorted = [...node.children.entries()].sort(([an, a], [bn, b]) =>
      a.isDir === b.isDir ? an.localeCompare(bn) : a.isDir ? -1 : 1,
    );
    const shown = sorted.slice(0, 40);
    shown.forEach(([name, child], idx) => {
      if (lines.length >= maxLines) return;
      const last = idx === shown.length - 1 && sorted.length <= 40;
      lines.push(`${prefix}${last ? "└── " : "├── "}${name}${child.isDir ? "/" : ""}`);
      if (child.isDir) {
        if (depth + 1 < maxDepth) walk(child, `${prefix}${last ? "    " : "│   "}`, depth + 1);
        else if (child.children.size > 0) lines.push(`${prefix}${last ? "    " : "│   "}└── … (${child.children.size} entries)`);
      }
    });
    if (sorted.length > 40 && lines.length < maxLines) lines.push(`${prefix}└── … (${sorted.length - 40} more)`);
  };
  walk(root, "", 0);
  if (lines.length >= maxLines) lines.push("… (outline truncated)");
  return lines.join("\n");
}
