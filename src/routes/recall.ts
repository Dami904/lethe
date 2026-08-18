import { Router } from "express";
import { findValidFactAsOf, streamValidFactsAsOf } from "../db/graph.js";
import { respondToUpstreamFailure } from "../lib/httpErrors.js";
import type { RecallResult } from "../types.js";

export const recallRouter = Router();

recallRouter.get("/recall", async (req, res) => {
  const entity = req.query["entity"];
  const attribute = req.query["attribute"];
  const asOf = req.query["as_of"];

  if (
    typeof entity !== "string" ||
    typeof attribute !== "string" ||
    typeof asOf !== "string" ||
    Number.isNaN(Date.parse(asOf))
  ) {
    res.status(400).json({
      error: "expected query params: entity, attribute, as_of (ISO 8601 timestamp)",
    });
    return;
  }

  const wantsStream = req.headers["accept"] === "application/x-ndjson";

  try {
    if (wantsStream) {
      res.status(200);
      res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
      let sawAny = false;
      for await (const fact of streamValidFactsAsOf(entity, attribute, asOf)) {
        sawAny = true;
        res.write(JSON.stringify({ type: "fact", fact }) + "\n");
      }
      if (!sawAny) {
        const result: { type: "result" } & RecallResult = {
          type: "result",
          answer: null,
          fact: null,
          reason: "no_fact_stated",
        };
        res.write(JSON.stringify(result) + "\n");
      }
      res.end();
      return;
    }

    const fact = await findValidFactAsOf(entity, attribute, asOf);
    if (!fact) {
      const result: RecallResult = { answer: null, fact: null, reason: "no_fact_stated" };
      res.status(200).json(result);
      return;
    }

    const result: RecallResult = { answer: fact.content, fact };
    res.status(200).json(result);
  } catch (error) {
    respondToUpstreamFailure(res, "GET /recall", error);
  }
});
