import fs from "node:fs";
import path from "node:path";
import { createAppAuth } from "@octokit/auth-app";
import type { AppConfig } from "../../config/env.js";
import { AppError } from "../../lib/errors.js";

/** Cached installation token with expiry window */
interface CachedToken {
  token: string;
  expiresAt: number; // Unix timestamp in ms
}

export interface GitHubAppAuthConfig {
  appId: string | number;
  privateKey: string;
}

/**
 * Service managing GitHub App JWT signing, installation token creation,
 * and token lifecycle caching.
 * Designed to be reusable across multiple installations (future multi-user).
 */
export class GitHubAppAuthService {
  private appId: string | number;
  private privateKey: string;
  private authFn: ReturnType<typeof createAppAuth>;
  private tokenCache = new Map<number | string, CachedToken>();

  constructor(config: GitHubAppAuthConfig) {
    this.appId = config.appId;
    this.privateKey = config.privateKey;
    this.authFn = createAppAuth({
      appId: this.appId,
      privateKey: this.privateKey,
    });
  }

  /**
   * Creates an instance from AppConfig by reading the PEM key from filesystem.
   * Returns null if GitHub App configuration is not present or incomplete.
   */
  static fromConfig(config: AppConfig): GitHubAppAuthService | null {
    if (!config.githubAppId || !config.githubPrivateKeyPath) {
      return null;
    }

    const keyPath = path.resolve(config.githubPrivateKeyPath);
    if (!fs.existsSync(keyPath)) {
      throw new AppError({
        code: "GITHUB_APP_KEY_NOT_FOUND",
        message: `GitHub App private key file not found at configured path: ${config.githubPrivateKeyPath}`,
        status: 500,
        service: "github",
      });
    }

    let privateKey: string;
    try {
      privateKey = fs.readFileSync(keyPath, "utf8");
    } catch (err: any) {
      throw new AppError({
        code: "GITHUB_APP_KEY_READ_ERROR",
        message: `Failed to read GitHub App private key from path: ${err.message}`,
        status: 500,
        service: "github",
        cause: err,
      });
    }

    if (!privateKey.includes("BEGIN") || !privateKey.includes("PRIVATE KEY")) {
      throw new AppError({
        code: "GITHUB_APP_KEY_INVALID",
        message: "Configured GitHub App private key is not a valid PEM formatted private key.",
        status: 500,
        service: "github",
      });
    }

    return new GitHubAppAuthService({
      appId: config.githubAppId,
      privateKey,
    });
  }

  /**
   * Generates or retrieves a valid, non-expired installation access token.
   * If a cached token is still valid (with a 2-minute buffer), it returns the cached token.
   * Otherwise, it requests a new installation access token from GitHub.
   *
   * @param installationId - The GitHub App installation ID (supports multiple tenants)
   */
  async getInstallationToken(installationId: string | number): Promise<string> {
    const idKey = String(installationId);
    const cached = this.tokenCache.get(idKey);
    const now = Date.now();

    // 2-minute buffer before expiration
    if (cached && cached.expiresAt > now + 120_000) {
      return cached.token;
    }

    try {
      const authResult = await this.authFn({
        type: "installation",
        installationId: Number(installationId),
      });

      const token = authResult.token;
      // authResult.expiresAt is an ISO string from GitHub (e.g. 2026-11-01T15:30:00.000Z)
      const expiresAt = authResult.expiresAt ? new Date(authResult.expiresAt).getTime() : now + 3600_000;

      this.tokenCache.set(idKey, {
        token,
        expiresAt,
      });

      return token;
    } catch (err: any) {
      const msg = err.message || "Failed to authenticate GitHub App installation";
      if (err.status === 401 || err.status === 403) {
        throw new AppError({
          code: "GITHUB_APP_AUTH_FAILED",
          message: `GitHub App authentication failed for installation ${installationId}: ${msg}`,
          status: 502,
          service: "github",
          cause: err,
        });
      }
      if (err.status === 404) {
        throw new AppError({
          code: "GITHUB_APP_INSTALLATION_NOT_FOUND",
          message: `GitHub App installation ID ${installationId} was not found or has been uninstalled.`,
          status: 404,
          service: "github",
          cause: err,
        });
      }
      throw new AppError({
        code: "GITHUB_APP_ERROR",
        message: `GitHub App installation token exchange error: ${msg}`,
        status: 502,
        service: "github",
        cause: err,
      });
    }
  }

  /** Clears cached tokens (useful for testing or forced resets) */
  clearCache() {
    this.tokenCache.clear();
  }
}
