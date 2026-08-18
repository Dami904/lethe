/**
 * Provider-agnostic LLM interface. Whoever clones this repo might have an
 * Anthropic, OpenAI, or Gemini key -- not necessarily the one we'd pick by
 * default -- so every LLM-dependent feature (conflict classification, fact
 * extraction) is written against this interface, not against one vendor's
 * SDK. See src/lib/llm/index.ts for how the active provider is selected.
 */
export interface GenerateTextInput {
  systemPrompt?: string;
  userPrompt: string;
  maxTokens?: number;
  /** Aborts the call and returns null rather than hanging a write. */
  timeoutMs?: number;
}

export interface LlmProvider {
  name: string;
  /**
   * Returns the raw text response, or null if the call failed, timed out,
   * or the provider has no API key configured. Callers MUST treat null as
   * "fall back to the non-LLM path" -- never as an error to surface to the
   * user, since an LLM-dependent feature being unavailable must never block
   * a write. See docs/LIMITATIONS.md.
   */
  generateText(input: GenerateTextInput): Promise<string | null>;
}
