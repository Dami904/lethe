import { describe, expect, it } from "vitest";
import { extractFactsFromSession } from "../src/ingest/extractFacts.js";
import { classifyRelation } from "../src/lib/conflictClassifier.js";
import { getLlmProvider } from "../src/lib/llm/index.js";

/**
 * Opt-in live test against whichever real LLM provider is configured
 * (ANTHROPIC_API_KEY / OPENAI_API_KEY / GEMINI_API_KEY). Skipped by
 * default -- set RUN_LIVE_LLM_TESTS=1 to run it. This is what actually
 * exercises the real HTTP request/response shape for each provider; the
 * rest of the suite only exercises the fixture-mocked path, same
 * discipline as "no live API key needed to run tests" for CI.
 */
const runLive = process.env["RUN_LIVE_LLM_TESTS"] === "1";

describe.skipIf(!runLive)("live LLM provider (opt-in, RUN_LIVE_LLM_TESTS=1)", () => {
  it("has a provider configured", () => {
    expect(getLlmProvider()).not.toBeNull();
  });

  it("extractFactsFromSession returns a real, schema-valid result for an obvious statement", async () => {
    const result = await extractFactsFromSession([
      { role: "user", content: "By the way, I just moved to Berlin last month." },
      { role: "assistant", content: "That's exciting! How are you settling in?" },
    ]);
    expect(result).not.toBeNull();
    expect(Array.isArray(result)).toBe(true);
    expect(result!.length).toBeGreaterThan(0);
    const home = result!.find((f) => f.content.toLowerCase().includes("berlin"));
    expect(home).toBeDefined();
  }, 30_000);

  it("classifyRelation correctly identifies a genuine contradiction", async () => {
    const result = await classifyRelation("The user lives in London.", "The user lives in Tokyo.", "home_city");
    expect(result).toBe("contradicts");
  }, 30_000);

  it("classifyRelation correctly identifies a paraphrase as 'same'", async () => {
    const result = await classifyRelation(
      "The French press ratio is 1 tablespoon per 6 ounces of water.",
      "It's one tablespoon of coffee to six ounces of water.",
      "french_press_ratio",
    );
    expect(result).toBe("same");
  }, 30_000);
});
