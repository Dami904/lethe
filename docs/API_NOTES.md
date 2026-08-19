# API notes: HydraDB

Measured behavior of the HydraDB HTTP query API this repo depends on.
Everything below is now **verified live**, against a real `graph-node`
running via `scripts/hydradb-up.sh` — not inferred from source/docs alone.
The gap between what the README's minimal example implies and what the
mutation engine actually accepts turned out to be large; this doc exists so
nobody has to rediscover it by trial and error again.

## HTTP query endpoint

```
POST {HYDRADB_HTTP_URL}/v1/graphs/{graph_id}/query
Authorization: Bearer <token>
X-Graph-Namespace: <namespace>
Content-Type: application/json

{
  "cell_id": "cell-0",
  "query": "<cypher>",
  "parameters": { "name": "value" },
  "consistency": "causal" | "strong",
  "bookmark": "...",
  "timeout_ms": 5000,
  "page_size": 100,
  "cursor": 0
}
```

Response (non-streaming):

```json
{
  "query_id": "http-query-1",
  "columns": ["id", "content"],
  "rows": [[{"type":"string","value":"..."}, {"type":"string","value":"..."}]],
  "read_epoch": 42,
  "next_cursor": null,
  "bookmark": "..."
}
```

Every scalar is a tagged `{type, value}` pair: `null`, `vertex_id`,
`integer`, `signed_integer`, `float`, `boolean`, `string`, `list`, `path`.
`src/db/valueCodec.ts` decodes these into plain JS values.

**`read_epoch` is rejected outright** if sent in a request body — the server
returns `UnsupportedQuery` with the message *"read_epoch is not a storage
snapshot selector; use bookmark for causal reads."* This is why Lethe does
not attempt to use HydraDB's pinned-snapshot mechanism for point-in-time
`/recall` correctness; see `docs/LIMITATIONS.md` for the full explanation.
Our client (`src/db/hydraClient.ts`) never sends `read_epoch`.

## Non-streaming query results are capped at 1024 rows, and cursor continuation is not implemented over HTTP

Confirmed live, not inferred from the schema above. A result over 1024 rows
comes back truncated to exactly 1024, with `next_cursor` set to a non-null
integer — the schema promises pagination, and `query()` (`src/db/
hydraClient.ts`) previously discarded `next_cursor` entirely, so any caller
reading a result set over 1024 rows was **silently working with an arbitrary
truncated subset**, not the full result, with no error to signal it.

Attempting to actually continue via a fresh request with `cursor:
<next_cursor>` fails outright:

```json
{"error":{"code":"invalid_request","message":"ClientProtocol query is not supported yet: result cursor is unknown or expired"}}
```

This is a confirmed **upstream gap**, not a client mistake:
[hydra-db/hydradb#78](https://github.com/hydra-db/hydradb/issues/78) shows
the server-side cursor-continuation machinery (`continue_server_cursor`,
`start_server_cursor`) genuinely exists in the engine for other transports,
but the HTTP `ClientProtocol` layer hasn't wired continuation up yet — hence
"not supported *yet*."

**The fix that actually works: NDJSON streaming has no such cap.** A single
`Accept: application/x-ndjson` request streams the entire result over one
connection with no follow-up request needed, so the 1024-row ceiling doesn't
apply. Confirmed live: the same query that truncated to 1024 rows over the
JSON transport returned all 7,283 rows via `queryNdjson` in ~5s.
`src/baseline/vectorMemory.ts`'s full-graph scan (the only place in this
repo that reads an unbounded-size result set — every other `query()` call
here is scoped to a single entity+attribute or session and stays well under
1024 rows) was switched from `query()` to `queryNdjson()` for exactly this
reason. **Any future caller that reads an unscoped or large result set over
the non-streaming transport should be treated as suspect** until verified
against a result size over 1024 rows.

## An unfiltered edge-traversal scan can hit HydraDB's own 30s query timeout

Also confirmed live, also independent of the row-count cap above.
`MATCH (f:Fact)-[:ABOUT]->(e:Entity) RETURN ...` — reading every Fact's
entity name by traversing the `ABOUT` edge, with no scoping — reliably hit:

```json
{"error":{"code":"query_timeout","message":"query_out_neighbors_scan exceeded query timeout after 30000 ms; limit is 30000 ms"}}
```

once the graph passed roughly 7,000 facts, reproduced identically over both
the streaming and non-streaming transports (so this is a query-execution
cost, not a transport artifact — switching to NDJSON alone does not fix it).
A **label-only** scan with no edge traversal (`MATCH (f:Fact) RETURN
f.id, f.attribute`) against the same graph completed in under 5 seconds,
isolating the edge traversal itself (`query_out_neighbors_scan`) as the
expensive part, not the row count.

