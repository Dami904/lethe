import { describe, expect, it } from "vitest";
import { classifyRelation } from "../src/lib/conflictClassifier.js";
import type { LlmProvider } from "../src/lib/llm/index.js";

/**
 * Fixture-based tests: no live LLM calls, so this needs zero API keys to
 * run in CI (same discipline as the baseline harness). Each test injects a
 * fake provider whose `generateText` returns a canned response, exactly
 * mimicking what a real provider would return for that case.
 */
function fakeProvider(response: string | null): LlmProvider {
  return {
    name: "fake",
    generateText: async () => response,
  };
}

describe("classifyRelation", () => {
  it("classifies a paraphrase as 'same'", async () => {
    const provider = fakeProvider("same");
    const result = await classifyRelation(
      "The ratio is 1 tablespoon per 6 ounces of water.",
      "It's one tablespoon of coffee to six ounces of water.",
      "french_press_ratio",
      provider,
    );
    expect(result).toBe("same");
  });

  it("classifies a genuine update as 'contradicts'", async () => {
    const provider = fakeProvider("contradicts");
    const result = await classifyRelation("London", "Tokyo", "home_city", provider);
    expect(result).toBe("contradicts");
  });

  it("classifies unrelated statements as 'unrelated'", async () => {
    const provider = fakeProvider("unrelated");
    const result = await classifyRelation(
      "The user enjoys hiking on weekends.",
      "The user's favorite color is blue.",
      "misc",
      provider,
    );
    expect(result).toBe("unrelated");
  });

  it("returns null (triggering the caller's fallback) when no provider is configured", async () => {
    const result = await classifyRelation("A", "B", "attr", null);
    expect(result).toBeNull();
  });

  it("returns null when the provider call fails", async () => {
    const failingProvider: LlmProvider = {
      name: "fake-failing",
      generateText: async () => null,
    };
    const result = await classifyRelation("A", "B", "attr", failingProvider);
    expect(result).toBeNull();
  });

  it("returns null (not a guess) on an unparseable response, never defaulting to 'contradicts'", async () => {
    const weirdProvider = fakeProvider("I'm not sure, could be either honestly");
    const result = await classifyRelation("A", "B", "attr", weirdProvider);
    expect(result).toBeNull();
  });

  it("short-circuits to 'same' for identical content without calling the provider", async () => {
    let called = false;
    const provider: LlmProvider = {
      name: "fake-tracking",
      generateText: async () => {
        called = true;
        return "contradicts"; // if this were used, the test below would fail
      },
    };
    const result = await classifyRelation("identical text", "identical text", "attr", provider);
    expect(result).toBe("same");
    expect(called).toBe(false);
  });
});
