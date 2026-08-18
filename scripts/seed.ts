/**
 * Seeds Lethe with the demo's contradiction facts.
 * Run with: pnpm seed  (requires the app server running on PORT, default 3000)
 */
import { demoScenarios } from "../src/demoScenarios.js";
import { seedFacts } from "../src/demoFacts.js";

const BASE_URL = process.env["LETHE_URL"] ?? "http://127.0.0.1:3000";

async function main(): Promise<void> {
  console.log(`Seeding ${seedFacts.length} facts into ${BASE_URL} ...`);
  for (const fact of seedFacts) {
    const response = await fetch(`${BASE_URL}/facts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fact),
    });
    const body = (await response.json()) as {
      fact?: { id: string };
      superseded_fact_id?: string | null;
      deduped?: boolean;
      error?: string;
    };
    if (!response.ok) {
      throw new Error(`Seed write failed for ${fact.entity}/${fact.attribute}: ${body.error}`);
    }
    const note = body.deduped
      ? "(deduped)"
      : body.superseded_fact_id
        ? `(supersedes ${body.superseded_fact_id})`
        : "";
    console.log(`  ${fact.entity}/${fact.attribute} @ ${fact.timestamp} ${note}`);
  }

  console.log("\nSeeded scenarios:");
  for (const scenario of demoScenarios) {
    console.log(`  - ${scenario.id} (source: LongMemEval ${scenario.sourceQuestionId})`);
  }
  console.log("\nDone.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