**The fix**: `writeFact` (`src/db/graph.ts`) now also writes `entity` as a
plain property directly on the `Fact` node — redundant with the `ABOUT`
edge's target, but read without ever traversing it. `baselineRecall`'s scan
reads `f.entity` directly instead of walking to `Entity.name`. This is safe
to backfill onto already-existing Fact nodes because `MERGE` upserts by `id`
and re-running the (already idempotent) ingest scripts re-`MERGE`s every
existing node with the new property added.

**Why this matters beyond just fixing a timeout**: this scan is exactly what
`baselineRecall` (the naive vector-memory comparison baseline, not Lethe's
own `/recall` path) uses to build its full candidate set on every query, and
it is *unscoped by dataset* — see "One shared graph across all ingested
datasets" in `docs/LIMITATIONS.md` for why that made the cost grow with
every dataset ingested in the same session, not just the one being
evaluated.

## NDJSON streaming

Send `Accept: application/x-ndjson` on the same endpoint. The response is a
stream of newline-delimited JSON events:

```
{"type":"header","query_id":"...","columns":[...],"read_epoch":...}
{"type":"row","values":[{"type":"string","value":"..."}, ...]}
{"type":"row","values":[...]}
{"type":"summary","bookmark":"...","has_more":false}
```

(and `{"type":"error", ...}` if the query fails mid-stream). Confirmed live:
a `summary` event is always sent on a successful completion (checked against
`ndjson_response` in `src/client/http.rs` — it fires whenever there's no
further page), which is what lets `src/db/hydraClient.ts` treat a stream
that ends without one as a failure rather than an empty result. Used by
`/recall` when the caller sends `Accept: application/x-ndjson`.

## The mutation engine is far more restrictive than the README example implies

