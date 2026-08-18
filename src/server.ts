import "./loadEnv.js";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { env } from "./env.js";
import { factsRouter } from "./routes/facts.js";
import { recallRouter } from "./routes/recall.js";
import { connectRouter } from "./routes/connect.js";
import { chainRouter } from "./routes/chain.js";
import { baselineRouter } from "./routes/baseline.js";
import { demoRouter } from "./routes/demo.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const app = express();
app.use(express.json());

app.get("/healthz", (_req, res) => res.status(200).json({ status: "ok" }));

app.use(factsRouter);
app.use(recallRouter);
app.use(connectRouter);
app.use(chainRouter);
app.use(baselineRouter);
app.use(demoRouter);

app.use(express.static(path.join(__dirname, "..", "public")));

if (process.env.NODE_ENV !== "test") {
  app.listen(env.port, () => {
    console.log(`Lethe listening on http://127.0.0.1:${env.port}`);
  });
}
