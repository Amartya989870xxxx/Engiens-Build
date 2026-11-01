import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "node:crypto";
import fs from "node:fs";
import { GitHubAppAuthService } from "../../src/services/github/appAuth.js";
import { resolveGitHubAuthToken, inspectRepository } from "../../src/services/github/github.js";
import type { AppConfig } from "../../src/config/env.js";

// Generate a valid RSA keypair in memory for mocked tests
const { privateKey: mockPemKey } = crypto.generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

describe("GitHub App Authentication Lifecycle", () => {
  it("initializes GitHubAppAuthService with valid parameters", () => {
    const authService = new GitHubAppAuthService({
      appId: "5564532",
      privateKey: mockPemKey,
    });
    expect(authService).toBeDefined();
  });

  it("handles missing private key file gracefully", () => {
    const config: AppConfig = {
      tinyfishApiKey: "test",
      geminiApiKey: "test",
      geminiModel: "gemini-3.8-flash",
      githubToken: undefined,
      githubAppId: "5564532",
      githubInstallationId: "177442932",
      githubPrivateKeyPath: "/tmp/non-existent-key-12345.pem",
      groqApiKey: undefined,
      port: 8787,
      nodeEnv: "test",
    };

    expect(() => GitHubAppAuthService.fromConfig(config)).toThrowError(
      /private key file not found/i
    );
  });

  it("returns null when GitHub App configuration is not provided", () => {
    const config: AppConfig = {
      tinyfishApiKey: "test",
      geminiApiKey: "test",
      geminiModel: "gemini-3.8-flash",
      githubToken: undefined,
      githubAppId: undefined,
      githubInstallationId: undefined,
      githubPrivateKeyPath: undefined,
      groqApiKey: undefined,
      port: 8787,
      nodeEnv: "test",
    };

    const service = GitHubAppAuthService.fromConfig(config);
    expect(service).toBeNull();
  });

  it("exchanges JWT for installation token and caches it", async () => {
    const authService = new GitHubAppAuthService({
      appId: "5564532",
      privateKey: mockPemKey,
    });

    let networkCallCount = 0;
    // Mock the internal octokit auth function
    (authService as any).authFn = vi.fn().mockImplementation(async ({ installationId }) => {
      networkCallCount++;
      return {
        type: "token",
        token: `ghs_mockInstallationToken_${installationId}_${networkCallCount}`,
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      };
    });

    // First call: should call network
    const token1 = await authService.getInstallationToken("177442932");
    expect(token1).toBe("ghs_mockInstallationToken_177442932_1");
    expect(networkCallCount).toBe(1);

    // Second call: should return cached token without calling network
    const token2 = await authService.getInstallationToken("177442932");
    expect(token2).toBe(token1);
    expect(networkCallCount).toBe(1);

    // Different installation ID: should make a new network call
    const token3 = await authService.getInstallationToken("999999");
    expect(token3).toBe("ghs_mockInstallationToken_999999_2");
    expect(networkCallCount).toBe(2);
  });

  it("refreshes token when cached token is near expiration", async () => {
    const authService = new GitHubAppAuthService({
      appId: "5564532",
      privateKey: mockPemKey,
    });

    let count = 0;
    (authService as any).authFn = vi.fn().mockImplementation(async () => {
      count++;
      return {
        type: "token",
        token: `token_v${count}`,
        // Set expiry to 30 seconds from now (less than 2 minute buffer)
        expiresAt: new Date(Date.now() + 30_000).toISOString(),
      };
    });

    const token1 = await authService.getInstallationToken("177442932");
    expect(token1).toBe("token_v1");

    // Second call sees token is within expiration buffer (< 2 mins) and refreshes
    const token2 = await authService.getInstallationToken("177442932");
    expect(token2).toBe("token_v2");
    expect(count).toBe(2);
  });
});

describe("GitHub Authentication Priority & Fallbacks", () => {
  it("prioritizes GitHub App installation token over GITHUB_TOKEN", async () => {
    const mockAppAuth = new GitHubAppAuthService({
      appId: "5564532",
      privateKey: mockPemKey,
    });
    (mockAppAuth as any).authFn = vi.fn().mockResolvedValue({
      type: "token",
      token: "ghs_app_token_priority_1",
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    });

    const config: AppConfig = {
      tinyfishApiKey: "test",
      geminiApiKey: "test",
      geminiModel: "gemini-3.8-flash",
      githubToken: "ghp_fallback_token_priority_2",
      githubAppId: "5564532",
      githubInstallationId: "177442932",
      githubPrivateKeyPath: undefined,
      groqApiKey: undefined,
      port: 8787,
      nodeEnv: "test",
    };

    const token = await resolveGitHubAuthToken({
      config,
      appAuthService: mockAppAuth,
    });

    expect(token).toBe("ghs_app_token_priority_1");
  });

  it("falls back to GITHUB_TOKEN when GitHub App is not configured", async () => {
    const config: AppConfig = {
      tinyfishApiKey: "test",
      geminiApiKey: "test",
      geminiModel: "gemini-3.8-flash",
      githubToken: "ghp_fallback_token_priority_2",
      githubAppId: undefined,
      githubInstallationId: undefined,
      githubPrivateKeyPath: undefined,
      groqApiKey: undefined,
      port: 8787,
      nodeEnv: "test",
    };

    const token = await resolveGitHubAuthToken({ config });
    expect(token).toBe("ghp_fallback_token_priority_2");
  });

  it("falls back to unauthenticated (undefined) when neither is configured", async () => {
    const config: AppConfig = {
      tinyfishApiKey: "test",
      geminiApiKey: "test",
      geminiModel: "gemini-3.8-flash",
      githubToken: undefined,
      githubAppId: undefined,
      githubInstallationId: undefined,
      githubPrivateKeyPath: undefined,
      groqApiKey: undefined,
      port: 8787,
      nodeEnv: "test",
    };

    const token = await resolveGitHubAuthToken({ config });
    expect(token).toBeUndefined();
  });
});

describe("Repository Access & Errors", () => {
  it("handles private repository 404/403 with descriptive error message", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: "Not Found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      })
    );

    const config: AppConfig = {
      tinyfishApiKey: "test",
      geminiApiKey: "test",
      geminiModel: "gemini-3.8-flash",
      githubToken: undefined,
      githubAppId: undefined,
      githubInstallationId: undefined,
      githubPrivateKeyPath: undefined,
      groqApiKey: undefined,
      port: 8787,
      nodeEnv: "test",
    };

    await expect(
      inspectRepository("https://github.com/my-org/private-repo", "review task", {
        config,
        fetchImpl: mockFetch as any,
      })
    ).rejects.toThrowError(/ensure the Engiens Build GitHub App is installed/i);
  });
});
