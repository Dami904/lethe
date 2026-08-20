import {
  fetchJsonSingleAttempt,
  MAX_RETRY_DELAY_MS,
  NETWORK_ERROR_RETRY_DELAY_MS,
  sleep,
} from "./fetchWithTimeout.js";
import type { GenerateTextInput, LlmProvider } from "./types.js";

/**
 * Confirmed live against Google's docs during development (the
 * `contents`/`system_instruction`/`generationConfig` envelope) -- a second,
 * unrelated doc fetch for structured-output mode returned an internally
 * inconsistent shape (looked like a different API's conventions), so this
 * provider deliberately does NOT rely on Gemini's schema-constrained JSON
 * mode; it asks for plain text and lets callers parse/validate it, same as
 * the other two providers. See docs/API_NOTES.md.
 *
 * Model default confirmed live against a real key's `/v1beta/models` list
 * and a real generateContent call, not guessed: `gemini-3.7-flash` (the
 * newest listed model at the time) returned persistent 503 "high demand"
 * errors that didn't clear on retry; `gemini-2.5-flash` is a 404
 * ("no longer available to new users"); `gemini-3.1-flash-lite` responded
 * cleanly. Override with GEMINI_MODEL if your key's availability differs.
 */
const DEFAULT_MODEL = "gemini-3.1-flash-lite";

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
}

/**
 * Free-tier quota (confirmed live via a real 429 body: `limit: 15,
 * model: gemini-3.1-flash-lite`, quotaId
 * `GenerateRequestsPerMinutePerProjectPerModel-FreeTier`) is per *project*,
 * not per key -- multiple keys under the same GCP project share one pool.
 * `GEMINI_API_KEYS` (comma- or newline-separated) lets each key be a
 * genuinely separate project, so a batch job can round-robin across them
 * and bench whichever one is currently rate-limited instead of blocking the
 * whole run on it. `GEMINI_API_KEY` (singular) still works unchanged for
 * one key -- this is purely additive.
 */
function getConfiguredKeys(): string[] {
  const multi = process.env["GEMINI_API_KEYS"];
  if (multi) {
    const keys = multi
      .split(/[,\n]/)
      .map((k) => k.trim())
      .filter(Boolean);
    if (keys.length > 0) return keys;
  }
  const single = process.env["GEMINI_API_KEY"];
  return single ? [single] : [];
}

export function hasGeminiKeyConfigured(): boolean {
  return getConfiguredKeys().length > 0;
}

// key string -> epoch ms it becomes usable again. Module-level so bench
// state survives across calls within one process (the whole point -- a key
// rate-limited on call N should stay benched for calls N+1, N+2, ... until
// its own delay elapses), not per-call state.
const benchedUntil = new Map<string, number>();
let roundRobinIndex = 0;

/** Test-only: this module's rotation state is otherwise process-lifetime, which would let one test's bench state/round-robin position leak into the next. */
export function __resetGeminiKeyRotationStateForTests(): void {
  benchedUntil.clear();
  roundRobinIndex = 0;
}

function pickAvailableKeyIndex(keys: string[], now: number): number {
  for (let i = 0; i < keys.length; i++) {
    const idx = (roundRobinIndex + i) % keys.length;
    if ((benchedUntil.get(keys[idx]!) ?? 0) <= now) return idx;
  }
  return -1;
}

function requestBody(input: GenerateTextInput): string {
  return JSON.stringify({
    ...(input.systemPrompt
      ? { system_instruction: { parts: { text: input.systemPrompt } } }
      : {}),
    contents: [{ role: "user", parts: [{ text: input.userPrompt }] }],
    generationConfig: {
      temperature: 0,
      maxOutputTokens: input.maxTokens ?? 256,
    },
  });
}

/**
 * 401 (bad key) and 403 (e.g. Gemini's very common "Generative Language API
 * not enabled" on a freshly created GCP project) ARE key-specific -- unlike
 * a 400/404/500/503, a different key can genuinely succeed where this one
 * won't. Benched much longer than a 429/network blip since it's unlikely to
 * self-resolve on the timescale of a retry, but not forever: the key stays
 * in rotation in case whatever was wrong (e.g. the API just not enabled
 * yet) gets fixed mid-run without needing a process restart.
 */
const AUTH_ERROR_BENCH_MS = 10 * 60_000;

/**
 * Ceiling on total wall-clock time this call will spend rotating/waiting
 * before giving up, independent of how the per-key bench delays stack up --
 * a defense-in-depth backstop, not the primary bound (that's `maxAttempts`
 * below). Without this, a pathological sequence of long server-provided
 * retryDelay hints could keep one call "still trying" for an unreasonable
 * time even though the attempt count looks bounded.
 */
const MAX_TOTAL_WAIT_MS = 5 * 60_000;

