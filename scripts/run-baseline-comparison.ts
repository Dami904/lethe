/**
 * Runs both Lethe and the naive vector-memory baseline against the demo's
 * LongMemEval-derived contradiction cases and logs the accuracy difference.
 * This is the proof point for the README and demo video.
 *
 * Requires: the app server running with the seed facts already loaded
 * (`pnpm seed`). Run with: pnpm baseline:eval
 */
import { abstentionScenario, demoScenarios } from "../src/demoScenarios.js";
import { currentContentFor } from "../src/demoFacts.js";

const BASE_URL = process.env["LETHE_URL"] ?? "http://127.0.0.1:3000";

interface CaseResult {
  case: string;
  expected: string | null;
  letheAnswer: string | null;
  letheCorrect: boolean;
  baselineTop1: string | null;
  baselineAmbiguous: boolean;
  baselineCorrect: boolean;
}

async function recall(entity: string, attribute: string, asOf: string) {
  const res = await fetch(
    `${BASE_URL}/recall?entity=${encodeURIComponent(entity)}&attribute=${encodeURIComponent(
      attribute,
    )}&as_of=${encodeURIComponent(asOf)}`,
  );
  return (await res.json()) as { answer: string | null };
}

async function baselineRecall(naturalLanguageQuery: string) {
  const res = await fetch(
    `${BASE_URL}/baseline/recall?query=${encodeURIComponent(naturalLanguageQuery)}`,
  );
  return (await res.json()) as {
    matches: { content: string; score: number }[];
    ambiguous: boolean;
  };
}

async function main(): Promise<void> {
  const results: CaseResult[] = [];

  for (const scenario of demoScenarios) {
    const expected = currentContentFor(scenario.entity, scenario.attribute);
    const lethe = await recall(scenario.entity, scenario.attribute, scenario.timestamps.afterSecond);
    const baseline = await baselineRecall(scenario.naturalLanguageQuery);
    const top1 = baseline.matches[0]?.content ?? null;

    results.push({
      case: scenario.id,
      expected,
      letheAnswer: lethe.answer,
      letheCorrect: lethe.answer === expected,
      baselineTop1: top1,
      baselineAmbiguous: baseline.ambiguous,
      baselineCorrect: top1 === expected && !baseline.ambiguous,
    });
  }

  // Abstention case: the correct answer is "no fact stated" (null). The
  // naive baseline has no abstention concept -- it always returns its
  // nearest neighbor, however unrelated, so it "hallucinates" an answer
  // where Lethe correctly says nothing was ever stated.
  {
    const lethe = await recall(
      abstentionScenario.entity,
      abstentionScenario.attribute,
      abstentionScenario.asOf,
    );
    const baseline = await baselineRecall(abstentionScenario.naturalLanguageQuery);
    const top1 = baseline.matches[0]?.content ?? null;

    results.push({
      case: abstentionScenario.id,
      expected: null,
      letheAnswer: lethe.answer,
      letheCorrect: lethe.answer === null,
      baselineTop1: top1,
      baselineAmbiguous: baseline.ambiguous,
      baselineCorrect: top1 === null, // baseline never abstains, so this is always false
    });
  }

  console.log("\n=== Lethe vs. naive vector-memory baseline ===\n");
  for (const r of results) {
    console.log(`case: ${r.case}`);
    console.log(`  expected (currently valid) : ${r.expected ?? "(none -- abstain)"}`);
    console.log(`  lethe answer               : ${r.letheAnswer ?? "(abstained)"} ${r.letheCorrect ? "✓" : "✗"}`);
    console.log(
      `  baseline top match         : ${r.baselineTop1 ?? "(none)"} ${r.baselineAmbiguous ? "(ambiguous top-2)" : ""} ${r.baselineCorrect ? "✓" : "✗"}`,
    );
    console.log("");
  }

  const letheAccuracy = results.filter((r) => r.letheCorrect).length / results.length;
  const baselineAccuracy = results.filter((r) => r.baselineCorrect).length / results.length;
  console.log(`Lethe accuracy:    ${(letheAccuracy * 100).toFixed(0)}% (${results.filter((r) => r.letheCorrect).length}/${results.length})`);
  console.log(`Baseline accuracy: ${(baselineAccuracy * 100).toFixed(0)}% (${results.filter((r) => r.baselineCorrect).length}/${results.length})`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
