# Lethe — Temporal Graph Agent Memory

> A temporal, self-correcting agent memory system on HydraDB. Points of knowledge are immutable graph nodes, contradictions write explicit `SUPERSEDES` edges, and recall is a mathematical graph traversal.

Built for **Hack Hydra** (Track 3: Agent Memory).

---

## The Problem with Vector Memory

Traditional vector memory stores (mem0, Zep) retrieve facts via cosine distance. This cannot distinguish between a fresh fact and an outdated or contradicted one:
- *"I live in London"* and *"I live in Tokyo"* both match *"Where do I live?"* with high similarity (>0.92).
- Vector stores have no principled way to prioritize the current fact or handle historical non-existence.

## The Solution: Explicit `SUPERSEDES` Graph

In **Lethe**, facts are graph nodes in **HydraDB**:
1. **Immutable Nodes**: Each fact has a deterministic `id` derived via 32-bit FNV-1a hash, timestamp, and content.
2. **Explicit Invalidation**: When a new fact contradicts an existing one for the same entity and attribute, Lethe writes a directed `(:Fact)-[:SUPERSEDES {at}]->(:Fact)` edge.
3. **Point-in-Time Recall**: `GET /recall?as_of=T` filters facts where `written_at <= T` and walks the `SUPERSEDES` chain to return the active valid fact.
4. **Principled Abstention**: If no fact existed as of $T$, Lethe returns `{ answer: null, reason: "no_fact_stated" }` rather than guessing or hallucinating.

---

## Empirical Benchmark (LongMemEval)

Tested against all 78 real instances of the **LongMemEval** oracle dataset
(72 knowledge-update + 6 paired abstention) — 181 auto-extracted update
pairs, scored live against `/recall`:

| Metric | Lethe (HydraDB Graph) | Naive Vector Similarity |
|---|:---:|:---:|
| **Update Accuracy (after the update)** | **91%** (164/181) | **1%** (2/181) |
| **Update Accuracy (before the update)** | **92%** (166/181) | — |
| **Cross-Entity Traversal** | **Native** (`algo.SPpaths`) | Not Supported |
| **Streaming Transport** | **NDJSON** | Buffered JSON |

See the main [lethe repo's `docs/LIMITATIONS.md`](../docs/LIMITATIONS.md)
for the full methodology and an honest accounting of the ~9% gap on the
"before" metric (traced to a real, explained cause -- not a `/recall`
correctness bug). Also run against
[BEAM](https://github.com/mohammadtavakoli78/BEAM), a second, independent
long-term-memory benchmark: 91%/100%/1% on 155 pairs across 20 real
conversations.

---

## Quickstart

```bash
# Install dependencies
pnpm install

# Start the dev server
pnpm dev

# Build for production
pnpm build
```

---

## Architecture & Tech Stack

- **Frontend**: React 19, TypeScript, Vite 8, Tailwind CSS v4, Lenis, GSAP
- **Database Engine**: HydraDB (Cypher, `algo.SPpaths`, `algo.SSpaths`, NDJSON streaming)
- **Evaluation**: LongMemEval Benchmark suite

---

## License

MIT License
