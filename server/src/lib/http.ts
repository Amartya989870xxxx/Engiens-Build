import { AppError, timeoutError } from "./errors.js";

export type FetchLike = typeof fetch;

export interface TimedFetchOptions extends RequestInit {
  timeoutMs: number;
  service: "github" | "tinyfish" | "gemini";
  context: string;
  fetchImpl?: FetchLike;
}

/**
 * `fetch` with a hard timeout that also honours an outer AbortSignal (e.g. the
 * client disconnected). Network failures are converted into safe AppErrors.
 */
export async function timedFetch(url: string, opts: TimedFetchOptions): Promise<Response> {
  const { timeoutMs, service, context, fetchImpl = fetch, signal: outer, ...init } = opts;
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const signal = outer ? AbortSignal.any([outer, timeoutSignal]) : timeoutSignal;
  try {
    return await fetchImpl(url, { ...init, signal });
  } catch (err) {
    if (timeoutSignal.aborted) throw timeoutError(service, context, timeoutMs);
    if (outer?.aborted) {
      throw new AppError({ code: "REQUEST_ABORTED", message: "The request was cancelled.", status: 499, service });
    }
    const label = { github: "GitHub", tinyfish: "TinyFish", gemini: "Gemini" }[service];
    throw new AppError({
      code: `${service.toUpperCase()}_UNREACHABLE`,
      message: `Could not reach ${label} while ${context}.`,
      status: 502,
      service,
      retryable: true,
      cause: err,
    });
  }
}

/** Runs async tasks with a bounded concurrency, preserving input order. */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i] as T, i);
    }
  });
  await Promise.all(workers);
  return results;
}

/** Reads a response body as text, refusing to buffer more than `maxBytes`. */
export async function readTextLimited(res: Response, maxBytes: number): Promise<{ text: string; truncated: boolean }> {
  if (!res.body) return { text: "", truncated: false };
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let text = "";
  let truncated = false;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > maxBytes) {
      const allowed = value.byteLength - (received - maxBytes);
      text += decoder.decode(value.subarray(0, Math.max(0, allowed)), { stream: false });
      truncated = true;
      await reader.cancel().catch(() => undefined);
      break;
    }
    text += decoder.decode(value, { stream: true });
  }
  if (!truncated) text += decoder.decode();
  return { text, truncated };
}

export function truncate(text: string, max: number): { text: string; truncated: boolean } {
  if (text.length <= max) return { text, truncated: false };
  return { text: `${text.slice(0, max)}\n…[truncated ${text.length - max} characters]`, truncated: true };
}