export const geminiProvider: LlmProvider = {
  name: "gemini",
  async generateText(input: GenerateTextInput): Promise<string | null> {
    const keys = getConfiguredKeys();
    if (keys.length === 0) return null;
    const model = process.env["GEMINI_MODEL"] ?? DEFAULT_MODEL;
    const multiKey = keys.length > 1;
    const callStartedAt = Date.now();

    // Bounded, not unlimited: every key benched forever (all persistently
    // invalid, say) must still terminate rather than spin. Counts only real
    // fetch attempts -- a "wait for the soonest key to free up" cycle is
    // not a wasted attempt and must NOT consume this budget, or sustained
    // simultaneous rate-limiting (the expected steady state under a 15
    // req/min/project quota with no proactive pacing -- see
    // docs/API_NOTES.md) burns through it via waits alone and gives up
    // long before 3 real passes over the pool actually happen.
    const maxAttempts = keys.length * 3;
    let realAttempts = 0;

    while (realAttempts < maxAttempts) {
      const now = Date.now();
      if (now - callStartedAt > MAX_TOTAL_WAIT_MS) {
        console.error(
          `[gemini] gave up after ${MAX_TOTAL_WAIT_MS}ms of total wait across ${realAttempts} attempt(s) on ${keys.length} key(s)`,
        );
        return null;
      }

      const keyIndex = pickAvailableKeyIndex(keys, now);

      if (keyIndex === -1) {
        const soonest = Math.min(...keys.map((k) => benchedUntil.get(k) ?? 0));
        const waitMs = Math.min(Math.max(soonest - now, 0), MAX_TOTAL_WAIT_MS - (now - callStartedAt));
        console.error(
          `[gemini] all ${keys.length} key(s) currently rate-limited, waiting ${waitMs}ms for the next one to free up...`,
        );
        await sleep(waitMs);
        continue; // does not consume realAttempts -- no fetch happened
      }

      roundRobinIndex = (keyIndex + 1) % keys.length;
      const key = keys[keyIndex]!;
      const keyLabel = multiKey ? ` (key ${keyIndex + 1}/${keys.length})` : "";

      const result = await fetchJsonSingleAttempt(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: requestBody(input),
        },
        input.timeoutMs,
      );
      realAttempts++;

      if (result.ok) {
        const text = (result.json as GeminiResponse).candidates?.[0]?.content?.parts?.[0]?.text;
        return text ?? null;
      }

      if (result.status === 429) {
        const waitMs = Math.min((result.retryAfterSeconds ?? 5) * 1000, MAX_RETRY_DELAY_MS);
        benchedUntil.set(key, now + waitMs);
        console.error(
          `[gemini] rate-limited (429)${keyLabel}, benched for ${waitMs}ms${multiKey ? "; trying next key" : ""}...`,
        );
        continue;
      }

      if (result.status === 401 || result.status === 403) {
        // Key-specific and unlikely to self-resolve quickly -- bench it
        // for much longer than a rate limit, but keep it in rotation
        // rather than dropping it permanently (see AUTH_ERROR_BENCH_MS).
        benchedUntil.set(key, now + AUTH_ERROR_BENCH_MS);
        console.error(
          `[gemini] auth error (${result.status})${keyLabel}, benched for ${AUTH_ERROR_BENCH_MS}ms${multiKey ? "; trying next key" : ""}: ${result.bodyText}`,
        );
        continue;
      }

      if (result.status === null) {
        // A thrown network error or an unparseable 2xx body -- not
        // necessarily specific to this key, but benching it briefly and
        // trying another (if any) keeps a batch job moving instead of
        // blocking on a transient blip. See docs/API_NOTES.md for the
        // WSL2 DNS blip this was found against.
        benchedUntil.set(key, now + NETWORK_ERROR_RETRY_DELAY_MS);
        console.error(
          `[gemini] request failed${keyLabel}, benching briefly${multiKey ? " and trying next key" : ""}:`,
          result.networkError,
        );
        continue;
      }

      if (result.status >= 500) {
        // 500/502/503/504 -- a provider-side outage, not this key's fault
        // specifically, but also not permanent: Gemini's own 503 body says
        // "Spikes in demand are usually temporary. Please try again
        // later," and empirically DOES clear within seconds on a retry.
        // Live-observed: previously this branch gave up on the whole
        // extraction call immediately on the first 503, discarding one
        // real session's worth of work outright rather than treating a
        // documented-transient condition as transient -- a genuine
        // reliability gap, not a hypothetical one. Benching (not the same
        // key forever, just briefly) and rotating keeps a batch job
        // moving through a provider blip the same way the network-error
        // branch above already does.
        benchedUntil.set(key, now + NETWORK_ERROR_RETRY_DELAY_MS);
        console.error(
          `[gemini] provider error (${result.status})${keyLabel}, benching briefly${multiKey ? " and trying next key" : ""}: ${result.bodyText}`,
        );
        continue;
      }

      // Any other non-ok status (400/404, ...) is treated as this call's
      // failure, not this key's -- retrying it against a different key is
      // unlikely to help a malformed request, and looping through the
      // whole pool on every such call would just multiply latency for no
      // benefit.
      console.error(`[gemini] failed${keyLabel}: ${result.status} ${result.bodyText}`);
      return null;
    }

    console.error(
      `[gemini] exhausted all ${keys.length} key(s) after ${realAttempts} real attempt(s), giving up`,
    );
    return null;
  },
};
