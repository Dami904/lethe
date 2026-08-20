/**
 * Automated extraction + ingestion for BEAM (mohammadtavakoli78/BEAM), a
 * long-term-memory benchmark distinct from LongMemEval: real multi-turn
 * conversations split into dated "batches" (this script's analogue of a
 * LongMemEval "session"), each chat shipped with hand-authored probing
 * questions across 10 memory-ability categories including
 * knowledge_update, contradiction_resolution, and abstention -- the same
 * abilities this project's core invariant targets, on a genuinely
 * different dataset/format than LongMemEval.
 *
 * BEAM is NOT bundled in this repo (its smallest tier alone is ~40MB of
 * JSON per chat across 20+ chats, and larger tiers run into GBs) --
 * clone https://github.com/mohammadtavakoli78/BEAM yourself and point
 * BEAM_DATA_ROOT at it:
 *   git clone --depth 1 https://github.com/mohammadtavakoli78/BEAM.git
 *   BEAM_DATA_ROOT=/path/to/BEAM pnpm ingest:beam
 *
 * Defaults to the "100K" tier (confirmed live: actually ~200k+ tokens per
 * chat once the JSON is parsed, not literally 100K -- the tier name is
 * BEAM's own label, not a token count guarantee) and all chats found
 * there -- override with BEAM_TIER and BEAM_LIMIT.
 *
 * Each chat's `chat.json` is an array of batches: `{batch_number, turns}`,
 * turns being an array of arrays of `{role, content, time_anchor, ...}`
 * turn objects -- this script treats each batch as one session (same
 * per-instance sequential/knownAttributes-accumulating design as
 * scripts/ingest-longmemeval.ts, for the same reason: keeping the
 * extractor's attribute slugs consistent across a chat's timeline), and
 * runs chats concurrently across each other, same as LongMemEval.
 *
 * Extraction runs against Gemini. `GEMINI_API_KEYS2`, if set, lets this
 * script use a dedicated key kept separate from whatever other ingest job
 * (e.g. scripts/ingest-longmemeval.ts) might be running concurrently
 * against `GEMINI_API_KEYS`, so the two don't contend for the same quota.
 * The override below (`process.env["GEMINI_API_KEYS"] = ...`) only affects
 * THIS process's environment, not any other already-running process --
 * each is a separate OS process with its own env. A local Ollama container
 * (src/lib/llm/ollamaProvider.ts) was tried first for the same isolation
 * goal at zero API cost; live-tested here and found unreliable at this
 * model size (qwen2.5:3b, chosen for a ~4.8GB-RAM constraint) -- 0/1 chats
 * extracted usable facts, mostly returning narrative prose instead of the
 * required JSON schema. See docs/LIMITATIONS.md for that result; the
 * provider itself is kept as a real, tested capability for future use with
 * a model actually sized for the task.
 *
 * For the same isolation reason, writes go with skip_classifier: true
 * (same pattern scripts/ingest-temporal-facts.ts already uses) --
 * server-side semantic conflict classification
 * (src/lib/conflictClassifier.ts) defaults to the dev server's OWN
 * provider config (GEMINI_API_KEYS), and there's no per-request way to
 * point that at this script's separate key instead without deeper surgery
 * not worth it for this run.
 */
import "../src/loadEnv.js";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractFactsFromSession } from "../src/ingest/extractFacts.js";
import { parseBeamDate } from "../src/ingest/parseBeamDate.js";
import { getLlmProvider } from "../src/lib/llm/index.js";

if (process.env["GEMINI_API_KEYS2"]) {
  process.env["GEMINI_API_KEYS"] = process.env["GEMINI_API_KEYS2"];
}

const BASE_URL = process.env["LETHE_URL"] ?? "http://127.0.0.1:3000";
const BEAM_DATA_ROOT = process.env["BEAM_DATA_ROOT"];
const TIER = process.env["BEAM_TIER"] ?? "100K";
const OUTPUT_PATH = path.resolve(process.cwd(), `.cache/ingested-beam-${TIER}.json`);

interface BeamTurn {
  role: string;
  content: string;
  time_anchor?: string;
}
interface BeamBatch {
  batch_number: number;
  turns: BeamTurn[][];
}

export interface IngestedBeamFactRecord {
  chatId: string;
  entity: string; // namespaced, e.g. "beam-100K-20:user"
  attribute: string;
  content: string;
  timestamp: string;
}

function loadChatIds(chatsDir: string, limit?: number): string[] {
  const ids = readdirSync(chatsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => Number(a) - Number(b));
  return limit ? ids.slice(0, limit) : ids;
}

