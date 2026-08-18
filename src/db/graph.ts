import { query, queryNdjson } from "./hydraClient.js";
import { decodeHydraPath } from "./valueCodec.js";
import { hashToId } from "./ids.js";
import type { Fact } from "../types.js";

/**
 * All of the query shapes below were arrived at empirically, against a live
 * HydraDB node, after the originally-written queries (using MERGE...ON
 * CREATE SET, WITH...WHERE, multi-clause read+write queries, and string
 * `id` properties) failed outright. HydraDB's "practical OpenCypher
 * subset" is considerably narrower than the README implies. See
 * docs/API_NOTES.md for the full list of confirmed constraints; the load-
 * bearing ones this file works around:
 *
 * - `id` is a reserved node property: internal vertex identity, integer
 *   only. `src/db/ids.ts` maps our string keys to deterministic integer
 *   ids so MERGE can address existing nodes at all.
 * - CREATE/MERGE are write-only: no preceding MATCH, no following
 *   RETURN/WITH/MATCH in the same query. Every write below is a standalone
 *   one-hop `(a)-[:REL]->(b)` pattern; nothing is read back from a write
 *   response (writes always return empty rows).
 * - MERGE upserts whatever properties you give it on every call, but does
 *   NOT clear properties you omit -- confirmed by re-MERGEing a node by id
 *   alone and finding its other properties untouched. That's what makes it
 *   safe to reference an already-fully-written node by id-only in a later
 *   MERGE (e.g. the SUPERSEDES edge write).
 * - `WITH` cannot carry a `WHERE`/ORDER BY/LIMIT -- only plain
 *   pass-through identifiers. The "keep only unsuperseded facts" filter
 *   that used to be `WITH f, g WHERE g IS NULL` is now done in JS after an
 *   unfiltered `OPTIONAL MATCH` read.
 * - `RETURN` only supports `<binding>.<property>` (no `labels()`,
 *   `coalesce()`, `count(f)`). `/connect`'s node "kind" is inferred in JS
 *   from which property is present, not read via `labels()`.
 */

function toFact(row: {
  id: unknown;
  content: unknown;
  written_at: unknown;
  session_id: unknown;
  entity: unknown;
  attribute: unknown;
}): Fact {
  return {
    id: String(row.id),
    entity: String(row.entity),
    attribute: String(row.attribute),
    content: String(row.content),
    written_at: String(row.written_at),
    session_id: String(row.session_id),
  };
}

/** Picks the most-recent row whose `superseder_id` column is null (an unfiltered read + JS-side argmax; see file header for why). */
function pickCurrent<T extends { written_at: string; superseder_id: unknown }>(
  rows: T[],
): T | null {
  const candidates = rows.filter((r) => r.superseder_id === null || r.superseder_id === undefined);
  if (candidates.length === 0) return null;
  return candidates.reduce((latest, r) => (r.written_at > latest.written_at ? r : latest));
}

/**
 * Writes (or, on a retried idempotency key, re-merges -- harmlessly, since
 * MERGE upserts the same values -- onto) a Fact node, linked to its Entity
 * and Session. Two standalone one-hop MERGE writes (Fact-ABOUT->Entity,
 * then Session-STATES->Fact); HydraDB has no multi-statement transaction
 * over HTTP, so these are not atomic with each other, same documented
 * limitation as before.
 *
 * `wasCreated` is a best-effort pre-write existence check, not an atomic
 * signal from the write itself (HydraDB's write-only-query constraint
 * means a write can never report whether it created vs. matched). Under a
 * true concurrent race this can misreport `deduped` for one of two racing
 * identical requests -- but the underlying data is still race-safe: both
 * requests compute the same deterministic Fact id and MERGE the same
 * values onto it, so there is never a duplicate node, regardless of what
 * this flag says. See docs/LIMITATIONS.md.
 */
