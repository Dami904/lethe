import { randomUUID } from "node:crypto";
import http from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { factsRouter } from "../src/routes/facts.js";
import { connectRouter } from "../src/routes/connect.js";
import type { ConnectResult, IngestFactResponse } from "../src/types.js";

/**
 * Route-level test for GET /connect. Previously this was only verified at
 * the graph.ts level with synthetic data (per docs/LIMITATIONS.md); this
 * exercises the real HTTP route with data written through the real
 * ingestion path, the way a caller would actually use it.
 */
describe("GET /connect (route-level)", () => {
  let server: http.Server;
  let baseUrl: string;

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use(factsRouter);
    app.use(connectRouter);
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

  async function getConnect(from: string, to: string): Promise<ConnectResult> {
    const res = await fetch(
      `${baseUrl}/connect?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    );
    expect(res.status, `expected 2xx, got ${res.status}`).toBeLessThan(300);
    return (await res.json()) as ConnectResult;
  }

  it("finds a path between two entities linked through a shared session", async () => {
    const userEntity = `route-user-${randomUUID()}`;
    const colleagueEntity = `route-colleague-${randomUUID()}`;
    const sessionId = `route-connect-session-${randomUUID()}`;
    const timestamp = "2023-04-01T00:00:00.000Z";

    await postFact({
      session_id: sessionId,
      entity: userEntity,
      attribute: "colleague",
      content: `The user works with ${colleagueEntity}.`,
      timestamp,
    });
    await postFact({
      session_id: sessionId,
      entity: colleagueEntity,
      attribute: "team",
      content: `${colleagueEntity} leads a team.`,
      timestamp,
    });

    const result = await getConnect(userEntity, colleagueEntity);
    expect(result.found).toBe(true);
    expect(result.path.length).toBeGreaterThan(0);

    const labels = result.path.map((n) => n.label);
    expect(labels).toContain("Entity");
  }, 30_000);

  it("reports not found for two entities that were never linked", async () => {
    const entityA = `route-isolated-a-${randomUUID()}`;
    const entityB = `route-isolated-b-${randomUUID()}`;
    const sessionId = `route-connect-session-${randomUUID()}`;

    // Each entity gets its own fact, but in DIFFERENT sessions -- no shared
    // Session node to path through, so no connection should be found.
    await postFact({
      session_id: sessionId,
      entity: entityA,
      attribute: "note",
      content: "Isolated fact A.",
      timestamp: "2023-01-01T00:00:00.000Z",
    });
    await postFact({
      session_id: `${sessionId}-other`,
      entity: entityB,
      attribute: "note",
      content: "Isolated fact B.",
      timestamp: "2023-01-01T00:00:00.000Z",
    });

    const result = await getConnect(entityA, entityB);
    expect(result.found).toBe(false);
    expect(result.path).toHaveLength(0);
  }, 30_000);
});
