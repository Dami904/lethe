import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { query } from "../src/db/hydraClient.js";
import { writeFact } from "../src/db/graph.js";
import { hashToId } from "../src/db/ids.js";
import { idempotencyKeyFor } from "../src/lib/idempotency.js";

/**
 * Regression test for a real bug caught by the reliability-auditor
 * subagent: writeFact used to be a plain CREATE with a separate
 * check-then-write step in the route, which raced under concurrent
 * identical retries (the exact "flaky demo network" scenario idempotency
 * keys exist for) and could create two Fact nodes with the same
 * idempotency_key. writeFact now derives the Fact's id deterministically
 * from the idempotency key (src/db/ids.ts) and MERGEs on it, so concurrent
 * identical writes converge on exactly one node -- confirmed live against
 * HydraDB below.
 *
 * `wasCreated` itself is NOT asserted to be exclusive between the two
 * calls: HydraDB's write-only-query constraint (see docs/API_NOTES.md)
 * means a write can never report whether it created vs. matched, so
 * `wasCreated` is a best-effort pre-write existence check, not an atomic
 * signal -- under a genuine race, as exercised here, both calls can
 * legitimately see "not found" before either has written and both report
 * `wasCreated: true`. That's a documented, accepted inaccuracy in a
 * secondary reporting field (src/db/graph.ts, `writeFact` docstring); it
 * does not affect the actual invariant this test guards, which is that the
 * graph never ends up with two Fact nodes for one idempotency key.
 */
describe("idempotent fact writes under concurrency", () => {
  it("converges two concurrent identical writes onto exactly one Fact node", async () => {
    const entity = `test-entity-${randomUUID()}`;
    const attribute = "favorite_color";
    const sessionId = `test-session-${randomUUID()}`;
    const timestamp = "2023-05-01T00:00:00.000Z";
    const content = "blue";
    const idempotencyKey = idempotencyKeyFor({
      session_id: sessionId,
      entity,
      attribute,
      content,
    });

    const input = {
      session_id: sessionId,
      entity,
      attribute,
      content,
      timestamp,
      idempotency_key: idempotencyKey,
    };

    const [first, second] = await Promise.all([writeFact(input), writeFact(input)]);

    // Both calls must agree on the same underlying fact id.
    expect(first.fact.id).toBe(second.fact.id);

    // Both calls must agree on the fact's actual content -- neither one
    // clobbered the other with a different value under the race.
    expect(first.fact.content).toBe(content);
    expect(second.fact.content).toBe(content);

    // The graph itself must hold exactly one Fact node for this
    // deterministic id (Fact identity is derived from the idempotency key
    // itself -- see src/db/ids.ts -- so this is the same node MERGE
    // resolved both concurrent calls onto, not a separate check).
    const result = await query(`MATCH (f:Fact {id: $id}) RETURN f.content AS content`, {
      parameters: { id: hashToId("fact", idempotencyKey) },
    });
    expect(result.rows).toHaveLength(1);
  }, 30_000);
});
