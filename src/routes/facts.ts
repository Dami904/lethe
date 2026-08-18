import { Router } from "express";
import { writeFact, writeSupersedesEdge } from "../db/graph.js";
import { idempotencyKeyFor } from "../lib/idempotency.js";
import { respondToUpstreamFailure } from "../lib/httpErrors.js";
import type { IngestFactRequest, IngestFactResponse } from "../types.js";

export const factsRouter = Router();

function isValidBody(body: unknown): body is IngestFactRequest {
  if (typeof body !== "object" || body === null) return false;
  const b = body as Record<string, unknown>;
  return (
    typeof b["session_id"] === "string" &&
    typeof b["entity"] === "string" &&
    typeof b["attribute"] === "string" &&
    typeof b["content"] === "string" &&
    typeof b["timestamp"] === "string" &&
    !Number.isNaN(Date.parse(b["timestamp"]))
  );
}

factsRouter.post("/facts", async (req, res) => {
  if (!isValidBody(req.body)) {
    res.status(400).json({
      error:
        "expected { session_id, entity, attribute, content, timestamp } as strings, timestamp ISO 8601",
    });
    return;
  }

  const body = req.body;
  const idempotencyKey =
    body.idempotency_key ??
    idempotencyKeyFor({
      session_id: body.session_id,
      entity: body.entity,
      attribute: body.attribute,
      content: body.content,
    });

  try {
    const { fact, wasCreated, priorUnsupersededFact } = await writeFact({
      session_id: body.session_id,
      entity: body.entity,
      attribute: body.attribute,
      content: body.content,
      timestamp: body.timestamp,
      idempotency_key: idempotencyKey,
    });

    if (!wasCreated) {
      // Either a genuine retry of the same idempotency key, or this request
      // lost a concurrent race to another writer with the same key -- both
      // cases converge on the one Fact node that actually got created, so
      // there is nothing further for this call to do.
      const response: IngestFactResponse = {
        fact,
        superseded_fact_id: null,
        superseded_by_fact_id: null,
        deduped: true,
      };
      res.status(200).json(response);
      return;
    }

    let supersededId: string | null = null;
    let supersededByFactId: string | null = null;
    const contentDiffers =
      priorUnsupersededFact &&
      priorUnsupersededFact.content.trim().toLowerCase() !==
        fact.content.trim().toLowerCase();

    if (priorUnsupersededFact && contentDiffers) {
      if (fact.written_at >= priorUnsupersededFact.written_at) {
        // The common case: this fact is chronologically at or after the
        // prior one, so it supersedes it.
        await writeSupersedesEdge(fact.id, priorUnsupersededFact.id, fact.written_at);
        supersededId = priorUnsupersededFact.id;
      } else {
        // A backfill/correction written with an EARLIER timestamp than the
        // already-current fact. The already-current fact still supersedes
        // this one -- writing the edge the other way would make /recall
        // return this stale backfilled fact instead of the true current
        // one, which is exactly the invariant this project exists to
        // guarantee never happens. See docs/API_NOTES.md.
        await writeSupersedesEdge(
          priorUnsupersededFact.id,
          fact.id,
          priorUnsupersededFact.written_at,
        );
        supersededByFactId = priorUnsupersededFact.id;
      }
    }

    const response: IngestFactResponse = {
      fact,
      superseded_fact_id: supersededId,
      superseded_by_fact_id: supersededByFactId,
      deduped: false,
    };
    res.status(201).json(response);
  } catch (error) {
    respondToUpstreamFailure(res, "POST /facts", error);
  }
});
