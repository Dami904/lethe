import { anthropicProvider } from "./anthropicProvider.js";
import { openaiProvider } from "./openaiProvider.js";
import { geminiProvider, hasGeminiKeyConfigured } from "./geminiProvider.js";
import type { LlmProvider } from "./types.js";

export type { GenerateTextInput, LlmProvider } from "./types.js";

/**
 * Picks whichever provider has a configured API key. Precedence
 * (Anthropic > OpenAI > Gemini) is arbitrary among the three -- whoever
 * clones this repo is expected to set exactly one -- and only matters if
 * someone sets more than one key at once. Returns null if none are
 * configured; every caller MUST treat that as "use the non-LLM fallback,"
 * not as an error. See docs/LIMITATIONS.md.
 *
 * Gemini alone also accepts `GEMINI_API_KEYS` (plural, comma/newline
 * separated) for multi-key rotation -- see geminiProvider.ts.
 * `hasGeminiKeyConfigured` recognizes either form.
 */
export function getLlmProvider(): LlmProvider | null {
  if (process.env["ANTHROPIC_API_KEY"]) return anthropicProvider;
  if (process.env["OPENAI_API_KEY"]) return openaiProvider;
  if (hasGeminiKeyConfigured()) return geminiProvider;
  return null;
}
