import { ValidationError } from "../../lib/errors.js";

export interface RepoRef {
  owner: string;
  repo: string;
}

const OWNER_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const REPO_RE = /^[A-Za-z0-9._-]{1,100}$/;
const RESERVED_OWNERS = new Set([
  "orgs", "settings", "marketplace", "explore", "topics", "features", "login", "join",
  "about", "pricing", "sponsors", "notifications", "new", "organizations", "search", "apps",
]);

/**
 * Parses a public GitHub repository reference. Accepts:
 *  - https://github.com/owner/repo(.git)(/tree/branch/...)
 *  - github.com/owner/repo
 *  - git@github.com:owner/repo.git
 *  - owner/repo
 */
export function parseGitHubUrl(input: string): RepoRef {
  const raw = input.trim();
  if (!raw) throw new ValidationError("Enter a GitHub repository URL, e.g. https://github.com/expressjs/express");

  let owner: string | undefined;
  let repo: string | undefined;

  const ssh = /^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?\/?$/i.exec(raw);
  if (ssh) {
    [, owner, repo] = ssh;
  } else if (/^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/.test(raw) && !raw.includes(".com")) {
    [owner, repo] = raw.split("/");
  } else {
    let url: URL;
    try {
      url = new URL(/^[a-z]+:\/\//i.test(raw) ? raw : `https://${raw}`);
    } catch {
      throw new ValidationError("That does not look like a valid URL.");
    }
    const host = url.hostname.toLowerCase();
    if (host !== "github.com" && host !== "www.github.com") {
      throw new ValidationError("Only public github.com repositories are supported in this version.");
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      throw new ValidationError("Use an https:// GitHub URL.");
    }
    const segments = url.pathname.split("/").filter(Boolean);
    if (segments.length < 2) {
      throw new ValidationError("The URL must include both the owner and repository, e.g. github.com/owner/repo.");
    }
    owner = segments[0];
    repo = segments[1]?.replace(/\.git$/i, "");
  }

  if (!owner || !repo || !OWNER_RE.test(owner) || RESERVED_OWNERS.has(owner.toLowerCase())) {
    throw new ValidationError("The repository owner in that URL is not valid.");
  }
  if (!REPO_RE.test(repo) || repo === "." || repo === "..") {
    throw new ValidationError("The repository name in that URL is not valid.");
  }
  return { owner, repo };
}
