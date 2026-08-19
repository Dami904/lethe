import { queryNdjson } from "../db/hydraClient.js";
import { cosineSimilarity, embed } from "./embeddings.js";

export interface BaselineMatch {
  fact_id: string;
  entity: string;
  content: string;
  written_at: string;
  score: number;
}

export interface BaselineResult {
  query: string;
  matches: BaselineMatch[];
  ambiguous: boolean;
}

interface CachedFact {
  fact_id: string;
  entity: string;
  content: string;
  written_at: string;
  vector: Float64Array;
}

/**
 * Every fact's embedding is a pure function of its (immutable, once-written)
 * content, and the candidate set only ever grows via `writeFact` -- so the
 * full scan + re-embed is safe to cache in-process and only needs busting
 * when a write actually happens. `invalidateBaselineCache` is called from
 * `POST /facts` on every successful write; see src/routes/facts.ts. This
 * makes repeated calls (e.g. an eval script scoring hundreds of queries
 * against a static, already-ingested graph) reuse one scan instead of
 * re-querying HydraDB and re-embedding every fact on every call -- same
 * output, since nothing about the comparison itself changes.
 */
let cachedFacts: CachedFact[] | null = null;

export function invalidateBaselineCache(): void {
  cachedFacts = null;
}

/**
 * Two HydraDB constraints, both confirmed live (see docs/API_NOTES.md),
 * drive the shape of this query:
 *
 * - It reads `f.entity` (a property denormalized onto the Fact node itself
 *   by `writeFact`, see src/db/graph.ts) instead of traversing the ABOUT
 *   edge to Entity -- the edge-traversal version
 *   (`MATCH (f:Fact)-[:ABOUT]->(e:Entity) RETURN ...`) was measured hitting
 *   HydraDB's own 30s query timeout (`query_out_neighbors_scan`) once the
 *   graph passed a few thousand facts.
 * - It uses `queryNdjson` (streaming), not `query` (single JSON response) --
 *   HydraDB's non-streaming transport caps a result at 1024 rows and
 *   returns a `next_cursor` for the rest, but continuing via a fresh HTTP
 *   request is not implemented server-side yet ("ClientProtocol query is
 *   not supported yet: result cursor is unknown or expired" --
 *   upstream: https://github.com/hydra-db/hydradb/issues/78 confirms the
 *   cursor-continuation machinery exists for other transports but isn't
 *   wired up for HTTP). Streaming sidesteps this: one connection, no
 *   continuation request, so no 1024-row ceiling. Confirmed live: a
 *   7,283-fact graph returned all 7,283 rows via this path in ~5s.
 */
async function getCachedFacts(): Promise<CachedFact[]> {
  if (cachedFacts) return cachedFacts;
  const facts: CachedFact[] = [];
  for await (const row of queryNdjson(
    `MATCH (f:Fact) RETURN f.id AS id, f.entity AS entity, f.content AS content, f.written_at AS written_at`,
  )) {
    // `f.entity` is only present on Fact nodes written after this session's
    // denormalization (see writeFact in src/db/graph.ts) -- a node written
    // before that, or MERGE'd by id-only by some future write path, has no
    // `entity` property at all, and HydraDB's row decoder returns `null`
    // for that (not an error). `String(null)` is the valid-looking string
    // "null", which would silently poison this fact's entity label with no
    // signal to a debugger -- skip it loudly instead. A stale/incomplete
    // backfill should be visible, not quietly wrong.
    if (row["entity"] === null || row["entity"] === undefined) {
      console.error(`[baseline] fact ${String(row["id"])} has no entity property, skipping`);
      continue;
    }
    const content = String(row["content"]);
    facts.push({
      fact_id: String(row["id"]),
      entity: String(row["entity"]),
      content,
      written_at: String(row["written_at"]),
      vector: embed(content),
    });
  }
  cachedFacts = facts;
  return cachedFacts;
}

/**
 * The naive vector-memory baseline: embeds every stored fact string (no
 * supersession filtering, no time awareness at all -- it reads every Fact
 * node that has ever been written) and ranks by cosine similarity to the
 * query. This is what mem0/Zep-style similarity search does, and it is
 * exactly why it can't tell a fresh fact from a contradicted one: both
 * versions of an updated fact usually share most of their words.
 */
export async function baselineRecall(
  userQuery: string,
  topK = 2,
): Promise<BaselineResult> {
  const facts = await getCachedFacts();
  const queryVector = embed(userQuery);
  const scored = facts.map((f) => ({
    fact_id: f.fact_id,
    entity: f.entity,
    content: f.content,
    written_at: f.written_at,
    score: cosineSimilarity(queryVector, f.vector),
  }));

  scored.sort((a, b) => b.score - a.score);
  const matches = scored.slice(0, topK);
  const ambiguous =
    matches.length >= 2 && (matches[0]?.score ?? 0) - (matches[1]?.score ?? 0) < 0.08;

  return { query: userQuery, matches, ambiguous };
}
