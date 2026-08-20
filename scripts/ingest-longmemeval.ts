/**
 * Automated extraction + ingestion for a real subset of LongMemEval, the
 * oracle setting -- pre-identified evidence sessions, isolating
 * memory-reasoning correctness from retrieval quality, per the paper's own
 * recommended mode for this kind of comparison. Requires ANTHROPIC_API_KEY,
 * OPENAI_API_KEY, or GEMINI_API_KEY set (see src/lib/llm/index.ts) -- with
 * none set, every session's extraction returns null and nothing is
 * ingested; this script will say so plainly rather than silently doing
 * nothing.
 *
 * Data source defaults to data/longmemeval/eval_subset.json (23 instances:
 * 20 knowledge-update + 3 paired abstention) -- override with
 * LONGMEMEVAL_DATA_PATH, e.g. to point at
 * data/longmemeval/eval_subset_full.json (78 instances: all 72
 * knowledge-update + all 6 paired abstention in the oracle dataset).
 *
 * Run with: pnpm ingest:longmemeval
 * Or:       LONGMEMEVAL_DATA_PATH=data/longmemeval/eval_subset_full.json LONGMEMEVAL_LIMIT=50 pnpm ingest:longmemeval
 */
import "../src/loadEnv.js";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractFactsFromSession } from "../src/ingest/extractFacts.js";
import { parseLongMemEvalDate } from "../src/ingest/parseLongMemEvalDate.js";
import { getLlmProvider } from "../src/lib/llm/index.js";

