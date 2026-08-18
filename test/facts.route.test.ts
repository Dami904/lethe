import { randomUUID } from "node:crypto";
import http from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { factsRouter } from "../src/routes/facts.js";
import { findValidFactAsOf } from "../src/db/graph.js";
import type { IngestFactResponse } from "../src/types.js";

/**
 * Route-level regression test for the SUPERSEDES-direction fix
 * (reliability-auditor finding #1). `test/backfill.test.ts` calls the graph
 * layer directly and hand-picks the correct edge direction, which means it
 * never actually exercises the decision logic that was the bug -- that
 * logic lives in the POST /facts route handler, not in `writeFact`. This
 * test posts through the real route so a regression there would fail here.
 */
describe("POST /facts (route-level)", () => {
  let server: http.Server;
  let baseUrl: string;

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use(factsRouter);
    server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  });

  async function postFact(body: Record<string, unknown>): Promise<IngestFactResponse> {
    const res = await fetch(`${baseUrl}/facts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    expect(res.status, `expected 2xx, got ${res.status}`).toBeLessThan(300);
    return (await res.json()) as IngestFactResponse;
  }

  it("the newer fact supersedes the prior one on a normal forward write", async () => {
    const entity = `route-entity-${randomUUID()}`;
    const attribute = "city";
    const sessionId = `route-session-${randomUUID()}`;

    const first = await postFact({
      session_id: sessionId,
      entity,
      attribute,
      content: "London",
      timestamp: "2023-01-01T00:00:00.000Z",
    });
    expect(first.superseded_fact_id).toBeNull();

    const second = await postFact({
      session_id: sessionId,
      entity,
      attribute,
      content: "Tokyo",
      timestamp: "2023-06-01T00:00:00.000Z",
    });
    expect(second.superseded_fact_id).toBe(first.fact.id);
    expect(second.superseded_by_fact_id).toBeNull();
  });

  it("a backfilled (earlier-timestamp) write is superseded BY the existing current fact, not the reverse", async () => {
    const entity = `route-entity-${randomUUID()}`;
    const attribute = "city";
    const sessionId = `route-session-${randomUUID()}`;

    const current = await postFact({
      session_id: sessionId,
      entity,
      attribute,
      content: "Tokyo",
      timestamp: "2023-06-01T00:00:00.000Z",
    });
    expect(current.superseded_fact_id).toBeNull();

    const backfilled = await postFact({
      session_id: sessionId,
      entity,
      attribute,
      content: "London",
      timestamp: "2023-02-01T00:00:00.000Z",
    });

    // This is exactly the assertion that would fail if the direction check
    // in src/routes/facts.ts were reverted back to always writing
    // `fact -> priorUnsupersededFact` regardless of timestamp order.
    expect(backfilled.superseded_fact_id).toBeNull();
    expect(backfilled.superseded_by_fact_id).toBe(current.fact.id);

    // And the effect must be visible through the actual recall path: the
    // chronologically-later fact must still win for any as_of at or after it.
    const result = await findValidFactAsOf(entity, attribute, "2023-12-01T00:00:00.000Z");
    expect(result?.content).toBe("Tokyo");
  });

  it("a retried POST with the same idempotency key dedupes instead of double-writing", async () => {
    const entity = `route-entity-${randomUUID()}`;
    const attribute = "favorite_color";
    const sessionId = `route-session-${randomUUID()}`;
    const body = {
      session_id: sessionId,
      entity,
      attribute,
      content: "green",
      timestamp: "2023-03-01T00:00:00.000Z",
      idempotency_key: `route-retry-${randomUUID()}`,
    };

    const first = await postFact(body);
    expect(first.deduped).toBe(false);

    const retry = await postFact(body);
    expect(retry.deduped).toBe(true);
    expect(retry.fact.id).toBe(first.fact.id);
  });
});