export async function writeFact(input: {
  session_id: string;
  entity: string;
  attribute: string;
  content: string;
  timestamp: string;
  idempotency_key: string;
}): Promise<{ fact: Fact; wasCreated: boolean; priorUnsupersededFact: Fact | null }> {
  const factId = hashToId("fact", input.idempotency_key);
  const entityId = hashToId("entity", input.entity);
  const sessionNodeId = hashToId("session", input.session_id);

  const existing = await query(
    `MATCH (f:Fact {id: $id}) RETURN f.id AS id`,
    { parameters: { id: factId } },
  );
  const wasCreated = existing.rows.length === 0;

  await query(
    `MERGE (f:Fact {id: $fact_id, content: $content, written_at: $timestamp, session_id: $session_id, attribute: $attribute})-[:ABOUT]->(e:Entity {id: $entity_id, name: $entity, kind: "unknown"})`,
    {
      parameters: {
        fact_id: factId,
        content: input.content,
        timestamp: input.timestamp,
        session_id: input.session_id,
        attribute: input.attribute,
        entity_id: entityId,
        entity: input.entity,
      },
    },
  );
  await query(
    `MERGE (s:Session {id: $session_node_id, session_key: $session_id, started_at: $timestamp})-[:STATES]->(f:Fact {id: $fact_id})`,
    {
      parameters: {
        session_node_id: sessionNodeId,
        session_id: input.session_id,
        timestamp: input.timestamp,
        fact_id: factId,
      },
    },
  );

  const fact: Fact = {
    id: String(factId),
    entity: input.entity,
    attribute: input.attribute,
    content: input.content,
    written_at: input.timestamp,
    session_id: input.session_id,
  };

  if (!wasCreated) {
    return { fact, wasCreated: false, priorUnsupersededFact: null };
  }

  const priorResult = await query(
    `MATCH (prior:Fact)-[:ABOUT]->(e:Entity {id: $entity_id})
     WHERE prior.attribute = $attribute AND prior.id <> $fact_id
     OPTIONAL MATCH (g:Fact)-[:SUPERSEDES]->(prior)
     RETURN prior.id AS id, prior.content AS content, prior.written_at AS written_at,
            prior.session_id AS session_id, g.id AS superseder_id
     ORDER BY prior.written_at DESC`,
    { parameters: { entity_id: entityId, attribute: input.attribute, fact_id: factId } },
  );
  const priorRow = pickCurrent(
    priorResult.rows as unknown as Array<{
      id: string;
      content: string;
      written_at: string;
      session_id: string;
      superseder_id: unknown;
    }>,
  );
  const priorUnsupersededFact = priorRow
    ? toFact({ ...priorRow, attribute: input.attribute, entity: input.entity })
    : null;

  return { fact, wasCreated: true, priorUnsupersededFact };
}

/**
 * Writes a SUPERSEDES edge from `sourceFactId` to `targetFactId` (the fact
 * `sourceFactId` invalidates). Both endpoints are referenced by id only --
 * safe, since a re-MERGE by id doesn't clear the node's other properties
 * (see file header). Direction is the caller's responsibility -- see
 * `src/routes/facts.ts`, which picks it by comparing `written_at`
 * timestamps rather than assuming "the fact just written is always the
 * newer one" (a backfilled/corrected fact with an earlier timestamp than
 * the current valid fact must be superseded BY that fact, not supersede
 * it -- getting this backwards is exactly what would make `/recall` return
 * a stale fact, violating the core invariant).
 */
export async function writeSupersedesEdge(
  sourceFactId: string,
  targetFactId: string,
  timestamp: string,
): Promise<void> {
  await query(
    `MERGE (f:Fact {id: $source_id})-[:SUPERSEDES {at: $timestamp}]->(p:Fact {id: $target_id})`,
    { parameters: { source_id: Number(sourceFactId), target_id: Number(targetFactId), timestamp } },
  );
}

