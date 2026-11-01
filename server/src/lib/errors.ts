import type { ErrorService } from "../../../shared/contract.js";

/**
 * Categorised application error. `message` is always safe to show to users:
 * it never contains credentials, upstream auth headers or raw response bodies.
 */
export class AppError extends Error {
  readonly code: string;
  readonly status: number;
  readonly service: ErrorService;
  readonly retryable: boolean;
  readonly details?: unknown;

  constructor(opts: {
    code: string;
    message: string;
    status: number;
    service: ErrorService;
    retryable?: boolean;
    details?: unknown;
    cause?: unknown;
  }) {
    super(opts.message, { cause: opts.cause });
    this.name = "AppError";
    this.code = opts.code;
    this.status = opts.status;
    this.service = opts.service;
    this.retryable = opts.retryable ?? false;
    this.details = opts.details;
  }
}

export class ConfigError extends AppError {
  constructor(message: string, service: ErrorService = "config") {
    super({ code: "CONFIGURATION_ERROR", message, status: 500, service, retryable: false });
    this.name = "ConfigError";
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super({ code: "INVALID_INPUT", message, status: 400, service: "validation", details });
    this.name = "ValidationError";
  }
}

/** Maps an upstream HTTP status to a safe, categorised error. */
export function upstreamError(service: "github" | "tinyfish" | "gemini", status: number, context: string): AppError {
  const label = { github: "GitHub", tinyfish: "TinyFish", gemini: "Gemini" }[service];
  if (status === 401 || status === 403) {
    return new AppError({
      code: `${service.toUpperCase()}_AUTH_FAILED`,
      message: `${label} rejected the request credentials while ${context}. Check the server-side API key.`,
      status: 502,
      service,
    });
  }
  if (status === 404) {
    return new AppError({
      code: `${service.toUpperCase()}_NOT_FOUND`,
      message: `${label} returned "not found" while ${context}.`,
      status: 404,
      service,
    });
  }
  if (status === 429) {
    return new AppError({
      code: `${service.toUpperCase()}_RATE_LIMITED`,
      message: `${label} rate limit reached while ${context}. Wait a moment and try again.`,
      status: 429,
      service,
      retryable: true,
    });
  }
  return new AppError({
    code: `${service.toUpperCase()}_UPSTREAM_ERROR`,
    message: `${label} returned HTTP ${status} while ${context}.`,
    status: 502,
    service,
    retryable: status >= 500,
  });
}

export function timeoutError(service: "github" | "tinyfish" | "gemini", context: string, ms: number): AppError {
  const label = { github: "GitHub", tinyfish: "TinyFish", gemini: "Gemini" }[service];
  return new AppError({
    code: `${service.toUpperCase()}_TIMEOUT`,
    message: `${label} did not respond within ${Math.round(ms / 1000)}s while ${context}.`,
    status: 504,
    service,
    retryable: true,
  });
}

export function invalidResponseError(service: "github" | "tinyfish" | "gemini", context: string, details?: unknown): AppError {
  const label = { github: "GitHub", tinyfish: "TinyFish", gemini: "Gemini" }[service];
  return new AppError({
    code: `${service.toUpperCase()}_INVALID_RESPONSE`,
    message: `${label} returned an unexpected response while ${context}.`,
    status: 502,
    service,
    retryable: false,
    details,
  });
}

/** Removes any loaded secret values and common key shapes from a string. */
export function redactSecrets(text: string, secrets: readonly string[] = []): string {
  let out = text;
  for (const secret of secrets) {
    if (secret) out = out.split(secret).join("[REDACTED]");
  }
  return out
    .replace(/sk-tinyfish-[A-Za-z0-9_-]+/g, "[REDACTED]")
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, "[REDACTED]")
    .replace(/\bAQ\.[A-Za-z0-9_-]{20,}/g, "[REDACTED]")
    .replace(/gh[pousr]_[A-Za-z0-9]{20,}/g, "[REDACTED]")
    .replace(/(x-api-key|x-goog-api-key|authorization)\s*[:=]\s*\S+/gi, "$1: [REDACTED]");
}
