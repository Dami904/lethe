import { getLlmProvider } from "./llm/index.js";
import type { LlmProvider } from "./llm/index.js";
import { cacheKey, getCached, setCached } from "./classifierCache.js";

export type ConflictRelation = "same" | "contradicts" | "unrelated";

const VALID_RELATIONS: ConflictRelation[] = ["same", "contradicts", "unrelated"];

/**
 * Classifies the relationship between a prior fact's content and a
 * candidate new fact's content, for the same entity+attribute. This is a
 * natural-language-inference question (entailment / contradiction /
 * neutral), not a similarity question -- "I live in London" and "I live in
 * Tokyo" are ALSO highly similar as embeddings (same sentence template), so
 * cosine similarity can't distinguish a paraphrase from a contradiction.
 * That's why this calls a small LLM instead of reaching for a better
 * embedding model, which would not fix the actual problem.
 *
 * Returns null (never throws) when no LLM provider is configured, the call
 * fails, times out, or the response isn't one of the three exact expected
 * words -- callers MUST fall back to the exact-string-match heuristic in
 * that case, not block the write. See src/routes/facts.ts and
 * docs/LIMITATIONS.md for the honest accounting of residual risk: LLM
 * classification is not 100% reliable either.
 */
export async function classifyRelation(
  priorContent: string,
  newContent: string,
  attribute: string,
  provider: LlmProvider | null = getLlmProvider(),
): Promise<ConflictRelation | null> {
  if (!provider) return null;
  if (priorContent.trim() === newContent.trim()) return "same";

  const key = cacheKey(priorContent, newContent, `classify:${attribute}`);
  const cached = getCached(key);
  if (cached && (VALID_RELATIONS as string[]).includes(cached)) {
    return cached as ConflictRelation;
  }

  const systemPrompt =
    "You classify the relationship between two statements about the same " +
    "topic. Answer with exactly one word: \"same\" if they express the same " +
    "fact (including paraphrases, unit conversions, or restatements), " +
    "\"contradicts\" if the second statement is an update that invalidates " +
    "the first, or \"unrelated\" if they are about different things despite " +
    "sharing a topic label. Respond with only that one word, nothing else.";
  const userPrompt =
    `Topic: ${attribute}\n` +
    `Statement A (earlier): ${priorContent}\n` +
    `Statement B (later): ${newContent}\n` +
    "Relationship of B to A:";

  const raw = await provider.generateText({
    systemPrompt,
    userPrompt,
    maxTokens: 8,
    timeoutMs: 8000,
  });
  if (!raw) return null;

  const word = raw.trim().toLowerCase().replace(/[^a-z]/g, "");
  if (!(VALID_RELATIONS as string[]).includes(word)) {
    // Ambiguous/unparseable response -- an incorrect supersession is worse
    // than a duplicate (it can make /recall return the wrong answer), so
    // this does NOT default to "contradicts". Falling back to null lets
    // the caller use the exact-string heuristic instead of guessing.
    return null;
  }

  setCached(key, word);
  return word as ConflictRelation;
}