/**
 * The core point-in-time recall check: the fact about entity+attribute that
 * was still valid as of `asOf` -- written by then, and with no fact that
 * ALSO existed by then pointing a SUPERSEDES edge at it. Zero qualifying
 * rows is a real graph non-existence result (the abstention case), not a
 * guess. The "no incoming qualifying SUPERSEDES edge" filter and the
 * "most recent" pick both happen in JS (see `pickCurrent`) because
 * HydraDB's `WITH` can't carry a `WHERE`/`ORDER BY`/`LIMIT` -- the
 * `OPTIONAL MATCH` itself, which is what actually performs the graph
 * check, still runs entirely in the database.
 */
export async function findValidFactAsOf(
  entity: string,
  attribute: string,
  asOf: string,
): Promise<Fact | null> {
  const result = await query(
    `MATCH (f:Fact)-[:ABOUT]->(e:Entity {name: $entity})
     WHERE f.attribute = $attribute AND f.written_at <= $as_of
     OPTIONAL MATCH (g:Fact)-[:SUPERSEDES]->(f)
     WHERE g.written_at <= $as_of
     RETURN f.id AS id, f.content AS content, f.written_at AS written_at,
            f.session_id AS session_id, g.id AS superseder_id`,
    { parameters: { entity, attribute, as_of: asOf } },
  );
  const row = pickCurrent(
    result.rows as unknown as Array<{
      id: string;
      content: string;
      written_at: string;
      session_id: string;
      superseder_id: unknown;
    }>,
  );
  return row ? toFact({ ...row, entity, attribute }) : null;
}

/**
 * NDJSON-streaming variant of `findValidFactAsOf`. Because the
 * unsuperseded-filter has to happen in JS (see file header), this can't
 * yield a row incrementally as the true winner is determined server-side --
 * it consumes the full (small, per-entity+attribute) candidate stream, then
 * yields exactly one fact. Still uses HydraDB's real NDJSON transport, and
 * still yields at most one fact, matching the invariant. See
 * docs/LIMITATIONS.md for the honest accounting of what streaming buys us
 * here vs. what it would in a database that supported filtering the
 * `WITH` in-query.
 */
export async function* streamValidFactsAsOf(
  entity: string,
  attribute: string,
  asOf: string,
): AsyncGenerator<Fact> {
  const rows = queryNdjson(
    `MATCH (f:Fact)-[:ABOUT]->(e:Entity {name: $entity})
     WHERE f.attribute = $attribute AND f.written_at <= $as_of
     OPTIONAL MATCH (g:Fact)-[:SUPERSEDES]->(f)
     WHERE g.written_at <= $as_of
     RETURN f.id AS id, f.content AS content, f.written_at AS written_at,
            f.session_id AS session_id, g.id AS superseder_id`,
    { parameters: { entity, attribute, as_of: asOf } },
  );
  const buffered: Array<{
    id: string;
    content: string;
    written_at: string;
    session_id: string;
    superseder_id: unknown;
  }> = [];
  for await (const row of rows) {
    buffered.push(row as unknown as (typeof buffered)[number]);
  }
  const winner = pickCurrent(buffered);
  if (winner) {
    yield toFact({ ...winner, entity, attribute });
  }
}

/**
 * Walks the SUPERSEDES chain for an entity+attribute using HydraDB's native
 * bounded path procedure (`algo.SSpaths`) instead of app-side recursion --
 * the real HydraDB-specific scale argument for this feature. Returns facts
 * oldest-first for the frontend timeline. `algo.SSpaths` (like all CALL
 * procedures here) must be a standalone query with literal/parameterized
 * node ids -- it cannot follow a `MATCH`-bound variable in the same query
 * (confirmed empirically; see docs/API_NOTES.md) -- so the anchor fact's id
 * is resolved via a separate read first.
 */
