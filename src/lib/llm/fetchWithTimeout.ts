const DEFAULT_TIMEOUT_MS = 8000;

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

/** fetch() with an AbortController-based timeout, returning null on any failure (network, timeout, non-2xx) rather than throwing -- callers use null as the fallback signal, not an exception path. */
export async function fetchJsonOrNull(
  url: string,
  init: RequestInit,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<unknown | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const safeUrl = redactUrl(url);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) {
      console.error(`[llm] ${safeUrl} failed: ${response.status} ${await response.text().catch(() => "")}`);
      return null;
    }
    return await response.json();
  } catch (error) {
    console.error(`[llm] ${safeUrl} request failed:`, error);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
