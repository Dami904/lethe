# Threat model

Kept short and current. Its job is to state trust assumptions explicitly so
they can be checked, not to be exhaustive.

## Trusted parties / keys

- `HYDRADB_AUTH_TOKEN` — a static bearer token authenticating the Lethe
  backend to the local HydraDB node. Grants full read/write on the `default`
  graph namespace in this deployment.
- The Lethe Express server itself — has no auth of its own. Anyone who can
  reach `PORT` (default 3000) can read and write facts.

## What happens if each one is compromised

- If `HYDRADB_AUTH_TOKEN` leaks: an attacker with network access to the
  HydraDB HTTP port (8443) can read and write arbitrary facts, including
  writing bogus `SUPERSEDES` edges that would make `/recall` return
  incorrect answers. Blast radius is bounded to this one local graph
  instance — there's no cross-tenant or cross-graph exposure since this
  deployment runs a single namespace for the demo.
- If the Lethe server's port is exposed beyond localhost: same blast radius
  as the token leaking, since the server itself doesn't gate access — it's
  a thin pass-through to HydraDB with no additional authorization layer.

## What's explicitly out of scope

- No authentication/authorization on the Lethe HTTP API itself (`/facts`,
  `/recall`, `/connect`, `/chain`, `/baseline/recall`). This is a hackathon
  demo meant to run locally; it is not hardened for public exposure.
- No rate limiting, no input size limits beyond what Express/JSON parsing
  impose by default.
- No encryption in transit — `GRAPH_ALLOW_PLAINTEXT=true` is used for local
  Docker development, matching HydraDB's own documented local-dev flow. TLS
  is required by HydraDB in deployed environments by default; this repo
  never turns that on because it never deploys HydraDB anywhere but a local
  container.
- No protection against a malicious `content` string beyond what Express's
  JSON body parser and parameterized Cypher queries provide. All Cypher
  queries in `src/db/graph.ts` use HydraDB's `parameters` field rather than
  string-interpolating user input into the query text, which is the actual
  injection defense here — not a separate sanitization layer.

## Known limitations

See `docs/LIMITATIONS.md` for the full list, including the two-request
(non-transactional) ingestion write and the fact that none of this has been
verified against a live HydraDB node yet in this environment.