const BASE_URL = process.env["LETHE_URL"] ?? "http://127.0.0.1:3000";
const DATA_PATH = path.resolve(
  process.cwd(),
  process.env["LONGMEMEVAL_DATA_PATH"] ?? "data/longmemeval/eval_subset.json",
);
// Every distinct DATA_PATH gets its own graph namespace AND its own output
// file -- found necessary live: this script's entity namespace used to be
// bare `${question_id}:${entity}`, with no discriminator for WHICH data
// file's extraction pass a fact came from. eval_subset_full.json (oracle,
// pre-filtered evidence sessions) and eval_subset_full_haystack.json (the
// real full 30-60 session haystack) both cover the SAME 78 question_ids,
// so running one after the other wrote two logically-different extraction
// generations into the SAME entity+attribute space in HydraDB -- risking
// spurious SUPERSEDES edges between an oracle-extracted fact and a
// full-haystack-extracted fact that happen to differ slightly in wording
// for what's actually the same underlying information, corrupting the
// exact invariant this project exists to guarantee. Tagging both the
// entity namespace and the output file by DATA_PATH's own basename makes
// two different datasets (or two runs of the same dataset with different
// LONGMEMEVAL_DATA_PATH values) structurally unable to collide, rather
// than relying on the operator to remember never to reuse a data file.
const DATASET_TAG = path.basename(DATA_PATH, path.extname(DATA_PATH));
const OUTPUT_PATH = path.resolve(process.cwd(), `.cache/ingested-longmemeval-${DATASET_TAG}.json`);

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
      // Namespaced per instance AND per dataset variant (see DATASET_TAG
      // above): LongMemEval's 500 instances each describe a DIFFERENT
      // synthetic persona, but the extractor defaults to the generic
      // entity name "user" for all of them. Without the instance prefix,
      // facts from unrelated instances would collide on entity+attribute;
      // without the dataset-tag prefix, running the oracle and
      // full-haystack variants of the SAME instance would collide with
      // each other instead.
      const namespacedEntity = `${DATASET_TAG}-${instance.question_id}:${fact.entity}`;

      const response = await fetch(`${BASE_URL}/facts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: `${DATASET_TAG}-${instance.question_id}-s${sessionIndex}`,
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

/**
 * Runs `worker` over `items` with at most `concurrency` in flight at once.
 * Instances are fully independent of each other (separate question_id
 * namespaces, no shared state -- see ingestInstance's namespacing comment),
 * so parallelizing ACROSS instances is safe and doesn't change extraction
 * behavior. Sessions WITHIN one instance stay sequential (see
 * ingestInstance) because knownAttributes deliberately accumulates across
 * a single instance's sessions to keep the extractor's attribute slugs
 * consistent -- parallelizing that would change what gets extracted, not
 * just how fast.
 *
 * Written by hand rather than pulling in a concurrency-limiter dependency
 * for one call site. Found necessary live: a naive sequential loop over
 * ~3,700 real full-haystack sessions left a 5-key rotation pool almost
 * entirely idle (only 1 rotation event in the first 7+ minutes, zero
 * instances completed) because each real extraction call's latency is
 * dominated by the model's own generation time, not rate-limit waits --
 * multiple keys only help if multiple requests are actually in flight
 * across them at once.
 */
async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let nextIndex = 0;
  async function runner(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      await worker(items[index]!, index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, runner));
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

  const allInstances = JSON.parse(readFileSync(DATA_PATH, "utf8")) as LongMemEvalInstance[];
  const limit = process.env["LONGMEMEVAL_LIMIT"] ? Number(process.env["LONGMEMEVAL_LIMIT"]) : undefined;
  const targetInstances = limit ? allInstances.slice(0, limit) : allInstances;

  // Resumable by design: the previous version only wrote OUTPUT_PATH once,
  // at the very end -- an interrupted run (killed to change config, a crash,
  // the process dying mid-run) lost every already-extracted fact's record,
  // even though the facts themselves were already durably written to
  // HydraDB via POST /facts. Found live: this exact scenario, needing to
  // restart mid-run with a different key pool after 28/78 instances had
  // already completed. Loading prior output and skipping already-completed
  // question_ids (not a raw index/count offset -- under concurrency,
  // instances finish out of dispatch order, so "first N by array position"
  // is not the same set as "first N to actually complete") makes a restart
  // safe and cheap instead of re-burning LLM quota re-extracting instances
  // already done. Pass LONGMEMEVAL_FRESH=1 to ignore prior output and start
  // clean.
  let allIngested: IngestedFactRecord[] = [];
  if (!process.env["LONGMEMEVAL_FRESH"] && existsSync(OUTPUT_PATH)) {
    try {
      allIngested = JSON.parse(readFileSync(OUTPUT_PATH, "utf8")) as IngestedFactRecord[];
    } catch {
      console.error(`Could not parse existing ${OUTPUT_PATH} as JSON -- starting fresh.`);
    }
  }
  const alreadyDone = new Set(allIngested.map((r) => r.instanceId));
  const instances = targetInstances.filter((i) => !alreadyDone.has(i.question_id));
  const skipped = targetInstances.length - instances.length;

  // Defaults to 5 to match a typical GEMINI_API_KEYS pool size (each key is
  // a separate GCP project's own 15 req/min quota -- see
  // src/lib/llm/geminiProvider.ts) -- override with LONGMEMEVAL_CONCURRENCY
  // if your pool is a different size, or 1 to restore strictly sequential
  // processing.
  const concurrency = process.env["LONGMEMEVAL_CONCURRENCY"]
    ? Number(process.env["LONGMEMEVAL_CONCURRENCY"])
    : 5;
  console.log(
    `Ingesting ${instances.length}${limit ? ` of ${allInstances.length}` : ""} LongMemEval instances into ${BASE_URL} (concurrency ${concurrency})` +
      `${skipped > 0 ? ` -- resuming, ${skipped} already completed and loaded from ${OUTPUT_PATH}` : ""} ...`,
  );

  if (instances.length === 0) {
    console.log("\nNothing left to do -- all target instances already completed.");
    console.log(`Wrote ${OUTPUT_PATH} for scripts/eval-longmemeval.ts.`);
    return;
  }

  if (!existsSync(path.dirname(OUTPUT_PATH))) mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });

  let totalSessionsFailed = 0;
  let completed = 0;

  await runWithConcurrency(instances, concurrency, async (instance) => {
    const { ingested, sessionsFailed } = await ingestInstance(instance);
    allIngested.push(...ingested);
    totalSessionsFailed += sessionsFailed;
    completed++;
    // Persist after every completed instance, not just at the end -- see
    // the resumability note above. A concurrent push from another worker
    // between building `allIngested` and this write is fine: JS is
    // single-threaded, so the push above and this write can't interleave
    // with another worker's push.
    writeFileSync(OUTPUT_PATH, JSON.stringify(allIngested, null, 2));
    // One atomic console.log per completed instance, not a write-then-log
    // pair -- with several instances finishing concurrently, interleaved
    // partial lines from separate instances would otherwise corrupt the
    // output.
    console.log(
      `  [${completed}/${instances.length}] ${instance.question_id} (${instance.question_type}): ${ingested.length} facts extracted${sessionsFailed > 0 ? ` (${sessionsFailed} sessions failed extraction)` : ""}`,
    );
  });

  console.log(`\nDone. ${allIngested.length} facts ingested across ${targetInstances.length} instances${skipped > 0 ? ` (${skipped} resumed from a prior run)` : ""}.`);
  if (totalSessionsFailed > 0) {
    console.log(`${totalSessionsFailed} sessions failed extraction and were skipped (not silently dropped -- logged above).`);
  }
  console.log(`Wrote ${OUTPUT_PATH} for scripts/eval-longmemeval.ts.`);
  console.log("\nRun `pnpm eval:longmemeval` next to score Lethe's supersession correctness on this data.");
}

// A raw `import.meta.url === \`file://${process.argv[1]}\`` string
// comparison (the common pattern for this check) is NOT cross-platform:
// on Windows, process.argv[1] uses backslashes and no leading slash before
// the drive letter, so it never matches import.meta.url's
// forward-slash/triple-slash form -- this made main() silently never run
// when this script was invoked directly on Windows (caught by actually
// running it: exit code 0, zero output, nothing ingested, no error at
// all). Comparing resolved filesystem paths instead is platform-safe.
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
