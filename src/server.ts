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

// GET-only, read-only endpoints (/recall, /baseline/recall, /connect,
// /chain) need to be reachable from a separately-hosted frontend dev
// server (web/apps/web's Vite dev server, a different origin/port) --
// the Memory Playground calls these directly rather than through
// public/'s same-origin static page. Scoped to GET/OPTIONS only, since
// no state-changing route needs cross-origin access.
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  }
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  next();
});

app.get("/healthz", (_req, res) => res.status(200).json({ status: "ok" }));

app.use(factsRouter);
app.use(recallRouter);
app.use(connectRouter);
app.use(chainRouter);
app.use(baselineRouter);
app.use(demoRouter);

app.use(express.static(path.join(__dirname, "..", "public")));

if (process.env.NODE_ENV !== "test") {
  app.listen(env.port, "0.0.0.0", () => {
    console.log(`Lethe listening on http://0.0.0.0:${env.port}`);
  });
}
