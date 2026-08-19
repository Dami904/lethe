import { randomUUID } from "node:crypto";
import http from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { factsRouter } from "../src/routes/facts.js";
import { baselineRecall, invalidateBaselineCache } from "../src/baseline/vectorMemory.js";
import { query } from "../src/db/hydraClient.js";
import { hashToId } from "../src/db/ids.js";
import type { IngestFactResponse } from "../src/types.js";

/**
 * Regression test for the baseline in-process cache (src/baseline/vectorMemory.ts).
 * baselineRecall() used to re-scan and re-embed every Fact in the graph on
 * every call; it now caches that scan and only busts the cache on a real
 * write (see POST /facts -> invalidateBaselineCache). This test would fail
 * if a write ever stopped invalidating the cache -- i.e. if baselineRecall
 * started returning a candidate set that predates a fact written after the
 * cache was last warmed.
 *
 * topK is set far above the live graph's fact count so a hit/miss here is
 * strictly about cache freshness, not cosine-similarity ranking noise from
 * whatever else has been ingested into this dev DB.
 */
describe("baseline cache invalidation on write", () => {
  let server: http.Server;
  let baseUrl: string;
  const topK = 100_000;

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

  it(
    "a fact written after the cache is warm is still visible to the next baseline query",
    async () => {
      const entity = `baseline-cache-entity-${randomUUID()}`;
      const attribute = "favorite_language";
      const sessionId = `baseline-cache-session-${randomUUID()}`;
      const uniqueToken = randomUUID();
      const content = `${entity} loves the language ${uniqueToken}`;

      // Warm the cache with a query that predates this test's fact entirely
      // -- this is the call that would populate a stale snapshot if
      // invalidation were broken.
      const before = await baselineRecall(uniqueToken, topK);
      expect(before.matches.some((m) => m.content === content)).toBe(false);

      await postFact({
        session_id: sessionId,
        entity,
        attribute,
        content,
        timestamp: "2023-05-01T00:00:00.000Z",
      });

      const after = await baselineRecall(uniqueToken, topK);
      expect(after.matches.some((m) => m.content === content)).toBe(true);
    },
    // Two full-graph cold scans against this dev DB's real, accumulated
    // fact count (thousands, after this session's dataset ingests) --
    // legitimately slower than vitest's 30s default, not a hang.
    90_000,
  );

  it(
    "a Fact node with no entity property (e.g. written before the entity-denormalization backfill) is skipped, not rendered as the string \"null\"",
    async () => {
      // Reproduces the pre-backfill shape directly: same MERGE pattern
      // writeFact used to use, deliberately omitting `entity` from the Fact
      // node's own properties (only reachable via the ABOUT edge, the way
      // every Fact node looked before src/db/graph.ts started denormalizing
      // entity onto the node itself).
      const entity = `baseline-null-entity-${randomUUID()}`;
      const uniqueToken = randomUUID();
      const content = `orphaned fact with no entity property ${uniqueToken}`;
      const factId = hashToId("fact", `baseline-null-entity-key-${randomUUID()}`);
      const entityId = hashToId("entity", entity);

      await query(
        `MERGE (f:Fact {id: $fact_id, content: $content, written_at: $timestamp, session_id: $session_id, attribute: $attribute})-[:ABOUT]->(e:Entity {id: $entity_id, name: $entity, kind: "unknown"})`,
        {
          parameters: {
            fact_id: factId,
            content,
            timestamp: "2023-05-01T00:00:00.000Z",
            session_id: `baseline-null-entity-session-${randomUUID()}`,
            attribute: "orphan_attribute",
            entity_id: entityId,
            entity,
          },
        },
      );
      invalidateBaselineCache();

      const result = await baselineRecall(uniqueToken, topK);
      const orphan = result.matches.find((m) => m.content === content);

      expect(orphan).toBeUndefined();
      expect(result.matches.some((m) => m.entity === "null")).toBe(false);
    },
    90_000,
  );
});
