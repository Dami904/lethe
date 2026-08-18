# Lethe

A temporal, self-correcting agent memory system on [HydraDB](https://github.com/hydra-db/hydradb).

Built for Hack Hydra (Track 3: Agent Memory).

## The problem

mem0/Zep-style agent memory stores facts as embeddings and retrieves by
cosine similarity. That can't tell a fresh fact from a contradicted one —
"I live in London" and "I live in Tokyo" are both highly similar to the
question "where do I live?", and a similarity search has no principled way
to prefer the current one. See the naive baseline in this repo reproduce
exactly that failure (`src/baseline/`).

## The fix

Facts are graph nodes. When a new fact contradicts an existing one about the
same entity+attribute, Lethe writes an explicit `SUPERSEDES` edge. Answering
"what do we know about X as of time T" is then a real graph query — filter
facts written by T, walk `SUPERSEDES` edges to find the one nothing
qualifying points at — not a similarity guess. If no fact ever existed,
`/recall` returns an explicit abstention (`{answer: null, reason:
"no_fact_stated"}`) backed by an actual non-existence check, not a guessed
"I don't know."

**The invariant that must never break:** a `/recall` response never returns
a superseded fact, and abstains rather than guesses when nothing is valid.
See `CLAUDE.md` and `test/recall.test.ts`.

## How HydraDB is used (judged criterion: "Best Use of HydraDB")

- **Pinned per-query snapshot consistency.** Every HydraDB query — including
  every `/recall` lookup — runs against one consistent snapshot, so a
  concurrent write mid-query can't produce a torn read. This is a real
  property Lethe depends on for correctness. **It is not, however, the
  mechanism behind `/recall`'s `as_of` time-travel** — HydraDB's HTTP API
  explicitly rejects a client-supplied `read_epoch` ("`read_epoch is not a
  storage snapshot selector; use bookmark for causal reads`"). Point-in-time
  correctness here is ordinary Cypher property filtering
  (`Fact.written_at <= as_of`) plus `SUPERSEDES`-edge walking. See
  `docs/LIMITATIONS.md` for the full, honest explanation — we'd rather state
  this plainly than overclaim to judges who know the product.
- **`algo.SPpaths`**, HydraDB's native bounded shortest-path procedure,
  powers `GET /connect?from=A&to=B` — cross-entity graph traversal without
  app-side BFS.
- **`algo.SSpaths`** powers `GET /chain` — walking a `SUPERSEDES` chain as a
  native bounded traversal for the frontend's timeline visualization,
  instead of app-side recursive queries.
- **NDJSON streaming** (`Accept: application/x-ndjson`) on `GET /recall` —
  a real HydraDB HTTP feature, used so results can be piped into an agent
  loop instead of waiting for a full response.

## Architecture

```
(:Entity {name, kind})
(:Fact {id, content, written_at, session_id, attribute, idempotency_key})
(:Session {id, started_at})

(:Session)-[:STATES]->(:Fact)
(:Fact)-[:ABOUT]->(:Entity)
(:Fact)-[:SUPERSEDES {at}]->(:Fact)   // new fact -> older fact it invalidates
```

Backend: Node.js + TypeScript + Express, talking to HydraDB over its plain
HTTP/JSON query API (no Bolt driver — see `src/db/hydraClient.ts`).
Frontend: a single static page, two panels (`public/`).

## Running locally

Prerequisites: Node 20+, pnpm, Docker.

```bash
pnpm install

# 1. Start HydraDB (creates .hydradb-data/, waits for readiness)
bash scripts/hydradb-up.sh

# 2. Start the app
cp .env.example .env
pnpm dev

# 3. Seed the demo's LongMemEval-derived contradiction facts
pnpm seed

# 4. Open the frontend
#    http://127.0.0.1:3000

# 5. Run the baseline-vs-Lethe accuracy comparison
pnpm baseline:eval
```

Optional: for semantic conflict detection and automated LongMemEval
extraction (see "Optional: LLM-powered features" below), set exactly one of
`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, or `GEMINI_API_KEY` in `.env`. With
none set, everything above works identically — conflict detection falls
back to exact-string matching automatically.

On native Windows with Docker Desktop and no bash (no WSL, no Git Bash),
replace step 1 with:
```powershell
powershell -ExecutionPolicy Bypass -File scripts/hydradb-up.ps1
```

## Running tests

```bash
bash scripts/hydradb-up.sh   # or scripts/hydradb-up.ps1 on native Windows
pnpm test
```

`test/recall.test.ts` is the one required correctness guard: it seeds two
conflicting facts at different timestamps and asserts `/recall`'s
supersession-walk returns the right one on either side of the update, and
abstains before either fact existed. It talks to a real running HydraDB, not
a mock — the property it guards is a graph-shape property.

## Demo dataset

`data/longmemeval/subset.json` is a 4-instance real subset of the
[LongMemEval](https://github.com/xiaowu0162/LongMemEval) oracle dataset
(3 `knowledge-update` cases + their paired abstention case). Facts are
hand-extracted from the evidence turns into entity/attribute/content
triples in `src/demoFacts.ts` — deliberate, so the frontend has clean,
natural-language sentences to display.

## Optional: LLM-powered features

Both require one of `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` /
`GEMINI_API_KEY` (see `src/lib/llm/`); without one, both fall back
automatically rather than failing.

**Semantic conflict detection.** By default, a new fact supersedes a prior
one about the same entity+attribute only if their content strings differ.
That can't tell a paraphrase ("5 ounces" vs. "five ounces") from a genuine
update — with a key set, `src/lib/conflictClassifier.ts` asks a small LLM
to classify `same` / `contradicts` / `unrelated` instead, with the
exact-string check as a mandatory fallback on any failure. See
`docs/LIMITATIONS.md` for the honest reliability caveats.

**Automated LongMemEval evaluation**, on a larger, real subset
(`data/longmemeval/eval_subset.json`, 20 knowledge-update + 3 abstention
instances) than the hand-curated demo:
```bash
pnpm ingest:longmemeval   # extracts + ingests real transcripts via the LLM
pnpm eval:longmemeval     # scores Lethe's supersession correctness, with N stated
```
Run for real against all 23 instances (Gemini, `gemini-3.1-flash-lite`):
**N = 53 auto-extracted update pairs, zero extraction failures. Lethe:
100% (53/53) correct once enough time has passed for an update to apply —
the actual invariant. Naive baseline: 0% (0/53).** See `docs/LIMITATIONS.md`
for exactly what this measures (and deliberately does not), plus a verified
explanation for the one softer number (85% correct at the *earlier*
timestamp — a same-session timestamp-tie artifact in the source data, not
a Lethe bug).

## Docs

- [`docs/API_NOTES.md`](docs/API_NOTES.md) — measured HydraDB HTTP API
  behavior, and what's still unverified against a live node.
- [`docs/LIMITATIONS.md`](docs/LIMITATIONS.md) — what's explicitly not
  handled, stated plainly.
- [`docs/THREAT_MODEL.md`](docs/THREAT_MODEL.md) — trust assumptions.
- [`CLAUDE.md`](CLAUDE.md) — the invariant and engineering rules this repo
  was built against.

## License

MIT — see [LICENSE](LICENSE).
