import { describe, expect, it } from "vitest";
import { extractFactsFromSession } from "../src/ingest/extractFacts.js";
import type { LlmProvider } from "../src/lib/llm/index.js";

function fakeProvider(response: string | null): LlmProvider {
  return { name: "fake", generateText: async () => response };
}

describe("extractFactsFromSession", () => {
  it("parses a well-formed JSON array response", async () => {
    const provider = fakeProvider(
      JSON.stringify([
        { entity: "user", attribute: "home_city", content: "The user lives in London." },
      ]),
    );
    const result = await extractFactsFromSession(
      [{ role: "user", content: "I just moved to London." }],
      [],
      provider,
    );
    expect(result).toEqual([
      { entity: "user", attribute: "home_city", content: "The user lives in London." },
    ]);
  });

  it("strips a markdown code fence before parsing", async () => {
    const provider = fakeProvider(
      "```json\n" +
        JSON.stringify([{ entity: "user", attribute: "job_title", content: "Works as a nurse." }]) +
        "\n```",
    );
    const result = await extractFactsFromSession(
      [{ role: "user", content: "I'm a nurse now." }],
      [],
      provider,
    );
    expect(result).toEqual([{ entity: "user", attribute: "job_title", content: "Works as a nurse." }]);
  });

  it("returns an empty array for a session with nothing worth extracting", async () => {
    const provider = fakeProvider("[]");
    const result = await extractFactsFromSession(
      [{ role: "user", content: "Haha that's funny." }],
      [],
      provider,
    );
    expect(result).toEqual([]);
  });

  it("returns null (not a partial/garbage result) on malformed JSON", async () => {
    const provider = fakeProvider("this is not json at all");
    const result = await extractFactsFromSession([{ role: "user", content: "..." }], [], provider);
    expect(result).toBeNull();
  });

  it("returns null when a returned object fails schema validation (e.g. non-slug attribute)", async () => {
    const provider = fakeProvider(
      JSON.stringify([{ entity: "user", attribute: "Home City!", content: "..." }]),
    );
    const result = await extractFactsFromSession([{ role: "user", content: "..." }], [], provider);
    expect(result).toBeNull();
  });

  it("returns null when no provider is configured", async () => {
    const result = await extractFactsFromSession([{ role: "user", content: "..." }], [], null);
    expect(result).toBeNull();
  });

  it("passes known attribute slugs into the prompt so the model can reuse them", async () => {
    let capturedPrompt = "";
    const provider: LlmProvider = {
      name: "fake-capturing",
      generateText: async (input) => {
        capturedPrompt = input.userPrompt;
        return "[]";
      },
    };
    await extractFactsFromSession(
      [{ role: "user", content: "..." }],
      ["home_city", "job_title"],
      provider,
    );
    expect(capturedPrompt).toContain("home_city");
    expect(capturedPrompt).toContain("job_title");
  });
});
