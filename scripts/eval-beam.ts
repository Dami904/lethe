/**
 * Scores Lethe's supersession correctness against the facts
 * scripts/ingest-beam.ts extracted and wrote to
 * .cache/ingested-beam-<tier>.json. Run ingest-beam first.
 *
 * Same methodology as scripts/eval-longmemeval.ts, deliberately: for every
 * (entity, attribute) pair the extractor found 2+ distinct facts for within
 * one chat (i.e. a real update happened), checks whether `/recall` returns
 * the earlier fact when queried at-or-after the earlier write and the
 * later fact once queried after it -- the invariant this project exists to
 * guarantee, now exercised against BEAM's genuinely different
 * conversations/format instead of LongMemEval's. Does NOT attempt to grade
 * against BEAM's own hand-authored probing_questions.json rubrics (that
 * would need matching our extractor's arbitrary attribute slugs against
 * BEAM's specific expected questions, an unreliable correspondence, plus a
 * separate LLM-judge scoring pass) -- see docs/LIMITATIONS.md for the
 * honest accounting of what this does and doesn't measure.
 *
 * Run with: pnpm eval:beam
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { IngestedBeamFactRecord } from "./ingest-beam.js";

const BASE_URL = process.env["LETHE_URL"] ?? "http://127.0.0.1:3000";
const TIER = process.env["BEAM_TIER"] ?? "100K";
const INPUT_PATH = path.resolve(process.cwd(), `.cache/ingested-beam-${TIER}.json`);

interface UpdatePair {
  chatId: string;
  entity: string;
  attribute: string;
  earlier: IngestedBeamFactRecord;
  later: IngestedBeamFactRecord;
}

function findUpdatePairs(records: IngestedBeamFactRecord[]): UpdatePair[] {
  const groups = new Map<string, IngestedBeamFactRecord[]>();
  for (const r of records) {
    const key = `${r.chatId} ${r.entity} ${r.attribute}`;
    const list = groups.get(key) ?? [];
    list.push(r);
    groups.set(key, list);
  }

  const pairs: UpdatePair[] = [];
  for (const [, list] of groups) {
    if (list.length < 2) continue;
    list.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    const earlier = list[0]!;
    const later = list[list.length - 1]!;
    if (earlier.content.trim() === later.content.trim()) continue; // restatement, not an update
    pairs.push({ chatId: earlier.chatId, entity: earlier.entity, attribute: earlier.attribute, earlier, later });
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
  let records: IngestedBeamFactRecord[];
  try {
    records = JSON.parse(readFileSync(INPUT_PATH, "utf8")) as IngestedBeamFactRecord[];
  } catch {
    console.error(`Could not read ${INPUT_PATH}. Run \`pnpm ingest:beam\` first.`);
    process.exitCode = 1;
    return;
  }

  const pairs = findUpdatePairs(records);
  if (pairs.length === 0) {
    console.error("No update pairs found (need 2+ distinct facts for the same entity+attribute in one chat).");
    process.exitCode = 1;
    return;
  }

  console.log(`\n=== Lethe vs. naive baseline: ${pairs.length} real, auto-extracted BEAM (${TIER}) update pairs ===\n`);

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

    const query = `What is the ${pair.attribute.replace(/_/g, " ")} for ${pair.entity.split(":")[1] ?? pair.entity}?`;
    const baselineAnswer = await baselineTop1(query);
    const baselineOk = baselineAnswer === pair.later.content;
    if (baselineOk) baselineCorrect++;

    console.log(`[${pair.chatId}] ${pair.attribute}`);
    console.log(`  as-of earlier write -> ${earlyOk ? "correct" : "WRONG"}`);
    console.log(`  as-of later write   -> ${lateOk ? "correct" : "WRONG"}`);
    console.log(`  baseline (no time)  -> ${baselineOk ? "correct" : "WRONG"} (query: "${query}")`);
  }

  const n = pairs.length;
  console.log(`\nN = ${n} auto-extracted update pairs (from real BEAM "${TIER}" conversations)`);
  console.log(`Lethe accuracy (correct at earlier as_of): ${((letheCorrectEarly / n) * 100).toFixed(0)}% (${letheCorrectEarly}/${n})`);
  console.log(`Lethe accuracy (correct at later as_of):   ${((letheCorrectLate / n) * 100).toFixed(0)}% (${letheCorrectLate}/${n})`);
  console.log(`Baseline accuracy (no time dimension):     ${((baselineCorrect / n) * 100).toFixed(0)}% (${baselineCorrect}/${n})`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
