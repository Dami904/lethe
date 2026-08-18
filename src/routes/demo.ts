import { Router } from "express";
import { abstentionScenario, demoScenarios } from "../demoScenarios.js";

export const demoRouter = Router();

demoRouter.get("/demo/scenarios", (_req, res) => {
  res.status(200).json({ scenarios: demoScenarios, abstention: abstentionScenario });
});
