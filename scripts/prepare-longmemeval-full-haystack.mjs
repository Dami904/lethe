#!/usr/bin/env node
/**
 * Filters the real, full-haystack LongMemEval_S dataset
 * (data/longmemeval-full/longmemeval_s_cleaned.json, downloaded from
 * https://huggingface.co/datasets/xiaowu0162/longmemeval-cleaned, NOT
 * committed -- 277MB) down to the same 78 knowledge-update (+ paired
 * abstention) question_ids already used by the oracle-mode run
 * (data/longmemeval/eval_subset_full.json), so the two runs are directly
 * comparable: same instances, same questions -- the only difference is
 * whether the ingest script sees pre-filtered evidence sessions (oracle,
 * ~2 sessions/~5k tokens) or the real full haystack (~40-60
 * sessions/~100-130k tokens, matching the track's stated scale).
 *
 * Run with: node scripts/prepare-longmemeval-full-haystack.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const fullPath = path.join(root, "data/longmemeval-full/longmemeval_s_cleaned.json");
const oraclePath = path.join(root, "data/longmemeval/eval_subset_full.json");
const outPath = path.join(root, "data/longmemeval/eval_subset_full_haystack.json");

const full = JSON.parse(readFileSync(fullPath, "utf8"));
const oracle = JSON.parse(readFileSync(oraclePath, "utf8"));

const targetIds = new Set(oracle.map((i) => i.question_id));
const matched = full.filter((i) => targetIds.has(i.question_id));

if (matched.length !== oracle.length) {
  console.error(
    `Expected ${oracle.length} matching instances, found ${matched.length}. Aborting -- something about the source files changed.`,
  );
  process.exitCode = 1;
} else {
  writeFileSync(outPath, JSON.stringify(matched, null, 2));
  const totalSessions = matched.reduce((sum, i) => sum + i.haystack_sessions.length, 0);
  const approxTokens = matched.reduce(
    (sum, i) => sum + Math.round(JSON.stringify(i.haystack_sessions).length / 4),
    0,
  );
  console.log(`Wrote ${outPath}: ${matched.length} instances, ${totalSessions} total sessions (avg ${(totalSessions / matched.length).toFixed(1)}/instance), ~${approxTokens.toLocaleString()} total tokens (avg ~${Math.round(approxTokens / matched.length).toLocaleString()}/instance).`);
}
