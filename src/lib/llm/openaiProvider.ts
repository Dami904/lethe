import { fetchJsonOrNull } from "./fetchWithTimeout.js";
import type { GenerateTextInput, LlmProvider } from "./types.js";

const DEFAULT_MODEL = "gpt-4o-mini";

interface OpenAiResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

export const openaiProvider: LlmProvider = {
  name: "openai",
  async generateText(input: GenerateTextInput): Promise<string | null> {
    const apiKey = process.env["OPENAI_API_KEY"];
    if (!apiKey) return null;
    const model = process.env["OPENAI_MODEL"] ?? DEFAULT_MODEL;

    const messages = [
      ...(input.systemPrompt ? [{ role: "system", content: input.systemPrompt }] : []),
      { role: "user", content: input.userPrompt },
    ];

    const body = await fetchJsonOrNull(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages,
          max_tokens: input.maxTokens ?? 256,
          temperature: 0,
        }),
      },
      input.timeoutMs,
    );
    if (!body) return null;

    const text = (body as OpenAiResponse).choices?.[0]?.message?.content;
    return text ?? null;
  },
};
