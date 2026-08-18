import { fetchJsonOrNull } from "./fetchWithTimeout.js";
import type { GenerateTextInput, LlmProvider } from "./types.js";

const DEFAULT_MODEL = "claude-haiku-4-5-20251001";

interface AnthropicResponse {
  content?: Array<{ type: string; text?: string }>;
}

export const anthropicProvider: LlmProvider = {
  name: "anthropic",
  async generateText(input: GenerateTextInput): Promise<string | null> {
    const apiKey = process.env["ANTHROPIC_API_KEY"];
    if (!apiKey) return null;
    const model = process.env["ANTHROPIC_MODEL"] ?? DEFAULT_MODEL;

    const body = await fetchJsonOrNull(
      "https://api.anthropic.com/v1/messages",
      {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model,
          max_tokens: input.maxTokens ?? 256,
          ...(input.systemPrompt ? { system: input.systemPrompt } : {}),
          messages: [{ role: "user", content: input.userPrompt }],
        }),
      },
      input.timeoutMs,
    );
    if (!body) return null;

    const text = (body as AnthropicResponse).content?.find((c) => c.type === "text")?.text;
    return text ?? null;
  },
};
