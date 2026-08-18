# Repo instructions for Claude Code

Fill in the Mission section per project. Everything below applies to every
project you drop this into.

## Mission
Lethe is a temporal, self-correcting agent memory system built on HydraDB.
Instead of vector similarity (which can't distinguish a fresh fact from a
contradicted one), facts are graph nodes linked by explicit `SUPERSEDES`
edges, and "what do we know about X as of time T" is answered by a real
graph traversal, not a similarity guess. The invariant that must never
break: **a `/recall` response must never return a superseded fact, and
must explicitly abstain (`{answer: null, reason: "no_fact_stated"}`)
rather than guess when no fact is valid as of the query time.**

## Source of truth, in order
1. Behavior you've actually reproduced (a script you ran, a response you
   logged) — not behavior you assume an API has.
2. Current official docs for any third-party service this repo depends on.
3. This repo's own tests and deployed contract source.
4. This file and any PRD/spec doc.
5. Model output / assumptions — lowest priority, must be checked against 1-4
   before shipping.

## Non-negotiable invariants
<!-- List the 3-6 things that must always be true regardless of what feature
is being built. Example set for a payments/execution project:
- A state-changing external call is never sent without a persisted
  idempotency key.
- A failure response and "no response" are never treated as the same thing.
- No retry ever fires against a call that isn't provably idempotent.
- A guard that exists to prevent fund loss ships with a test that fails if
  the guard is deleted. -->

## Engineering rules
- Before integrating any external API that moves money or state, spend real
  time (or delegate to a subagent) mapping its failure modes: what does a
  timeout mean, is a 2xx synchronous or just "accepted", what's the actual
  idempotency guarantee. Write it down in `docs/API_NOTES.md` before writing
  the client.
- Use pnpm. Commit `pnpm-lock.yaml`. Never mix in a `package-lock.json` or
  `yarn.lock`.
- Keep TypeScript strict. Do not suppress type, lint, or test failures to
  get something green.
- Write or update a failing test before changing behavior, not after.
- Any script that needs a funded wallet, a live API key, or talks to
  mainnet gets a name prefix (`live:`, `deploy:`) so it's never accidentally
  run in CI or by a reviewer cloning the repo cold.
- Don't read `.env*`, keystores, or secret directories. Don't deploy to
  mainnet from an agent session.

## Required checks
Run the real package scripts once scaffolded. Intended gate list:
```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```
Wire all four into CI on every push and PR, not just the test step. A CI
that only runs `contracts:test` is not testing the app that ships it.

## Durable docs
Create and keep these current — they cost an afternoon and are the
difference between a project that looks finished and one that just looks
demoed:
- `docs/API_NOTES.md` — measured behavior of every external API this repo
  depends on for execution.
- `docs/LIMITATIONS.md` — what's explicitly NOT handled yet. Say it plainly;
  an honest limitations doc reads as more credible than silence, not less.
- `docs/THREAT_MODEL.md` — who's trusted, what happens if each key/wallet
  in the system is compromised.

## Review gates
After implementing a change, before calling it done, run the relevant
subagent:
- reliability/error-handling/retry/logging changes: `reliability-auditor`
- CI, scripts, packaging, repo structure, onboarding changes: `dx-auditor`

A task is not done until its subagent returns PASS.