export async function getSupersessionChain(
  entity: string,
  attribute: string,
  maxLen = 10,
): Promise<Fact[]> {
  const anchorResult = await query(
    `MATCH (f:Fact)-[:ABOUT]->(e:Entity {name: $entity})
     WHERE f.attribute = $attribute
     OPTIONAL MATCH (g:Fact)-[:SUPERSEDES]->(f)
     RETURN f.id AS id, f.content AS content, f.written_at AS written_at,
            f.session_id AS session_id, g.id AS superseder_id`,
    { parameters: { entity, attribute } },
  );
  const anchor = pickCurrent(
    anchorResult.rows as unknown as Array<{
      id: string;
      content: string;
      written_at: string;
      session_id: string;
      superseder_id: unknown;
    }>,
  );
  if (!anchor) return [];

  const pathResult = await query(
    `CALL algo.SSpaths({
       sourceNode: $anchor_id,
       relTypes: ['SUPERSEDES'],
       relDirection: 'outgoing',
       maxLen: $max_len,
       pathCount: 1
     })
     YIELD path
     RETURN path`,
    { parameters: { anchor_id: Number(anchor.id), max_len: maxLen } },
  );

  const decodedPath = pathResult.rows[0] ? decodeHydraPath(pathResult.rows[0]["path"] ?? null) : null;
  if (!decodedPath || decodedPath.nodes.length === 0) {
    return [toFact({ ...anchor, entity, attribute })];
  }

  const facts = decodedPath.nodes.map((node) =>
    toFact({
      id: node.id,
      content: node.properties["content"],
      written_at: node.properties["written_at"],
      session_id: node.properties["session_id"],
      entity,
      attribute,
    }),
  );
  facts.sort((a, b) => (a.written_at < b.written_at ? -1 : a.written_at > b.written_at ? 1 : 0));
  return facts;
}

/**
 * Traces the shortest path between two entities across all sessions and
 * facts using the native `algo.SPpaths` procedure. Like `algo.SSpaths`
 * above, this must run as a standalone query with literal node ids, so the
 * two entity names are resolved to ids via separate reads first. Node
 * "kind" in the result is inferred from which property is present
 * (`content` => Fact, `name` => Entity, `session_key` => Session) rather
 * than via `labels()`, which HydraDB's RETURN doesn't support.
 */
export async function connectEntities(
  from: string,
  to: string,
  maxLen = 6,
): Promise<{ found: boolean; nodes: Array<{ label: string; id: string; content?: string }> }> {
  const [fromResult, toResult] = await Promise.all([
    query(`MATCH (e:Entity {name: $name}) RETURN e.id AS id`, { parameters: { name: from } }),
    query(`MATCH (e:Entity {name: $name}) RETURN e.id AS id`, { parameters: { name: to } }),
  ]);
  const fromId = fromResult.rows[0]?.["id"];
  const toId = toResult.rows[0]?.["id"];
  if (fromId === undefined || toId === undefined) {
    return { found: false, nodes: [] };
  }

  const pathResult = await query(
    `CALL algo.SPpaths({
       sourceNode: $source,
       targetNode: $target,
       relTypes: ['ABOUT', 'SUPERSEDES', 'STATES'],
       relDirection: 'both',
       maxLen: $max_len,
       pathCount: 1
     })
     YIELD path
     RETURN path`,
    { parameters: { source: Number(fromId), target: Number(toId), max_len: maxLen } },
  );

  const decodedPath = pathResult.rows[0] ? decodeHydraPath(pathResult.rows[0]["path"] ?? null) : null;
  if (!decodedPath || decodedPath.nodes.length === 0) {
    return { found: false, nodes: [] };
  }

  const nodes = decodedPath.nodes.map((node) => {
    const { content, name } = node.properties;
    if (typeof content === "string") return { label: "Fact", id: node.id, content };
    if (typeof name === "string") return { label: "Entity", id: node.id, content: name };
    return { label: "Session", id: node.id };
  });
  return { found: true, nodes };
}
