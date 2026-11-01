import { z } from "zod";
import { ConfigError } from "../lib/errors.js";

/**
 * Server-side environment configuration.
 *
 * Secrets are read from the process environment only (populated from `.env`
 * by `loadDotEnv`). They are never logged, never serialised into responses and
 * never shipped to the client bundle.
 */
const envSchema = z.object({
  TINYFISH_API_KEY: z.string().trim().optional(),
  GEMINI_API_KEY: z.string().trim().optional(),
  GEMINI_MODEL: z.string().trim().min(1).default("gemini-3.8-flash"),
  GROQ_API_KEY: z.string().trim().optional(),
  GITHUB_TOKEN: z.string().trim().optional(),
  GITHUB_APP_ID: z.string().trim().optional(),
  GITHUB_INSTALLATION_ID: z.string().trim().optional(),
  GITHUB_PRIVATE_KEY_PATH: z.string().trim().optional(),
  PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  NODE_ENV: z.string().default("development"),
});

export interface AppConfig {
  tinyfishApiKey: string | undefined;
  geminiApiKey: string | undefined;
  geminiModel: string;
  groqApiKey: string | undefined;
  githubToken: string | undefined;
  githubAppId: string | undefined;
  githubInstallationId: string | undefined;
  githubPrivateKeyPath: string | undefined;
  port: number;
  nodeEnv: string;
}

const blankToUndefined = (value: string | undefined) => (value && value.length > 0 ? value : undefined);

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const names = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new ConfigError(`Invalid server environment configuration: ${names}`);
  }
  const e = parsed.data;
  return {
    tinyfishApiKey: blankToUndefined(e.TINYFISH_API_KEY),
    geminiApiKey: blankToUndefined(e.GEMINI_API_KEY),
    geminiModel: e.GEMINI_MODEL,
    groqApiKey: blankToUndefined(e.GROQ_API_KEY),
    githubToken: blankToUndefined(e.GITHUB_TOKEN),
    githubAppId: blankToUndefined(e.GITHUB_APP_ID),
    githubInstallationId: blankToUndefined(e.GITHUB_INSTALLATION_ID),
    githubPrivateKeyPath: blankToUndefined(e.GITHUB_PRIVATE_KEY_PATH),
    port: e.PORT,
    nodeEnv: e.NODE_ENV,
  };
}

/** Loads `.env` into `process.env` using Node's built-in loader (no dotenv dependency). */
export function loadDotEnv(path = ".env"): boolean {
  try {
    process.loadEnvFile(path);
    return true;
  } catch {
    return false;
  }
}

export function requireTinyFishKey(config: AppConfig): string {
  if (!config.tinyfishApiKey) {
    throw new ConfigError("TINYFISH_API_KEY is not configured on the server. Add it to .env and restart.", "tinyfish");
  }
  return config.tinyfishApiKey;
}

export function requireGeminiKey(config: AppConfig): string {
  if (!config.geminiApiKey) {
    throw new ConfigError("GEMINI_API_KEY is not configured on the server. Add it to .env and restart.", "gemini");
  }
  return config.geminiApiKey;
}

/** Every secret value currently loaded — used to scrub error messages. */
export function secretValues(config: AppConfig): string[] {
  return [
    config.tinyfishApiKey,
    config.geminiApiKey,
    config.groqApiKey,
    config.githubToken,
  ].filter((v): v is string => typeof v === "string" && v.length >= 6);
}
