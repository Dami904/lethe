import { Router } from "express";
import { baselineRecall } from "../baseline/vectorMemory.js";
import { respondToUpstreamFailure } from "../lib/httpErrors.js";

export const baselineRouter = Router();

baselineRouter.get("/baseline/recall", async (req, res) => {
  const q = req.query["query"];
  if (typeof q !== "string" || q.trim().length === 0) {
    res.status(400).json({ error: "expected query param: query (natural language question)" });
    return;
  }

  try {
    const result = await baselineRecall(q);
    res.status(200).json(result);
  } catch (error) {
    respondToUpstreamFailure(res, "GET /baseline/recall", error);
  }
});
