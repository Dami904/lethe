import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchJsonOrNull } from "../src/lib/llm/fetchWithTimeout.js";

/**
 * Regression coverage for the retry/backoff fix in
 * src/lib/llm/fetchWithTimeout.ts, covering two distinct failure modes both
 * hit live against Gemini in the same session:
 *
 * - 429: LongMemEval's extraction step fired ~150 calls back-to-back
 *   against a 15-req/min free-tier quota with zero pacing; the old
 *   fetchJsonOrNull gave up on the first 429 -- 134 of ~150 sessions failed
 *   extraction. Gemini's 429 body includes a `retryDelay` hint it expects
 *   callers to honor.
 * - Network error: immediately after fixing the 429 case, the very next
 *   ingest run hit ~256 `ENOTFOUND` failures from a transient WSL2 DNS
 *   blip, with zero 429s -- fetch() rejecting outright is a different code
 *   path than a non-ok response and needs its own retry.
 *
 * These tests fake `fetch` (no live network/API key needed) and fake timers
 * (no real waiting) to prove each retry actually happens, waits the right
 * amount, and still gives up cleanly (returns null, doesn't throw or hang)
 * once retries are exhausted.
 */
describe("fetchJsonOrNull retry/backoff", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
      text: async () => JSON.stringify(body),
      json: async () => body,
    };
  }

  describe("429 responses", () => {
    it("retries after the Gemini-shaped retryDelay hint and returns the eventual success", async () => {
      vi.useFakeTimers();
      const rateLimited = jsonResponse(429, {
        error: {
          details: [{ "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "12s" }],
        },
      });
      const success = jsonResponse(200, { ok: true });

      const fetchMock = vi.fn().mockResolvedValueOnce(rateLimited).mockResolvedValueOnce(success);
      vi.stubGlobal("fetch", fetchMock);

      const resultPromise = fetchJsonOrNull("https://example.test/generate", { method: "POST" });
      await vi.advanceTimersByTimeAsync(12_000);
      const result = await resultPromise;

      expect(result).toEqual({ ok: true });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("honors a standard Retry-After header over the Gemini JSON hint when both are present", async () => {
      vi.useFakeTimers();
      const rateLimited = jsonResponse(429, { error: {} }, { "retry-after": "3" });
      const success = jsonResponse(200, { ok: true });
      const fetchMock = vi.fn().mockResolvedValueOnce(rateLimited).mockResolvedValueOnce(success);
      vi.stubGlobal("fetch", fetchMock);

      const resultPromise = fetchJsonOrNull("https://example.test/generate", { method: "POST" });
      await vi.advanceTimersByTimeAsync(3_000);
      const result = await resultPromise;

      expect(result).toEqual({ ok: true });
    });

    it("gives up and returns null (not a hang or throw) once retries are exhausted", async () => {
      vi.useFakeTimers();
      const rateLimited = jsonResponse(429, { error: {} }, { "retry-after": "1" });
      const fetchMock = vi.fn().mockResolvedValue(rateLimited);
      vi.stubGlobal("fetch", fetchMock);

      const resultPromise = fetchJsonOrNull(
        "https://example.test/generate",
        { method: "POST" },
        8000,
        2, // maxRetries
      );
      await vi.advanceTimersByTimeAsync(1000);
      await vi.advanceTimersByTimeAsync(1000);
      const result = await resultPromise;

      expect(result).toBeNull();
      // Initial attempt + 2 retries = 3 calls total, never more.
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it("does not retry a non-429 failure status", async () => {
      vi.useFakeTimers();
      const serverError = jsonResponse(500, { error: "boom" });
      const fetchMock = vi.fn().mockResolvedValue(serverError);
      vi.stubGlobal("fetch", fetchMock);

      const result = await fetchJsonOrNull("https://example.test/generate", { method: "POST" });

      expect(result).toBeNull();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("thrown network errors (e.g. DNS failure)", () => {
    function dnsError(): Error {
      return Object.assign(new TypeError("fetch failed"), {
        cause: Object.assign(new Error("getaddrinfo ENOTFOUND generativelanguage.googleapis.com"), {
          code: "ENOTFOUND",
        }),
      });
    }

    it("retries after a fixed short backoff and returns the eventual success", async () => {
      vi.useFakeTimers();
      const fetchMock = vi
        .fn()
        .mockRejectedValueOnce(dnsError())
        .mockResolvedValueOnce(jsonResponse(200, { ok: true }));
      vi.stubGlobal("fetch", fetchMock);

      const resultPromise = fetchJsonOrNull("https://example.test/generate", { method: "POST" });
      await vi.advanceTimersByTimeAsync(2_000);
      const result = await resultPromise;

      expect(result).toEqual({ ok: true });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("gives up and returns null (not a hang or throw) once retries are exhausted", async () => {
      vi.useFakeTimers();
      const fetchMock = vi.fn().mockRejectedValue(dnsError());
      vi.stubGlobal("fetch", fetchMock);

      const resultPromise = fetchJsonOrNull(
        "https://example.test/generate",
        { method: "POST" },
        8000,
        2, // maxRetries
      );
      await vi.advanceTimersByTimeAsync(2_000);
      await vi.advanceTimersByTimeAsync(2_000);
      const result = await resultPromise;

      expect(result).toBeNull();
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });
  });
});
