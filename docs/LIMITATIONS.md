# Limitations

Stated plainly, not buried.

## Point-in-time correctness is NOT HydraDB snapshot time-travel

This is the most important thing to get right when explaining Lethe to
judges who know HydraDB. **Point-in-time correctness (`/recall`'s `as_of`
parameter) is implemented entirely via ordinary Cypher property filtering
(`Fact.written_at <= $as_of`) and walking `SUPERSEDES` edges** — it does
**not** use HydraDB's pinned-snapshot/epoch mechanism.

Why: HydraDB's HTTP client rejects `read_epoch` outright as a request
parameter — "`read_epoch is not a storage snapshot selector; use bookmark
for causal reads`" (`src/client/http.rs`). HydraDB's snapshot pinning gives
every query a single consistent view of the *current* graph for read
correctness and causal bookmarking; it is not a client-selectable "read the
graph as it looked at time T in the past" API. Claiming otherwise to judges
would be overclaiming and a credibility risk.

What Lethe *does* use HydraDB for, genuinely:
- **`algo.SPpaths`** for the `/connect` cross-entity path query — a native
  bounded-path traversal instead of app-side BFS.
- **`algo.SSpaths`** for walking the `SUPERSEDES` chain for the frontend
  timeline visualization at `/chain`.
- **NDJSON streaming** (`Accept: application/x-ndjson`) on `/recall`, so
  results can be piped into an agent loop without waiting for a full
  response.
- **Pinned per-query snapshot consistency** for ordinary read correctness
  (every single query sees one consistent graph state), which is a real and
  useful property — just not the mechanism behind `as_of`.

## Ingestion is not transactional across its writes

`POST /facts` issues up to three sequential, standalone HTTP requests: a
Fact-`ABOUT`->Entity write, a Session-`STATES`->Fact write, and (only when a
conflict is detected) a `SUPERSEDES` edge write. None of these are wrapped
in one transaction — HydraDB's mutation engine only accepts standalone,
write-only, one-hop queries (confirmed live; see `docs/API_NOTES.md`), so
there is no multi-statement write available to reach for even if we wanted
one. At single-node hackathon-demo scale, the failure window between these
requests is real but narrow: if the process crashes mid-sequence, a fact
could end up written without its Session link or without its supersession
edge. The idempotency `MERGE` (id derived from the idempotency key) makes a
client-retried first write safe; there's no retry wrapper on the later
writes, and a crash mid-sequence would need a reconciliation pass to detect
and repair (not built).

## Node ids are deterministic hashes, not guaranteed globally unique

HydraDB's mutation engine requires nodes to be addressed by an integer `id`
(a hard constraint, not a design choice — see `docs/API_NOTES.md`).
`src/db/ids.ts` derives that integer from our string keys (entity name,
session id, idempotency key) via a 32-bit FNV-1a hash, namespaced per node
kind. At hackathon demo scale (dozens of nodes) collision probability is
negligible; at production scale this would need a real id-allocation scheme
(a sequence, a wider hash, or a hash+probe-on-conflict strategy), since a
collision would silently merge two unrelated nodes.

## `wasCreated` on fact writes is best-effort, not an atomic signal

Because HydraDB's mutation engine can never return data from a write query
(confirmed live), `writeFact` cannot learn "did I just create this node or
match an existing one" from the write itself. It does a pre-write existence
check instead. Under a genuine concurrent race between two identical
requests, both can see "not found" before either has written, and both will
report `wasCreated: true` / the route will report `deduped: false` for both
— an inaccurate reporting field. The underlying data is still race-safe
regardless: both requests compute the same deterministic Fact id and MERGE
identical values onto it, so the graph never ends up with two nodes. See
`test/idempotency.test.ts`, which asserts the property that actually
matters (one node, correct content) rather than the racy reporting field.

## NDJSON recall can't stream its answer incrementally

`HydraDB`'s `WITH` clause can't carry a `WHERE` (confirmed live), so the
"keep only the unsuperseded candidate, pick the most recent" filter that
used to run inside the query now runs in `src/db/graph.ts` after reading
back every candidate row. `streamValidFactsAsOf` therefore has to consume
the full (small, per-entity+attribute) NDJSON response before it can yield
its one answer — it still uses HydraDB's real streaming transport and still
yields at most one fact (matching the invariant), but it can't hand an agent
loop a row the instant the database determines it, the way the original
design intended. At the scale this project operates at (a handful of
candidate facts per entity+attribute) this is invisible in practice; it
would matter for an entity with a very long supersession chain.

## No client-side transaction retry / backoff

`src/db/hydraClient.ts` does not retry failed HTTP calls. A flaky demo
network will surface as a 502 from the relevant Lethe endpoint, not a
silent retry. Idempotency on `/facts` makes a *client-initiated* retry safe;
there's no automatic retry built in yet.

## Conflict detection is exact-content-mismatch, not semantic

A new fact about the same entity+attribute supersedes the prior one iff its
`content` string differs (case/whitespace-insensitive) from the prior
unsuperseded fact's content. There's no semantic equivalence check — "5
ounces" and "five ounces" would be treated as a genuine update, not a
restatement. Fine for the demo's hand-authored facts; would need real NLP
for arbitrary agent-authored content.

## LongMemEval seed facts are hand-extracted, not auto-extracted

LongMemEval ships full multi-turn chat transcripts (`haystack_sessions`),
not pre-extracted `entity/attribute/content` triples. Building a general
transcript-to-fact-triple extraction pipeline was out of scope for the
hackathon timeline. `scripts/seed.ts` / `src/demoFacts.ts` hand-extract three
real knowledge-update cases and one abstention case from
`data/longmemeval/subset.json` (a 4-instance real subset of the LongMemEval
oracle dataset), with the source `question_id` cited for each. A production
system would need an actual extraction step (an LLM call or a rules engine)
between "raw conversation" and "fact triple."

## No auth/multi-tenancy on the Lethe API itself

`/facts`, `/recall`, `/connect` etc. have no authentication layer of their
own — they trust `HYDRADB_AUTH_TOKEN` to gate access to HydraDB, but nothing
gates access to the Express app. Fine for a local hackathon demo; not
production-ready. See `docs/THREAT_MODEL.md`.

## Baseline is a hashed bag-of-words vectorizer, not a real embedding model

`src/baseline/embeddings.ts` uses feature hashing (FNV-1a over word
unigrams+bigrams, L2-normalized) rather than a trained embedding model. This
was a deliberate choice, not a shortcut we're hiding: it's fully offline
(no model download, no API key), fast, deterministic, and — because it's
purely lexical — it demonstrates the *same class of failure* a real
embedding model has here (no notion of recency/contradiction), just with a
cruder similarity signal. A judge cloning the repo cold can run
`pnpm baseline:eval` with zero setup.

## `/connect` is implemented but not exercised by the demo data

The seed data (`src/demoFacts.ts`) only ever states facts about a single
`user` entity, so there's no second named entity for `/connect` to trace a
path to in the current demo. The endpoint itself is verified against a live
node with synthetic multi-node data (see `docs/API_NOTES.md`'s native path
procedure section), but the shipped demo doesn't showcase it. A judge
wanting to see it would need to seed a fact naming a second entity (e.g. "X
works with Y") first.

## Verified live

Every claim above and every query shape in `src/db/graph.ts` has been
round-tripped against a real running HydraDB node (`scripts/hydradb-up.sh`)
in this environment, including the full test suite (`pnpm test`, 12/12
passing), the seed script (`pnpm seed`), and the baseline comparison
(`pnpm baseline:eval`, which shows Lethe 100% / naive baseline 0% on the
four demo cases). This was not a small effort: the mutation engine turned
out to reject nearly every write shape assumed from the README alone (see
`docs/API_NOTES.md`), and the whole data-access layer was rewritten around
what actually works before any of this passed.
