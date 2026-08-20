import { fetchJsonOrNull } from "./fetchWithTimeout.js";
import type { GenerateTextInput, LlmProvider } from "./types.js";

/**
 * Local inference via Ollama (https://ollama.com), running in a Docker
 * container alongside HydraDB/MinIO -- see scripts/hydradb-up.sh for the
 * pattern this follows. Built specifically to take BEAM's extraction load
 * entirely off the shared Gemini key pool: no rate limit, no per-project
 * quota, no network dependency at all, at the cost of a smaller/weaker
 * model than Gemini and CPU-only inference speed (no GPU passthrough
 * assumed) -- a real quality/latency tradeoff, not a free win. See
 * docs/API_NOTES.md and docs/LIMITATIONS.md.
 *
 * Not wired into `getLlmProvider()`'s automatic selection
 * (src/lib/llm/index.ts) -- unlike the other three providers, this one is
 * deliberately opt-in per call site (see scripts/ingest-beam.ts), since the
 * point is to run it *alongside* Gemini for a different dataset, not to
 * have it silently win provider-selection precedence over an intentionally
 * configured cloud key.
 */
const OLLAMA_URL = process.env["OLLAMA_URL"] ?? "http://127.0.0.1:11434";
const DEFAULT_MODEL = "qwen2.5:3b";

/**
 * `extractFactsFromSession` (src/ingest/extractFacts.ts) hardcodes
 * `timeoutMs: 20_000`, sized for a cloud API -- confirmed live, that's not
 * enough for this model's CPU-only inference on a real (not toy) extraction
 * prompt even at a warm start (one measured call: 24s on a short prompt;
 * real session content is longer). Every caller of this provider gets at
 * least this floor regardless of what they pass, since 20s is simply not a
 * realistic budget for this workload -- not overridable down, since a
 * shorter timeout here just means routine failed calls burning CPU for
 * nothing, not a real safety mechanism.
 */
const MIN_TIMEOUT_MS = 300_000;

interface OllamaGenerateResponse {
  response?: string;
}

export const ollamaProvider: LlmProvider = {
  name: "ollama",
  async generateText(input: GenerateTextInput): Promise<string | null> {
    const model = process.env["OLLAMA_MODEL"] ?? DEFAULT_MODEL;

    const body = await fetchJsonOrNull(
      `${OLLAMA_URL}/api/generate`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model,
          prompt: input.userPrompt,
          ...(input.systemPrompt ? { system: input.systemPrompt } : {}),
          stream: false,
          options: {
            temperature: 0,
            num_predict: input.maxTokens ?? 256,
          },
        }),
      },
      // See MIN_TIMEOUT_MS above. No rate-limit retry needed here (no 429s
      // from a local server), so maxRetries=0.
      Math.max(input.timeoutMs ?? MIN_TIMEOUT_MS, MIN_TIMEOUT_MS),
      0,
    );
    if (!body) return null;

    const text = (body as OllamaGenerateResponse).response;
    return text ?? null;
  },
};
