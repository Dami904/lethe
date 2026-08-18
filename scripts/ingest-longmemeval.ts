/**
 * Automated extraction + ingestion for a real subset of LongMemEval (see
 * data/longmemeval/eval_subset.json: 20 knowledge-update instances + 3
 * paired abstention instances, the oracle setting -- pre-identified
 * evidence sessions, isolating memory-reasoning correctness from retrieval
 * quality, per the paper's own recommended mode for this kind of
 * comparison). Requires ANTHROPIC_API_KEY, OPENAI_API_KEY, or
 * GEMINI_API_KEY set (see src/lib/llm/index.ts) -- with none set, every
 * session's extraction returns null and nothing is ingested; this script
 * will say so plainly rather than silently doing nothing.
 *
 * Run with: pnpm ingest:longmemeval
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { extractFactsFromSession } from "../src/ingest/extractFacts.js";
import { parseLongMemEvalDate } from "../src/ingest/parseLongMemEvalDate.js";
import { getLlmProvider } from "../src/lib/llm/index.js";

const BASE_URL = process.env["LETHE_URL"] ?? "http://127.0.0.1:3000";
const DATA_PATH = path.resolve(process.cwd(), "data/longmemeval/eval_subset.json");
const OUTPUT_PATH = path.resolve(process.cwd(), ".cache/ingested-longmemeval.json");

interface LongMemEvalInstance {
  question_id: string;
  question_type: string;
  question: string;
  answer: string;
  question_date: string;
  haystack_session_ids: string[];
  haystack_dates: string[];
  haystack_sessions: Array<Array<{ role: string; content: string; has_answer?: boolean }>>;
}

export interface IngestedFactRecord {
  instanceId: string;
  entity: string; // namespaced, e.g. "abc123:user"
  attribute: string;
  content: string;
  timestamp: string;
}

export async function ingestInstance(
  instance: LongMemEvalInstance,
): Promise<{ ingested: IngestedFactRecord[]; sessionsFailed: number }> {
  const order = instance.haystack_dates
    .map((_, i) => i)
    .sort((a, b) => instance.haystack_dates[a]!.localeCompare(instance.haystack_dates[b]!));

  const ingested: IngestedFactRecord[] = [];
  const knownAttributes = new Set<string>();
  let sessionsFailed = 0;

  for (const sessionIndex of order) {
    const turns = (instance.haystack_sessions[sessionIndex] ?? []).map((t) => ({
      role: (t.role === "assistant" ? "assistant" : "user") as "user" | "assistant",
      content: t.content,
    }));
    const timestamp = parseLongMemEvalDate(instance.haystack_dates[sessionIndex]!);

    const extracted = await extractFactsFromSession(turns, [...knownAttributes]);
    if (extracted === null) {
      sessionsFailed++;
      continue;
    }

    for (const fact of extracted) {
      knownAttributes.add(fact.attribute);
      // Namespaced per instance: LongMemEval's 500 instances each describe a
      // DIFFERENT synthetic persona, but the extractor defaults to the
      // generic entity name "user" for all of them. Without this prefix,
      // facts from unrelated instances would collide on entity+attribute
      // and produce spurious cross-instance SUPERSEDES edges.
      const namespacedEntity = `${instance.question_id}:${fact.entity}`;

      const response = await fetch(`${BASE_URL}/facts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: `${instance.question_id}-s${sessionIndex}`,
          entity: namespacedEntity,
          attribute: fact.attribute,
          content: fact.content,
          timestamp,
        }),
      });
      if (!response.ok) {
        console.error(
          `  ingest failed for ${namespacedEntity}/${fact.attribute}: ${response.status}`,
        );
        continue;
      }
      ingested.push({
        instanceId: instance.question_id,
        entity: namespacedEntity,
        attribute: fact.attribute,
        content: fact.content,
        timestamp,
      });
    }
  }

  return { ingested, sessionsFailed };
}

async function main(): Promise<void> {
  if (!getLlmProvider()) {
    console.error(
      "No LLM provider configured (set ANTHROPIC_API_KEY, OPENAI_API_KEY, or GEMINI_API_KEY). " +
        "Nothing will be extracted. See .env.example.",
    );
    process.exitCode = 1;
    return;
  }

  const instances = JSON.parse(readFileSync(DATA_PATH, "utf8")) as LongMemEvalInstance[];
  console.log(`Ingesting ${instances.length} LongMemEval instances into ${BASE_URL} ...`);

  const allIngested: IngestedFactRecord[] = [];
  let totalSessionsFailed = 0;

  for (const instance of instances) {
    process.stdout.write(`  ${instance.question_id} (${instance.question_type})... `);
    const { ingested, sessionsFailed } = await ingestInstance(instance);
    allIngested.push(...ingested);
    totalSessionsFailed += sessionsFailed;
    console.log(`${ingested.length} facts extracted${sessionsFailed > 0 ? ` (${sessionsFailed} sessions failed extraction)` : ""}`);
  }

  if (!existsSync(path.dirname(OUTPUT_PATH))) mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, JSON.stringify(allIngested, null, 2));

  console.log(`\nDone. ${allIngested.length} facts ingested across ${instances.length} instances.`);
  if (totalSessionsFailed > 0) {
    console.log(`${totalSessionsFailed} sessions failed extraction and were skipped (not silently dropped -- logged above).`);
  }
  console.log(`Wrote ${OUTPUT_PATH} for scripts/eval-longmemeval.ts.`);
  console.log("\nRun `pnpm eval:longmemeval` next to score Lethe's supersession correctness on this data.");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