The README's own verification recipe (`CREATE (a {id: 1})-[:FOLLOWS]->(b {id:
2})` as one query, then a separate `MATCH ... RETURN` as another) isn't a
simplified example — it is close to the **entire** grammar the mutation
engine accepts today. Everything below was found by testing minimal query
shapes directly against a live node until each one either worked or returned
a specific rejection message.

**`id` is a reserved node property.** It is the node's internal vertex
identity, must be an integer, and property-pattern matching (`MATCH (e
{name: $n})`) does **not** work as a way to reference a node from a write —
only `id` does. `src/db/ids.ts` maps our application-level string keys
(entity names, session ids, an idempotency key) to deterministic integers so
writes can address existing nodes at all. Property-based matching (`{name:
$n}`, `{attribute: $a}`, etc.) works fine in **read** queries.

**Every write is a standalone, write-only, one-hop query.** Concretely,
confirmed by direct testing:
- `CREATE`/`MERGE` must describe exactly one edge, `(a)-[:REL]->(b)` — a
  bare single-node `CREATE (a {...})` with no edge is rejected
  ("`only one-hop edge patterns are executable in Query engine CREATE`"),
  and so is a longer chain.
- A write can never be followed by `RETURN`, `WITH`, or another `MATCH` in
  the same query ("`mutation queries cannot continue with MATCH, RETURN, or
  WITH after writes`") — nothing is ever read back from a write response;
  every write response has empty `columns`/`rows`.
- A write can never be *preceded* by a `MATCH` either — `MATCH (existing)
  CREATE (existing)-[:REL]->(new)` is rejected with a different error
  ("`write query is not executable by the mutation engine`"). The only way
  to attach an edge to an already-existing node is to reference it by
  literal/parameterized `id` directly in the `CREATE`/`MERGE` pattern, with
  no preceding `MATCH` at all.
- `MERGE ... ON CREATE SET ...` / `ON MATCH SET ...` actions are rejected
  outright ("`MERGE ON CREATE/ON MATCH actions are not executable in Query
  engine`"), regardless of whether anything follows.
- Plain `MATCH ... SET ...` (no `CREATE`/`MERGE`, no `RETURN`) does work —
  confirmed live — so property updates on an already-matched node are fine;
  it's specifically `CREATE`/`MERGE` that carry the one-hop/write-only
  restrictions above.

**`MERGE` upserts by `id`, and does not clear properties you omit.**
Re-`MERGE`ing an existing `id` with a *different* value for a property you
do specify overwrites it (confirmed: re-merging a node's `tkey` with a new
value changed it). Re-`MERGE`ing the same `id` with *fewer* properties than
before does **not** clear the ones you left out (confirmed: an id-only
re-merge of a node with an existing `tkey` left that `tkey` untouched). This
is what makes it safe for `writeSupersedesEdge` to reference two
already-fully-written Fact nodes by `id` alone, without repeating their
content/written_at/etc.

**`WITH` only supports plain pass-through identifiers** — no `WHERE`,
`DISTINCT`, `ORDER BY`, `SKIP`, or `LIMIT` attached
("`WITH currently supports only pass-through identifiers without
DISTINCT, WHERE, ORDER BY, SKIP, or LIMIT`"). The original design for
`findValidFactAsOf` used `... WITH f, g WHERE g IS NULL ...` to drop
superseded candidates before picking the most recent one — that's exactly
the unsupported shape. Every read in `src/db/graph.ts` now does the
`OPTIONAL MATCH` (the actual graph check) in HydraDB, then does the
"drop rows where a superseder was found, keep the most recent
`written_at`" filter in JS (`pickCurrent` in `src/db/graph.ts`). The
graph-existence check itself is still fully server-side; only the final
filter+argmax moved to the application.

**`RETURN` only supports `<binding>.<property>` (or `count(*)`)** — no
`labels()`, `coalesce()`, or `count(f)`
("`RETURN currently supports <binding>.<property> or count(*)`").
`connectEntities` infers a result node's "kind" in JS from which property
is present (`content` ⇒ Fact, `name` ⇒ Entity, `session_key` ⇒ Session)
instead of calling `labels()`.

## Native path procedures

`algo.SPpaths` (single pair) and `algo.SSpaths` (single source) are called
via `CALL algo.XXpaths({...}) YIELD path RETURN path`, and — consistent with
"every write/CALL is standalone" above — **must be a standalone query**:
`sourceNode`/`targetNode` take literal or parameterized integer node ids,
not a variable bound by a preceding `MATCH` in the same query (`MATCH (a),
(b) CALL algo.SPpaths({sourceNode: a, ...})` is rejected: "`query transport
cannot authorize an unsupported Cypher clause`"). Both `src/db/graph.ts`
functions that call these procedures (`connectEntities`, `getSupersessionChain`)
resolve the relevant node's `id` via a separate read first.

A decoded `path` value's real shape (confirmed live, not from source review):
```json
{
  "nodes": [
    { "id": 2001, "labels": [], "properties": { "content": {"String": "..."}, "written_at": {"String": "..."} } }
  ],
  "relationships": [
    { "id": null, "edge_type": "ABOUT", "src": 2001, "dst": 2002, "properties": {} }
  ]
}
```
Property values inside a path use `{VariantName: value}` tagging (e.g.
`{"String": "..."}`), a different convention from the top-level
`HttpQueryValue` tagging (`{"type": "string", "value": "..."}`).
`decodeHydraPath` in `src/db/valueCodec.ts` decodes this shape directly —
the node objects carry full properties inline, so `getSupersessionChain`
never needs a follow-up fetch to get fact content back out of a path.

Lethe uses:
- `algo.SPpaths` in `/connect` — shortest path between two named entities.
- `algo.SSpaths` in `/chain` — bounded walk of the `SUPERSEDES` chain
  starting from the currently-valid fact, for the frontend timeline
  visualization only, not for `/recall` correctness.

## Ingestion write shape

`writeFact` in `src/db/graph.ts` issues two standalone one-hop `MERGE`
writes (Fact-`ABOUT`->Entity, then Session-`STATES`->Fact); a follow-up
`SUPERSEDES` edge write (via `writeSupersedesEdge`) is a third, separate
request, issued only when the caller (`src/routes/facts.ts`) decides a
conflict exists. None of these are wrapped in one transaction — see
"Ingestion is not transactional" in `docs/LIMITATIONS.md`.

The Fact node's `id` is derived deterministically from the idempotency key
(`hashToId("fact", idempotency_key)`), not randomly generated, specifically
so two concurrent requests carrying the same idempotency key MERGE onto the
*same* node instead of racing into creating two — this is what actually
fixes the idempotency race (a real bug caught by the `reliability-auditor`
subagent), not response introspection. Because writes can never return
data (see above), `wasCreated` is a best-effort pre-write existence check,
not an atomic signal — see the `writeFact` docstring and
`test/idempotency.test.ts` for the accepted tradeoff this implies.

**Supersession direction is picked by comparing timestamps, not by
assuming the newly-written fact is always the newer one.** A fact written
with a timestamp earlier than the current unsuperseded fact for the same
entity+attribute (a backfill/correction) must be superseded BY that current
fact, not supersede it — getting this backwards was a real bug caught by
the `reliability-auditor` subagent that would have let `/recall` return a
stale backfilled fact instead of the true current one. The direction check
lives in `src/routes/facts.ts`; `test/facts.route.test.ts` posts through the
real route and confirms it live.

## Schema note: `attribute` is not in the prompt's illustrative schema

The build brief's Cypher schema block shows `(:Fact {id, content, written_at,
session_id})` without an `attribute` field, but every endpoint
(`/facts`, `/recall`, `/connect`) is specified in terms of
`entity + attribute`. We store `attribute` as a `Fact` property — a
necessary, minimal extension of the illustrative schema, not a deviation
from its intent. Note that our `id` property is NOT the same kind of field
the illustrative schema meant — see "id is a reserved node property" above;
it's HydraDB's internal vertex identity, and the externally-visible `Fact.id`
in API responses is that integer, stringified.

## Recall correctness: edge-direction reading

The build brief describes the as-of check as: facts with `written_at <=
as_of` "that have **no outgoing** `SUPERSEDES` edge to a fact that also has
written_at <= as_of." Taken literally with the schema's own stated edge
direction (`(new)-[:SUPERSEDES]->(old)`, "new fact invalidates an older
one"), that phrasing would filter out exactly the newest fact in a chain,
not the superseded one. We implement the semantically-correct version
instead — a fact is currently valid iff it is **not the target of an
incoming** `SUPERSEDES` edge from another qualifying fact — since that is
the version that satisfies the actual invariant ("`/recall` must never
return a superseded fact") and matches the schema comment's stated edge
direction. See `findValidFactAsOf` in `src/db/graph.ts` and
`test/recall.test.ts`, all passing live against a real node.

# API notes: Gemini (`generativelanguage.googleapis.com`)

Measured live via `src/lib/llm/geminiProvider.ts` and
`src/lib/llm/fetchWithTimeout.ts`, used for `extractFactsFromSession`
(LongMemEval ingestion) and `classifyRelation` (conflict detection on every
write where a prior fact exists and `skip_classifier` isn't set).

## Free-tier quota is 15 requests/minute, and it fails hard, not soft

Confirmed live, both from a 429 response body and from watching it happen:
firing extraction calls back-to-back for a batch ingest (no pacing) burned
through the quota in well under a minute, and every call after that failed
until the window rolled over — 262 total 429s across one ~150-call ingest
run, 134 of ~150 sessions failing extraction entirely. The 429 body is
specific and actionable, not a bare status code:

```json
{
  "error": {
    "code": 429,
    "status": "RESOURCE_EXHAUSTED",
    "message": "...Please retry in 12.242531463s.",
    "details": [
      {
        "@type": "type.googleapis.com/google.rpc.QuotaFailure",
        "violations": [{"quotaMetric": "...generate_content_free_tier_requests", "quotaId": "GenerateRequestsPerMinutePerProjectPerModel-FreeTier", "quotaValue": "15"}]
      },
      {"@type": "type.googleapis.com/google.rpc.RetryInfo", "retryDelay": "12s"}
    ]
  }
}
```

`fetchJsonOrNull` did not originally read any of this — it gave up on the
first 429. **Fix**: it now retries up to `maxRetries` (default 2), honoring
whichever of these it finds first: the standard `Retry-After` response
header, then this JSON body's `error.details[].retryDelay` (`"12s"`-style,
parsed by `parseGeminiRetryDelaySeconds`), then a 5s fallback if neither is
present — capped at 20s either way. Re-verified live: re-running the exact
same LongMemEval ingest that produced 134 failed sessions produced 1 failed
session with the fix in place.

## A transient network failure is a completely separate failure mode from a 429

Immediately after the 429 fix above, the very next live ingest run hit 256
`TypeError: fetch failed` / `getaddrinfo ENOTFOUND
generativelanguage.googleapis.com` errors — zero 429s that run. This
reproduced consistently across several calls in a short window, then
resolved on its own (`getent hosts` and a direct `curl` to the API host both
worked normally minutes later) — consistent with a transient WSL2 DNS
resolver blip, not a persistent problem with the host or the key. `fetch()`
*rejecting* rather than resolving with a non-ok response is a different code
path than the 429 case (caught in `fetchJsonOrNull`'s `catch` block, not the
`!response.ok` branch), and needed its own retry: a fixed 2s backoff (no
server-provided hint exists for a DNS failure), same `maxRetries` budget.
Not currently distinguished from other thrown errors (e.g. `ECONNRESET`,
`ECONNREFUSED`) — all thrown errors share this retry path, since a bounded
retry is harmless for a side-effect-free completion call regardless of the
specific cause.

## Model selection

`gemini-3.7-flash` (the newest listed model when this was first checked)
returned persistent 503 "high demand" errors that didn't clear on retry;
`gemini-2.5-flash` returned 404 ("no longer available to new users").
`gemini-3.1-flash-lite` responds cleanly and is the default
(`GEMINI_MODEL` env var overrides it). Confirmed against a real key's
`/v1beta/models` list and real `generateContent` calls, not guessed.