export async function ingestChat(
  chatsDir: string,
  chatId: string,
): Promise<{ ingested: IngestedBeamFactRecord[]; batchesFailed: number }> {
  const chatPath = path.join(chatsDir, chatId, "chat.json");
  const batches = JSON.parse(readFileSync(chatPath, "utf8")) as BeamBatch[];

  const ingested: IngestedBeamFactRecord[] = [];
  const knownAttributes = new Set<string>();
  let batchesFailed = 0;

  for (const batch of batches) {
    const flatTurns = batch.turns.flat();
    const turns = flatTurns.map((t) => ({
      role: (t.role === "assistant" ? "assistant" : "user") as "user" | "assistant",
      content: t.content,
    }));
    const timeAnchor = flatTurns.find((t) => t.time_anchor)?.time_anchor;
    if (!timeAnchor) {
      batchesFailed++;
      continue;
    }
    const timestamp = parseBeamDate(timeAnchor);

    const extracted = await extractFactsFromSession(turns, [...knownAttributes]);
    if (extracted === null) {
      batchesFailed++;
      continue;
    }

    for (const fact of extracted) {
      knownAttributes.add(fact.attribute);
      // Namespaced per chat (and per tier, since chat ids like "20" repeat
      // across tiers) for the same reason ingest-longmemeval.ts namespaces
      // per instance: distinct chats/personas must never collide on
      // entity+attribute.
      const namespacedEntity = `beam-${TIER}-${chatId}:${fact.entity}`;

      const response = await fetch(`${BASE_URL}/facts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: `beam-${TIER}-${chatId}-b${batch.batch_number}`,
          entity: namespacedEntity,
          attribute: fact.attribute,
          content: fact.content,
          timestamp,
          skip_classifier: true,
        }),
      });
      if (!response.ok) {
        console.error(`  ingest failed for ${namespacedEntity}/${fact.attribute}: ${response.status}`);
        continue;
      }
      ingested.push({ chatId, entity: namespacedEntity, attribute: fact.attribute, content: fact.content, timestamp });
    }
  }

  return { ingested, batchesFailed };
}

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
  if (!BEAM_DATA_ROOT) {
    console.error(
      "Set BEAM_DATA_ROOT to a local clone of https://github.com/mohammadtavakoli78/BEAM (not bundled in this repo -- its smallest tier alone is tens of MB per chat).",
    );
    process.exitCode = 1;
    return;
  }
  if (!process.env["GEMINI_API_KEYS2"] && !getLlmProvider()) {
    console.error(
      "No LLM provider configured. Set GEMINI_API_KEYS2 (preferred -- a dedicated key kept separate " +
        "from any other concurrently-running ingest job's GEMINI_API_KEYS, so both can run in parallel " +
        "without quota contention) or any of ANTHROPIC_API_KEY/OPENAI_API_KEY/GEMINI_API_KEY. " +
        "Nothing will be extracted.",
    );
    process.exitCode = 1;
    return;
  }

  const chatsDir = path.join(BEAM_DATA_ROOT, "chats", TIER);
  if (!existsSync(chatsDir)) {
    console.error(`No such directory: ${chatsDir}. Check BEAM_DATA_ROOT and BEAM_TIER.`);
    process.exitCode = 1;
    return;
  }

  const limit = process.env["BEAM_LIMIT"] ? Number(process.env["BEAM_LIMIT"]) : undefined;
  const chatIds = loadChatIds(chatsDir, limit);
  const concurrency = process.env["BEAM_CONCURRENCY"] ? Number(process.env["BEAM_CONCURRENCY"]) : 5;
  console.log(`Ingesting ${chatIds.length} BEAM "${TIER}" chats from ${chatsDir} into ${BASE_URL} (concurrency ${concurrency}) ...`);

  const allIngested: IngestedBeamFactRecord[] = [];
  let totalBatchesFailed = 0;
  let completed = 0;

  await runWithConcurrency(chatIds, concurrency, async (chatId) => {
    const { ingested, batchesFailed } = await ingestChat(chatsDir, chatId);
    allIngested.push(...ingested);
    totalBatchesFailed += batchesFailed;
    completed++;
    console.log(
      `  [${completed}/${chatIds.length}] chat ${chatId}: ${ingested.length} facts extracted${batchesFailed > 0 ? ` (${batchesFailed} batches failed extraction)` : ""}`,
    );
  });

  if (!existsSync(path.dirname(OUTPUT_PATH))) mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, JSON.stringify(allIngested, null, 2));

  console.log(`\nDone. ${allIngested.length} facts ingested across ${chatIds.length} chats.`);
  if (totalBatchesFailed > 0) {
    console.log(`${totalBatchesFailed} batches failed extraction and were skipped (not silently dropped -- logged above).`);
  }
  console.log(`Wrote ${OUTPUT_PATH} for scripts/eval-beam.ts.`);
  console.log("\nRun `pnpm eval:beam` next to score Lethe's supersession correctness on this data.");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
