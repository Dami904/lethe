import { afterEach, describe, expect, it, vi } from "vitest";
import {
  __resetGeminiKeyRotationStateForTests,
  geminiProvider,
  hasGeminiKeyConfigured,
} from "../src/lib/llm/geminiProvider.js";

/**
 * Coverage for GEMINI_API_KEYS multi-key rotation (src/lib/llm/geminiProvider.ts),
 * added under time pressure ahead of a large real batch ingest -- see
 * docs/API_NOTES.md. Free-tier quota is per Google Cloud PROJECT, not per
 * key, so this is meant to round-robin across genuinely separate projects
 * and bench whichever one just hit a 429 instead of stalling the whole run
 * on it. Fakes `fetch` and timers (no live network/API keys, no real
 * waiting) to prove the rotation actually happens rather than trusting it
 * unverified on an hours-long unattended run.
 *
 * Each test uses its own unique fake key strings so the module-level bench
 * state from one test can't leak into another.
 */
describe("geminiProvider multi-key rotation", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    delete process.env["GEMINI_API_KEY"];
    delete process.env["GEMINI_API_KEYS"];
    __resetGeminiKeyRotationStateForTests();
  });

  function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
      text: async () => JSON.stringify(body),
    };
  }

  function geminiSuccess(text: string) {
    return jsonResponse(200, { candidates: [{ content: { parts: [{ text }] } }] });
  }

  function rateLimited(retryAfterSeconds: string) {
    return jsonResponse(429, { error: {} }, { "retry-after": retryAfterSeconds });
  }

  it("hasGeminiKeyConfigured recognizes both GEMINI_API_KEY and GEMINI_API_KEYS", () => {
    process.env["GEMINI_API_KEY"] = "single-key-a";
    expect(hasGeminiKeyConfigured()).toBe(true);
    delete process.env["GEMINI_API_KEY"];
    expect(hasGeminiKeyConfigured()).toBe(false);

    process.env["GEMINI_API_KEYS"] = "key-b,key-c";
    expect(hasGeminiKeyConfigured()).toBe(true);
  });

  it("a 429 on one key immediately switches to the next key instead of sleeping", async () => {
    process.env["GEMINI_API_KEYS"] = "rotate-key-1,rotate-key-2";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(rateLimited("999")) // key 1: rate-limited for a long time
      .mockResolvedValueOnce(geminiSuccess("second key answered")); // key 2: succeeds
    vi.stubGlobal("fetch", fetchMock);

    // No fake timers armed, and no advanceTimersByTimeAsync call -- if this
    // resolves at all without hanging, it did NOT sleep out the 999s delay,
    // i.e. it actually rotated rather than backing off on the same key.
    const result = await geminiProvider.generateText({ userPrompt: "hi" });

    expect(result).toBe("second key answered");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstUrl = fetchMock.mock.calls[0]![0] as string;
    const secondUrl = fetchMock.mock.calls[1]![0] as string;
    expect(firstUrl).toContain("key=rotate-key-1");
    expect(secondUrl).toContain("key=rotate-key-2");
  });

  it("a benched key is skipped on a later call until its delay elapses", async () => {
    process.env["GEMINI_API_KEYS"] = "bench-key-1,bench-key-2";
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(rateLimited("30")) // key 1 benched for 30s
      .mockResolvedValueOnce(geminiSuccess("first call via key 2"))
      // key 1 is still within its 30s bench on this second call (elapsed < 30s below)
      .mockResolvedValueOnce(geminiSuccess("second call via key 2 again"));
    vi.stubGlobal("fetch", fetchMock);

    const first = await geminiProvider.generateText({ userPrompt: "one" });
    expect(first).toBe("first call via key 2");

    await vi.advanceTimersByTimeAsync(5_000); // well under key 1's 30s bench
    const second = await geminiProvider.generateText({ userPrompt: "two" });
    expect(second).toBe("second call via key 2 again");

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1]![0] as string).toContain("key=bench-key-2");
    expect(fetchMock.mock.calls[2]![0] as string).toContain("key=bench-key-2");
  });

  it("waits for the soonest key to free up when every key is currently benched", async () => {
    process.env["GEMINI_API_KEYS"] = "allbenched-key-1,allbenched-key-2";
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(rateLimited("10")) // key 1 benched 10s
      .mockResolvedValueOnce(rateLimited("3")) // key 2 benched 3s (the soonest)
      .mockResolvedValueOnce(geminiSuccess("answered once key 2 freed up"));
    vi.stubGlobal("fetch", fetchMock);

    const resultPromise = geminiProvider.generateText({ userPrompt: "hi" });
    await vi.advanceTimersByTimeAsync(3_000);
    const result = await resultPromise;

    expect(result).toBe("answered once key 2 freed up");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("falls back to the single GEMINI_API_KEY when GEMINI_API_KEYS is unset", async () => {
    process.env["GEMINI_API_KEY"] = "legacy-single-key";
    const fetchMock = vi.fn().mockResolvedValueOnce(geminiSuccess("legacy path works"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await geminiProvider.generateText({ userPrompt: "hi" });

    expect(result).toBe("legacy path works");
    expect(fetchMock.mock.calls[0]![0] as string).toContain("key=legacy-single-key");
  });

  it("returns null without calling fetch when no key is configured at all", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await geminiProvider.generateText({ userPrompt: "hi" });

    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a non-429, non-network, non-auth failure (e.g. 400) does not spin through the rest of the pool", async () => {
    process.env["GEMINI_API_KEYS"] = "badreq-key-1,badreq-key-2";
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(400, { error: "bad request" }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await geminiProvider.generateText({ userPrompt: "hi" });

    expect(result).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("a 403 (e.g. API not enabled on a fresh project) is treated as key-specific: it rotates to the next key instead of failing the call", async () => {
    process.env["GEMINI_API_KEYS"] = "disabled-key-1,disabled-key-2";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(403, { error: "Generative Language API has not been used" }))
      .mockResolvedValueOnce(geminiSuccess("second key worked"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await geminiProvider.generateText({ userPrompt: "hi" });

    expect(result).toBe("second key worked");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]![0] as string).toContain("key=disabled-key-1");
    expect(fetchMock.mock.calls[1]![0] as string).toContain("key=disabled-key-2");
  });

  it("a 401 also rotates rather than failing the call outright", async () => {
    process.env["GEMINI_API_KEYS"] = "revoked-key-1,revoked-key-2";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, { error: "invalid API key" }))
      .mockResolvedValueOnce(geminiSuccess("second key worked"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await geminiProvider.generateText({ userPrompt: "hi" });

    expect(result).toBe("second key worked");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("a 'wait for the key to free up' cycle does not consume the real-attempt budget (single key, 2 full rate-limit rounds before success)", async () => {
    // Deliberately a single key: with only one key, every 429 immediately
    // triggers the "no available key, wait for soonest" branch (there's
    // nothing else to rotate to) -- the exact branch the audit found was
    // incrementing the shared attempt counter. With maxAttempts = 1 * 3 = 3
    // for one key, the pre-fix code interleaved [fetch, wait, fetch, wait,
    // ...] and counted every one of those as an "attempt", so it gave up
    // after only 2 real fetches -- before this 3rd, successful one ever
    // happened. Fixed code counts only real fetches, so 3 real attempts
    // (2 rate-limited + 1 success) stays within budget regardless of how
    // many wait cycles happened between them.
    process.env["GEMINI_API_KEY"] = "single-cycling-key";
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(rateLimited("2"))
      .mockResolvedValueOnce(rateLimited("2"))
      .mockResolvedValueOnce(geminiSuccess("succeeded on the 3rd real attempt"));
    vi.stubGlobal("fetch", fetchMock);

    const resultPromise = geminiProvider.generateText({ userPrompt: "hi" });
    await vi.advanceTimersByTimeAsync(2_000);
    await vi.advanceTimersByTimeAsync(2_000);
    const result = await resultPromise;

    expect(result).toBe("succeeded on the 3rd real attempt");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
