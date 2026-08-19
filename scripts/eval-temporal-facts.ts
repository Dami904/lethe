/**
 * Generic scorer for any dataset ingested by scripts/ingest-temporal-facts.ts.
 * Same methodology as scripts/eval-longmemeval.ts (see its header for the
 * full rationale on checking against the source's own last-written content
 * rather than an LLM-judged free-text answer).
 *
 * Run with: DATASET_NAME=templama pnpm eval:temporal-facts
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { IngestedFactRecord } from "./ingest-temporal-facts.js";

const BASE_URL = process.env["LETHE_URL"] ?? "http://127.0.0.1:3000";
const DATASET_NAME = process.env["DATASET_NAME"];

interface UpdatePair {
  seriesId: string;
  entity: string;
  attribute: string;
  earlier: IngestedFactRecord;
  later: IngestedFactRecord;
}

function findUpdatePairs(records: IngestedFactRecord[]): UpdatePair[] {
  const groups = new Map<string, IngestedFactRecord[]>();
  for (const r of records) {
    const list = groups.get(r.seriesId) ?? [];
    list.push(r);
    groups.set(r.seriesId, list);
  }

  const pairs: UpdatePair[] = [];
  for (const [, list] of groups) {
    if (list.length < 2) continue;
    list.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    const earlier = list[0]!;
    const later = list[list.length - 1]!;
    if (earlier.content.trim() === later.content.trim()) continue;
    pairs.push({ seriesId: earlier.seriesId, entity: earlier.entity, attribute: earlier.attribute, earlier, later });
  }
  return pairs;
}

async function recall(entity: string, attribute: string, asOf: string): Promise<string | null> {
  const res = await fetch(
    `${BASE_URL}/recall?entity=${encodeURIComponent(entity)}&attribute=${encodeURIComponent(attribute)}&as_of=${encodeURIComponent(asOf)}`,
  );
  const body = (await res.json()) as { answer: string | null };
  return body.answer;
}

async function baselineTop1(query: string): Promise<string | null> {
  const res = await fetch(`${BASE_URL}/baseline/recall?query=${encodeURIComponent(query)}`);
  const body = (await res.json()) as { matches: { content: string }[] };
  return body.matches[0]?.content ?? null;
}

async function main(): Promise<void> {
  if (!DATASET_NAME) {
    console.error("Set DATASET_NAME (or use an npm script shortcut like `pnpm eval:templama`).");
    process.exitCode = 1;
    return;
  }
  const inputPath = path.resolve(process.cwd(), `.cache/ingested-${DATASET_NAME}.json`);

  let records: IngestedFactRecord[];
  try {
    records = JSON.parse(readFileSync(inputPath, "utf8")) as IngestedFactRecord[];
  } catch {
    console.error(`Could not read ${inputPath}. Run the matching ingest:* script first.`);
    process.exitCode = 1;
    return;
  }

  const pairs = findUpdatePairs(records);
  if (pairs.length === 0) {
    console.error("No update pairs found.");
    process.exitCode = 1;
    return;
  }

  console.log(`\n=== Lethe vs. naive baseline: ${pairs.length} real "${DATASET_NAME}" update pairs ===\n`);

  let letheCorrectEarly = 0;
  let letheCorrectLate = 0;
  let baselineCorrect = 0;

  for (const pair of pairs) {
    const earlyAnswer = await recall(pair.entity, pair.attribute, pair.earlier.timestamp);
    const lateAnswer = await recall(pair.entity, pair.attribute, pair.later.timestamp);
    const earlyOk = earlyAnswer === pair.earlier.content;
    const lateOk = lateAnswer === pair.later.content;
    if (earlyOk) letheCorrectEarly++;
    if (lateOk) letheCorrectLate++;

    const query = pair.earlier.queryTemplate.replace("_X_", "").replace(/\s+/g, " ").trim();
    const baselineAnswer = await baselineTop1(query);
    const baselineOk = baselineAnswer === pair.later.content;
    if (baselineOk) baselineCorrect++;
  }

  const n = pairs.length;
  console.log(`N = ${n} real, structured "${DATASET_NAME}" update pairs (no LLM extraction involved)`);
  console.log(
    `Lethe accuracy (correct at earlier as_of): ${((letheCorrectEarly / n) * 100).toFixed(0)}% (${letheCorrectEarly}/${n})`,
  );
  console.log(
    `Lethe accuracy (correct at later as_of):   ${((letheCorrectLate / n) * 100).toFixed(0)}% (${letheCorrectLate}/${n})`,
  );
  console.log(
    `Baseline accuracy (no time dimension):     ${((baselineCorrect / n) * 100).toFixed(0)}% (${baselineCorrect}/${n})`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
