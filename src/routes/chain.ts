import { Router } from "express";
import { getSupersessionChain } from "../db/graph.js";
import { respondToUpstreamFailure } from "../lib/httpErrors.js";

export const chainRouter = Router();

/** Powers the frontend's SUPERSEDES timeline/arrow visualization. */
chainRouter.get("/chain", async (req, res) => {
  const entity = req.query["entity"];
  const attribute = req.query["attribute"];

  if (typeof entity !== "string" || typeof attribute !== "string") {
    res.status(400).json({ error: "expected query params: entity, attribute" });
    return;
  }

  try {
    const facts = await getSupersessionChain(entity, attribute);
    res.status(200).json({ entity, attribute, facts });
  } catch (error) {
    respondToUpstreamFailure(res, "GET /chain", error);
  }
});
