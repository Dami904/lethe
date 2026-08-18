import { Router } from "express";
import { connectEntities } from "../db/graph.js";
import { respondToUpstreamFailure } from "../lib/httpErrors.js";
import type { ConnectResult } from "../types.js";

export const connectRouter = Router();

connectRouter.get("/connect", async (req, res) => {
  const from = req.query["from"];
  const to = req.query["to"];

  if (typeof from !== "string" || typeof to !== "string") {
    res.status(400).json({ error: "expected query params: from, to (entity names)" });
    return;
  }

  try {
    const { found, nodes } = await connectEntities(from, to);
    const result: ConnectResult = { from, to, found, path: nodes };
    res.status(200).json(result);
  } catch (error) {
    respondToUpstreamFailure(res, "GET /connect", error);
  }
});
