import { z } from "zod";
import { getLlmProvider } from "../lib/llm/index.js";
import type { LlmProvider } from "../lib/llm/index.js";

export interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
}

const ExtractedFactSchema = z.object({
  entity: z.string().min(1),
  attribute: z
    .string()
    .min(1)
    .regex(/^[a-z0-9_]+$/, "attribute must be a canonical snake_case slug"),
  content: z.string().min(1),
});
export type ExtractedFact = z.infer<typeof ExtractedFactSchema>;

const ExtractedFactsSchema = z.array(ExtractedFactSchema);

function stripCodeFence(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  return (fenced?.[1] ?? text).trim();
}

/**
 * Extracts (entity, attribute, content) triples from one raw conversation
 * session, via an LLM call -- LongMemEval ships full multi-turn
 * transcripts, not pre-extracted triples, so this is the step that has to
 * exist between "raw conversation" and something `writeFact` can use.
 *
 * `knownAttributes` should be the attribute slugs already extracted
 * earlier in the SAME instance (across prior sessions), so the model
 * reuses an existing slug for an update rather than minting a new one --
 * without this, a later session updating "home_city" could come back
 * slugged "current_city" instead, silently breaking the supersession
 * chain the whole pipeline exists to produce. This is a real, imperfect
 * mitigation, not a guarantee -- see docs/LIMITATIONS.md.
 *
 * Returns null (never throws) if no provider is configured, the call
 * fails/times out, or the response doesn't validate against the schema.
 * Callers must treat null as "no facts extracted from this session," not
 * as a fatal error for the whole ingestion run.
 */
export async function extractFactsFromSession(
  turns: ConversationTurn[],
  knownAttributes: string[] = [],
  provider: LlmProvider | null = getLlmProvider(),
): Promise<ExtractedFact[] | null> {
  if (!provider) return null;
  if (turns.length === 0) return [];

  const systemPrompt =
    "You extract discrete factual statements from a conversation about a " +
    "user (and any other named people mentioned). For each statement that " +
    "states or updates a fact, output an entity (a name, or \"user\" for " +
    "the primary speaker), an attribute (a short canonical snake_case slug, " +
    "e.g. home_city, job_title), and content (the fact as one self-contained " +
    "sentence). If a statement updates something whose topic matches one of " +
    "the already-known attribute slugs given below, reuse that EXACT slug -- " +
    "do not mint a new one for the same topic. Ignore small talk, questions, " +
    "and anything not asserting a fact. Respond with ONLY a JSON array of " +
    '{"entity": "...", "attribute": "...", "content": "..."} objects, no ' +
    "markdown fences, no explanation. If nothing is worth extracting, " +
    "respond with an empty array: []";

  const transcript = turns.map((t) => `${t.role}: ${t.content}`).join("\n");
  const userPrompt =
    (knownAttributes.length > 0
      ? `Already-known attribute slugs for this conversation: ${knownAttributes.join(", ")}\n\n`
      : "") + `Conversation:\n${transcript}\n\nExtract facts as a JSON array.`;

  const raw = await provider.generateText({
    systemPrompt,
    userPrompt,
    maxTokens: 1024,
    timeoutMs: 20_000,
  });
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripCodeFence(raw));
  } catch (error) {
    console.error("[extractFacts] response was not valid JSON:", error, raw);
    return null;
  }

  const result = ExtractedFactsSchema.safeParse(parsed);
  if (!result.success) {
    console.error("[extractFacts] response failed schema validation:", result.error.message, parsed);
    return null;
  }
  return result.data;
}
