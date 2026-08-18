const DEFAULT_TIMEOUT_MS = 8000;

/** fetch() with an AbortController-based timeout, returning null on any failure (network, timeout, non-2xx) rather than throwing -- callers use null as the fallback signal, not an exception path. */
export async function fetchJsonOrNull(
  url: string,
  init: RequestInit,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<unknown | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) {
      console.error(`[llm] ${url} failed: ${response.status} ${await response.text().catch(() => "")}`);
      return null;
    }
    return await response.json();
  } catch (error) {
    console.error(`[llm] ${url} request failed:`, error);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
