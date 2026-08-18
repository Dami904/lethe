import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { findValidFactAsOf, writeFact, writeSupersedesEdge } from "../src/db/graph.js";
import { idempotencyKeyFor } from "../src/lib/idempotency.js";

/**
 * Graph-layer test that `findValidFactAsOf` behaves correctly given a
 * backfilled (out-of-order-timestamp) SUPERSEDES edge -- i.e. that the
 * as-of query itself has no hidden assumption that supersession edges
 * always point from a chronologically-later fact to an earlier one.
 *
 * This does NOT exercise the actual direction-decision bug fix -- that
 * logic lives in `src/routes/facts.ts` (which picks edge direction by
 * comparing timestamps) and is covered end-to-end, through the real route,
 * by `test/facts.route.test.ts`. An earlier version of this file wrote the
 * edge direction by hand and was mistakenly described as covering the
 * route fix; it doesn't -- reliability-auditor caught that on re-review.
 */
describe("backfilled (out-of-order) writes never produce a backwards SUPERSEDES edge", () => {
  it("keeps the chronologically later fact valid after an earlier backfill arrives second", async () => {
    const entity = `test-entity-${randomUUID()}`;
    const attribute = "city";
    const sessionId = `test-session-${randomUUID()}`;

    const juneAt = "2023-06-01T00:00:00.000Z";
    const febAt = "2023-02-01T00:00:00.000Z";

    // Write the "current" fact first (June).
    const june = await writeFact({
      session_id: sessionId,
      entity,
      attribute,
      content: "Tokyo",
      timestamp: juneAt,
      idempotency_key: idempotencyKeyFor({
        session_id: sessionId,
        entity,
        attribute,
        content: "Tokyo",
      }),
    });
    expect(june.priorUnsupersededFact).toBeNull();

    // Now backfill an earlier, conflicting fact (Feb) -- simulating a
    // correction to history arriving after the fact it predates.
    const feb = await writeFact({
      session_id: sessionId,
      entity,
      attribute,
      content: "London",
      timestamp: febAt,
      idempotency_key: idempotencyKeyFor({
        session_id: sessionId,
        entity,
        attribute,
        content: "London",
      }),
    });
    expect(feb.priorUnsupersededFact?.id).toBe(june.fact.id);

    // This is the direction check from src/routes/facts.ts: since the new
    // fact's timestamp (Feb) is EARLIER than the prior unsuperseded fact's
    // timestamp (June), the prior fact must supersede the new one -- not
    // the other way around.
    expect(feb.fact.written_at < june.fact.written_at).toBe(true);
    await writeSupersedesEdge(june.fact.id, feb.fact.id, june.fact.written_at);

    // The June fact must still be the answer for any as_of at or after June,
    // never the backfilled Feb fact.
    const afterJune = await findValidFactAsOf(entity, attribute, "2023-12-01T00:00:00.000Z");
    expect(afterJune?.content).toBe("Tokyo");

    // And querying between the backfilled Feb write and the original June
    // write correctly surfaces the backfilled fact.
    const betweenFebAndJune = await findValidFactAsOf(entity, attribute, "2023-04-01T00:00:00.000Z");
    expect(betweenFebAndJune?.content).toBe("London");
  }, 30_000);
});
