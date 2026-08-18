import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import {
  findValidFactAsOf,
  streamValidFactsAsOf,
  writeFact,
  writeSupersedesEdge,
} from "../src/db/graph.js";
import { idempotencyKeyFor } from "../src/lib/idempotency.js";

/**
 * The single guard the project's correctness depends on: if the
 * supersession-walk logic breaks, `/recall` could return a superseded fact
 * or fail to abstain when it should. This talks to a real running HydraDB
 * (see README "Running tests") -- it is not mocked, because the property
 * this guards is a graph-shape property, not a function-return-value
 * property, and a mock would just re-assert our own assumptions back at us.
 */
describe("point-in-time recall correctness", () => {
  const entity = `test-entity-${randomUUID()}`;
  const attribute = "city";
  const sessionId = `test-session-${randomUUID()}`;

  const earlierAt = "2023-01-01T00:00:00.000Z";
  const laterAt = "2023-06-01T00:00:00.000Z";
  const betweenAsOf = "2023-03-01T00:00:00.000Z";
  const afterAsOf = "2023-12-01T00:00:00.000Z";
  const beforeEitherAsOf = "2022-01-01T00:00:00.000Z";

  beforeAll(async () => {
    const earlier = await writeFact({
      session_id: sessionId,
      entity,
      attribute,
      content: "London",
      timestamp: earlierAt,
      idempotency_key: idempotencyKeyFor({
        session_id: sessionId,
        entity,
        attribute,
        content: "London",
      }),
    });

    const later = await writeFact({
      session_id: sessionId,
      entity,
      attribute,
      content: "Tokyo",
      timestamp: laterAt,
      idempotency_key: idempotencyKeyFor({
        session_id: sessionId,
        entity,
        attribute,
        content: "Tokyo",
      }),
    });

    // writeFact returns the prior unsuperseded fact as a candidate; the
    // caller (the /facts route) decides whether content differs and writes
    // the SUPERSEDES edge. Do that explicitly here so this test exercises
    // the exact same graph shape production traffic produces.
    expect(later.priorUnsupersededFact?.id).toBe(earlier.fact.id);
    await writeSupersedesEdge(later.fact.id, earlier.fact.id, laterAt);
  }, 30_000);

  it("returns the earlier fact when as_of falls between the two writes", async () => {
    const result = await findValidFactAsOf(entity, attribute, betweenAsOf);
    expect(result?.content).toBe("London");
  });

  it("returns the later fact when as_of is after both writes", async () => {
    const result = await findValidFactAsOf(entity, attribute, afterAsOf);
    expect(result?.content).toBe("Tokyo");
  });

  it("never returns a superseded fact once it has been superseded", async () => {
    const result = await findValidFactAsOf(entity, attribute, afterAsOf);
    expect(result?.content).not.toBe("London");
  });

  it("abstains with a real graph non-existence check when as_of predates either fact", async () => {
    const result = await findValidFactAsOf(entity, attribute, beforeEitherAsOf);
    expect(result).toBeNull();
  });

  it("abstains for an attribute that was never stated about this entity", async () => {
    const result = await findValidFactAsOf(entity, "never_stated_attribute", afterAsOf);
    expect(result).toBeNull();
  });

  it("the NDJSON streaming path yields exactly the same single fact as the JSON path", async () => {
    const streamed: string[] = [];
    for await (const fact of streamValidFactsAsOf(entity, attribute, afterAsOf)) {
      streamed.push(fact.content);
    }
    // Regression: streamValidFactsAsOf used to omit LIMIT 1, so a race or a
    // backfill anomaly could surface as two "valid" facts over the wire.
    expect(streamed).toHaveLength(1);
    expect(streamed[0]).toBe("Tokyo");
  });

  it("the NDJSON streaming path yields nothing for the abstention case", async () => {
    const streamed: string[] = [];
    for await (const fact of streamValidFactsAsOf(entity, attribute, beforeEitherAsOf)) {
      streamed.push(fact.content);
    }
    expect(streamed).toHaveLength(0);
  });
});
