/**
 * Generic ingestion for any dataset shaped as a JSON array of
 * TemporalFactSeries (see below) -- structured, timestamped fact
 * value-over-time data that needs NO LLM extraction, unlike the
 * LongMemEval pipeline (scripts/ingest-longmemeval.ts). Each series is
 * already pre-collapsed into value spans (consecutive identical-value
 * periods merged into one) by that dataset's own prep script under
 * scripts/prepare-*.js -- this script only ingests, it doesn't build the
 * subset files.
 *
 * Used for multiple independent real public datasets, each a genuinely
 * separate source/curation, not just re-splits of one dataset -- see
 * docs/LIMITATIONS.md for what's currently wired up and why each one
 * counts as distinct. Every dataset gets its own entity namespace prefix
 * (DATASET_NAME) so facts from different sources can never collide on
 * entity+attribute even if they happen to reference the same real-world
 * subject (e.g. the same Wikidata entity appearing in two different
 * Wikidata-derived datasets).
 *
 * Run with:
 *   DATASET_NAME=templama DATA_PATH=data/templama/subset.json pnpm ingest:temporal-facts
 * Or use the per-dataset npm script shortcuts (pnpm ingest:templama, etc.)
 * which just set these two env vars. TEMPORAL_LIMIT smoke-tests a slice
 * before committing to a full run.
 */
import "../src/loadEnv.js";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BASE_URL = process.env["LETHE_URL"] ?? "http://127.0.0.1:3000";
const DATASET_NAME = process.env["DATASET_NAME"];
const DATA_PATH_ENV = process.env["DATA_PATH"];

interface TemporalFactSpan {
  value: string;
  startYear: string; // ISO-ish year or year-quarter label, e.g. "2020" or "2020-Q3"
}
interface TemporalFactSeries {
  subjectId: string;
  relation: string;
  queryTemplate: string; // contains "_X_" as the fill-in placeholder
  spans: TemporalFactSpan[];
}

export interface IngestedFactRecord {
  seriesId: string;
  entity: string;
  attribute: string;
  content: string;
  timestamp: string;
  queryTemplate: string;
}

function parseYearLabel(label: string): string {
  // "2020" -> Jan 1; "2020-Q3" -> first day of that quarter; "2020-10-06" -> that exact day.
  const quarterMatch = label.match(/^(\d{4})-Q([1-4])$/);
  if (quarterMatch) {
    const [, year, q] = quarterMatch;
    const month = String((Number(q) - 1) * 3 + 1).padStart(2, "0");
    return `${year}-${month}-01T00:00:00.000Z`;
  }
  const fullDateMatch = label.match(/^\d{4}-\d{2}-\d{2}$/);
  if (fullDateMatch) {
    return `${label}T00:00:00.000Z`;
  }
  return `${label}-01-01T00:00:00.000Z`;
}

export async function ingestSeries(
  series: TemporalFactSeries,
  datasetName: string,
): Promise<IngestedFactRecord[]> {
  const entity = `${datasetName}:${series.subjectId}`;
  const attribute = series.relation.toLowerCase();
  const sessionId = `${datasetName}:${series.subjectId}:${series.relation}`;
  const ingested: IngestedFactRecord[] = [];

  for (const span of series.spans) {
    const content = series.queryTemplate.replace("_X_", span.value);
    const timestamp = parseYearLabel(span.startYear);

    const response = await fetch(`${BASE_URL}/facts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: sessionId,
        entity,
        attribute,
        content,
        timestamp,
        // Spans are already deduplicated to distinct consecutive values by
        // this file's own prep script -- see the note on classifyRelation's
        // `skip` parameter in src/lib/conflictClassifier.ts.
        skip_classifier: true,
      }),
    });
    if (!response.ok) {
      console.error(`  ingest failed for ${entity}/${attribute}: ${response.status}`);
      continue;
    }
    ingested.push({
      seriesId: `${series.subjectId}_${series.relation}`,
      entity,
      attribute,
      content,
      timestamp,
      queryTemplate: series.queryTemplate,
    });
  }
  return ingested;
}

async function main(): Promise<void> {
  if (!DATASET_NAME || !DATA_PATH_ENV) {
    console.error("Set both DATASET_NAME and DATA_PATH env vars (or use an npm script shortcut like `pnpm ingest:templama`).");
    process.exitCode = 1;
    return;
  }
  const dataPath = path.resolve(process.cwd(), DATA_PATH_ENV);
  const outputPath = path.resolve(process.cwd(), `.cache/ingested-${DATASET_NAME}.json`);

  const allSeries = JSON.parse(readFileSync(dataPath, "utf8")) as TemporalFactSeries[];
  const limit = process.env["TEMPORAL_LIMIT"] ? Number(process.env["TEMPORAL_LIMIT"]) : undefined;
  const series = limit ? allSeries.slice(0, limit) : allSeries;
  console.log(
    `Ingesting ${series.length}${limit ? ` of ${allSeries.length}` : ""} "${DATASET_NAME}" series into ${BASE_URL} ...`,
  );

  const allIngested: IngestedFactRecord[] = [];
  for (const s of series) {
    process.stdout.write(`  ${s.subjectId}_${s.relation}... `);
    const ingested = await ingestSeries(s, DATASET_NAME);
    allIngested.push(...ingested);
    console.log(`${ingested.length} facts written`);
  }

  if (!existsSync(path.dirname(outputPath))) mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(allIngested, null, 2));

  console.log(`\nDone. ${allIngested.length} facts ingested across ${series.length} series.`);
  console.log(`Wrote ${outputPath} for scripts/eval-temporal-facts.ts.`);
  console.log(
    `\nRun \`DATASET_NAME=${DATASET_NAME} pnpm eval:temporal-facts\` next to score Lethe's supersession correctness on this data.`,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
