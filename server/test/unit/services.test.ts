import { describe, it, expect } from "vitest";
import { parseGitHubUrl } from "../../src/services/github/url.js";
import { exclusionReason, scoreFile, selectFiles } from "../../src/services/github/selection.js";
import { buildSearchUrl } from "../../src/services/tinyfish.js";
import { redactSecrets } from "../../src/lib/errors.js";

describe("GitHub URL Parsing", () => {
  it("parses full HTTPS GitHub URLs", () => {
    const res = parseGitHubUrl("https://github.com/expressjs/express");
    expect(res).toEqual({ owner: "expressjs", repo: "express" });
  });

  it("parses URLs with trailing slashes and .git", () => {
    const res = parseGitHubUrl("https://github.com/facebook/react.git/");
    expect(res).toEqual({ owner: "facebook", repo: "react" });
  });

  it("parses shorthand owner/repo", () => {
    const res = parseGitHubUrl("vercel/next.js");
    expect(res).toEqual({ owner: "vercel", repo: "next.js" });
  });

  it("throws for non-GitHub URLs", () => {
    expect(() => parseGitHubUrl("https://gitlab.com/owner/repo")).toThrow();
  });
});

describe("File Selection & Security Rules", () => {
  it("excludes secret files and node_modules", () => {
    expect(exclusionReason(".env")).toBeTruthy();
    expect(exclusionReason(".env.production")).toBeTruthy();
    expect(exclusionReason("node_modules/express/index.js")).toBeTruthy();
    expect(exclusionReason("dist/bundle.js")).toBeTruthy();
    expect(exclusionReason("image.png")).toBeTruthy();
  });

  it("allows source and manifest files", () => {
    expect(exclusionReason("package.json")).toBeNull();
    expect(exclusionReason("src/index.ts")).toBeNull();
    expect(exclusionReason("README.md")).toBeNull();
  });

  it("scores manifest and entry files higher", () => {
    const manifest = scoreFile("package.json", 1000);
    const regular = scoreFile("src/utils/math.ts", 1000);
    expect(manifest?.score).toBeGreaterThan(regular?.score ?? 0);
  });
});

describe("TinyFish URL Construction", () => {
  it("builds correct search query with URL encoding", () => {
    const url = buildSearchUrl("razorpay nodejs SDK", "test purpose");
    expect(url).toContain("query=razorpay+nodejs+SDK");
    expect(url).toContain("purpose=test+purpose");
  });
});

describe("Secret Redaction", () => {
  it("redacts known keys and patterns", () => {
    const text = "Error calling api with key sk-tinyfish-1234567890abcdef and custom secret secret123";
    const redacted = redactSecrets(text, ["secret123"]);
    expect(redacted).not.toContain("sk-tinyfish-1234567890abcdef");
    expect(redacted).not.toContain("secret123");
    expect(redacted).toContain("[REDACTED]");
  });
});
