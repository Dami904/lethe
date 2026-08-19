const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_MAX_RETRIES = 2;
const MAX_RETRY_DELAY_MS = 20_000;
const NETWORK_ERROR_RETRY_DELAY_MS = 2_000;

/**
 * Strips credential-shaped query params and the Authorization header before
 * a URL/request ever gets logged. Gemini's API key travels as a `?key=`
 * query parameter (not a header), so logging the request URL verbatim -- as
 * this module used to do -- leaked the live key into console/CI/hosting
 * logs on every failed call. This is a real fix for a real bug, not
 * speculative hardening: it was caught by seeing an actual key in test
 * output during development.
 */
function redactUrl(url: string): string {
  try {
    const parsed = new URL(url);
    for (const key of [...parsed.searchParams.keys()]) {
      if (/key|token|secret|auth/i.test(key)) {
        parsed.searchParams.set(key, "<redacted>");
      }
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * A 429 body's shape is provider-specific -- this only recognizes Gemini's
 * `error.details[].retryDelay` ("12s"-style) since that's the provider that
 * was actually observed hitting this path (its free tier is 15 req/min; a
 * batch ingest firing extraction calls back-to-back exhausts that in
 * seconds). Returns null, not a guessed default, when nothing parseable is
 * found -- the caller decides the fallback delay.
 */
function parseGeminiRetryDelaySeconds(bodyText: string): number | null {
  try {
    const parsed = JSON.parse(bodyText) as {
      error?: { details?: Array<{ retryDelay?: string }> };
    };
    for (const detail of parsed.error?.details ?? []) {
      const match = detail.retryDelay?.match(/^(\d+(?:\.\d+)?)s$/);
      if (match) return Number(match[1]);
    }
  } catch {
    // Not JSON, or not this shape -- fall through to null.
  }
  return null;
}

/**
 * fetch() with an AbortController-based timeout, returning null on any
 * failure (network, timeout, non-2xx) rather than throwing -- callers use
 * null as the fallback signal, not an exception path.
 *
 * Two distinct failure modes get `maxRetries` retries, both observed live
 * against Gemini during a real LongMemEval ingest run:
 *
 * - A 429 honors the server's own `Retry-After` header (standard) or
 *   Gemini's JSON `retryDelay` hint, capped at `MAX_RETRY_DELAY_MS` -- NOT a
 *   fixed client-side rate limit, since that would either be too
 *   conservative (slowing down providers/tiers that don't need it) or still
 *   wrong the moment a quota changes. Found by watching 134 of ~150 sessions
 *   fail extraction in a single un-paced burst against the free tier's
 *   15 req/min quota -- every failing call logged the exact wait the API
 *   asked for and this ignored it.
 * - A thrown network error (DNS, connection reset, etc. -- `fetch` rejects
 *   rather than resolving) gets a short fixed backoff instead, since there's
 *   no server-provided hint to honor. Found immediately after fixing the
 *   429 case: the very next ingest run hit ~256 `ENOTFOUND` failures from a
 *   transient WSL2 DNS blip, with zero 429s -- a completely different
 *   failure mode that the 429-only retry didn't cover.
 *
 * See docs/API_NOTES.md.
 */
export async function fetchJsonOrNull(
  url: string,
  init: RequestInit,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxRetries = DEFAULT_MAX_RETRIES,
): Promise<unknown | null> {
  const safeUrl = redactUrl(url);

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      if (!response.ok) {
        const bodyText = await response.text().catch(() => "");
        if (response.status === 429 && attempt < maxRetries) {
          const headerDelaySeconds = Number(response.headers.get("retry-after"));
          const delaySeconds =
            (Number.isFinite(headerDelaySeconds) && headerDelaySeconds > 0
              ? headerDelaySeconds
              : null) ?? parseGeminiRetryDelaySeconds(bodyText) ?? 5;
          const waitMs = Math.min(delaySeconds * 1000, MAX_RETRY_DELAY_MS);
          console.error(
            `[llm] ${safeUrl} rate-limited (429), retrying in ${waitMs}ms (attempt ${attempt + 1}/${maxRetries})...`,
          );
          clearTimeout(timer);
          await sleep(waitMs);
          continue;
        }
        if (response.status === 429) {
          console.error(
            `[llm] ${safeUrl} still rate-limited (429) after ${maxRetries} ${maxRetries === 1 ? "retry" : "retries"}, giving up: ${bodyText}`,
          );
        } else {
          console.error(`[llm] ${safeUrl} failed: ${response.status} ${bodyText}`);
        }
        return null;
      }
      const bodyText = await response.text();
      try {
        return JSON.parse(bodyText);
      } catch (parseError) {
        // A 2xx with an unparseable body is a different problem than a
        // network failure below (the request succeeded; the response
        // shape didn't) -- worth its own message so a stuck-ingest log
        // doesn't read as a network/DNS issue when it's actually a
        // malformed-response issue. Retrying is still harmless (a
        // completion call has no side effect to duplicate), so this falls
        // into the same retry path as a thrown network error.
        throw new Error(
          `response body was not valid JSON: ${(parseError as Error).message}`,
        );
      }
    } catch (error) {
      if (attempt < maxRetries) {
        console.error(
          `[llm] ${safeUrl} request failed, retrying in ${NETWORK_ERROR_RETRY_DELAY_MS}ms (attempt ${attempt + 1}/${maxRetries}):`,
          error,
        );
        clearTimeout(timer);
        await sleep(NETWORK_ERROR_RETRY_DELAY_MS);
        continue;
      }
      console.error(
        `[llm] ${safeUrl} still failing after ${maxRetries} ${maxRetries === 1 ? "retry" : "retries"}, giving up:`,
        error,
      );
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}
