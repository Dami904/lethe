import { fetchJsonOrNull } from "./fetchWithTimeout.js";
import type { GenerateTextInput, LlmProvider } from "./types.js";

/**
 * Confirmed live against Google's docs during development (the
 * `contents`/`system_instruction`/`generationConfig` envelope) -- a second,
 * unrelated doc fetch for structured-output mode returned an internally
 * inconsistent shape (looked like a different API's conventions), so this
 * provider deliberately does NOT rely on Gemini's schema-constrained JSON
 * mode; it asks for plain text and lets callers parse/validate it, same as
 * the other two providers. See docs/API_NOTES.md.
 */
const DEFAULT_MODEL = "gemini-3.7-flash";

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
}

export const geminiProvider: LlmProvider = {
  name: "gemini",
  async generateText(input: GenerateTextInput): Promise<string | null> {
    const apiKey = process.env["GEMINI_API_KEY"];
    if (!apiKey) return null;
    const model = process.env["GEMINI_MODEL"] ?? DEFAULT_MODEL;

    const body = await fetchJsonOrNull(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...(input.systemPrompt
            ? { system_instruction: { parts: { text: input.systemPrompt } } }
            : {}),
          contents: [{ role: "user", parts: [{ text: input.userPrompt }] }],
          generationConfig: {
            temperature: 0,
            maxOutputTokens: input.maxTokens ?? 256,
          },
        }),
      },
      input.timeoutMs,
    );
    if (!body) return null;

    const text = (body as GeminiResponse).candidates?.[0]?.content?.parts?.[0]?.text;
    return text ?? null;
  },
};
