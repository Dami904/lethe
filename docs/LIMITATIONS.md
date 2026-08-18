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

## Conflict detection is LLM-classified with a mandatory exact-string fallback

`src/lib/conflictClassifier.ts` asks a small LLM (Anthropic, OpenAI, or
Gemini — whichever of `ANTHROPIC_API_KEY`/`OPENAI_API_KEY`/`GEMINI_API_KEY`
is set, see `src/lib/llm/index.ts`) to classify whether a new fact is the
`same` as, `contradicts`, or is `unrelated` to the prior unsuperseded fact
for that entity+attribute. This exists because cosine similarity genuinely
cannot do this job: "I live in London" and "I live in Tokyo" are *also*
highly similar as embeddings (same sentence template), so no similarity
threshold can distinguish a paraphrase from a contradiction — it's a
natural-language-inference question, not a similarity question.

**This is not 100% reliable**, and the design does not pretend otherwise:
- If no provider is configured, the call fails, times out (8s), or returns
  anything other than exactly one of the three expected words, the write
  falls back to the previous exact-string-mismatch heuristic (case/whitespace-
  insensitive) rather than blocking or guessing. A cloned repo with no LLM
  key behaves exactly as before this feature existed.
- An unparseable/ambiguous LLM response is treated as "unavailable," not as
  "contradicts" — an incorrect supersession is worse than a missed one,
  since it can make `/recall` return the wrong answer, which is the one
  thing this project exists to prevent.
- The classifier itself can misclassify. It has not been evaluated for
  accuracy on adversarial or genuinely ambiguous inputs — only on the three
  fixture cases in `test/conflictClassifier.test.ts` (paraphrase,
  contradiction, unrelated) and, if a key was available, the live cases in
  `test/extractFacts.live.test.ts`. Treat it as a real improvement over
  string-matching, not a solved problem.
- Results are cached by content-pair hash (`src/lib/classifierCache.ts`,
  `.cache/classifier-cache.json`, gitignored) so repeated runs of the same
  pair don't re-pay LLM latency/cost — this is a demo-scale convenience, not
  built for concurrent-writer correctness.

## Two separate LongMemEval datasets exist in this repo, for two separate purposes

`data/longmemeval/subset.json` (4 instances) backs the **shipped demo**
(`scripts/seed.ts` / `src/demoFacts.ts`) with three hand-extracted
knowledge-update cases and one abstention case, source `question_id` cited
for each. Hand-extraction here is deliberate, not a shortcut: the demo
needs clean, natural-language sentences for the frontend, and hand-curation
guarantees that.

`data/longmemeval/eval_subset.json` (23 instances: 20 knowledge-update +
3 paired abstention, oracle setting) backs the **automated pipeline**
(`scripts/ingest-longmemeval.ts` + `scripts/eval-longmemeval.ts`):
real multi-turn transcripts, processed in chronological session order,
extracted into `(entity, attribute, content)` triples by an LLM
(`src/ingest/extractFacts.ts`, schema-validated with zod before ever
reaching `writeFact`), then ingested and scored automatically. This
requires an LLM key (see the conflict-detection section above) — with none
configured, `pnpm ingest:longmemeval` says so plainly and exits rather than
silently doing nothing.

**What `eval-longmemeval.ts` measures, and what it deliberately does not:**
for every entity+attribute the extractor found a real update for (2+
distinct facts within one instance), it checks whether `/recall` returns
the earlier fact when queried before the update and the later fact after
— the core invariant, now exercised on real extracted data instead of only
the 4 hand-curated facts. It does **not** grade against LongMemEval's
original free-text `answer` field, because doing that honestly would need
a further LLM-judge call to compare a paraphrased answer against free
text — itself an unverified error source that would muddy exactly what's
being measured. Comparing against the extractor's own last-written content
isolates "does the supersession mechanism work end-to-end on real data"
(what Lethe claims) from "is extraction+answer-grading accurate" (a
different, harder problem). The baseline is queried with a synthetic
"What is the {attribute} for {entity}?" template, since there's no original
question tied to these auto-extracted pairs.

Entities are namespaced per instance (`${question_id}:${entity}`) in the
ingestion script — LongMemEval's 500 instances each describe a different
synthetic persona, but the extractor defaults to the generic entity name
`"user"` for all of them; without the namespace, facts from unrelated
instances would collide on entity+attribute and produce spurious
cross-instance `SUPERSEDES` edges.

**Extraction slug consistency is a real, imperfect mitigation, not a
guarantee.** The extractor is given the attribute slugs already seen
earlier in the same instance and told to reuse a matching one rather than
minting a new slug for the same topic — without this, a session updating
`home_city` could come back slugged `current_city` instead, silently
breaking the supersession chain. This reduces but does not eliminate slug
drift; it hasn't been measured at scale beyond the 23-instance subset.

**Status at time of writing: built and unit/fixture-tested, live execution
pending an LLM key being available in this environment** (see the
"Verified live" section below for exactly what has and hasn't been run for
real).

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

## Verified live, and what isn't yet

Every query shape in `src/db/graph.ts`, the full test suite (`pnpm test`,
30 passing + 4 intentionally-skipped live-LLM tests), `pnpm seed`, the
baseline comparison (`pnpm baseline:eval` — Lethe 100% / naive baseline 0%
on the four demo cases), and the `/connect` cross-entity scenario (now
shipped in the demo itself — see `src/demoFacts.ts`'s `seed-session-connect`
facts and `src/demoScenarios.ts`'s `connectScenario`, exercised end-to-end
in `test/connect.route.test.ts`) have all been round-tripped against a real
running HydraDB node in this environment. The mutation engine rejected
nearly every write shape assumed from the README alone (see
`docs/API_NOTES.md`); the whole data-access layer was rewritten around what
actually works before any of this passed.

**Not yet run live in this environment: the LLM-dependent paths** —
`classifyRelation`'s real classification calls, `extractFactsFromSession`'s
real extraction calls, and `scripts/ingest-longmemeval.ts` /
`scripts/eval-longmemeval.ts` end-to-end. No Anthropic/OpenAI/Gemini key was
available here. Everything LLM-dependent is fully covered by fixture-mocked
tests (`test/conflictClassifier.test.ts`, `test/extractFacts.test.ts`) that
never make a network call, plus an opt-in live suite
(`test/extractFacts.live.test.ts`, gated behind `RUN_LIVE_LLM_TESTS=1`) that
exercises the real request/response shape for whichever provider is
configured. Set one of the three API key env vars and run
`RUN_LIVE_LLM_TESTS=1 pnpm test`, then `pnpm ingest:longmemeval && pnpm
eval:longmemeval`, to close this gap the same way the HydraDB gap was
closed — by actually running it and fixing what breaks, not by assuming the
code is correct because it typechecks.
