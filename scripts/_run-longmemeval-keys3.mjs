import "dotenv/config";
process.env.GEMINI_API_KEYS = process.env.GEMINI_API_KEYS3 || "";
const count = process.env.GEMINI_API_KEYS.split(/[,\n]/).map((k) => k.trim()).filter(Boolean).length;
console.error(`[keys3-only pool] ${count} keys`);

const { spawnSync } = await import("node:child_process");
const result = spawnSync("npx", ["--yes", "tsx", "scripts/ingest-longmemeval.ts"], {
  stdio: "inherit",
  env: {
    ...process.env,
    LONGMEMEVAL_DATA_PATH: "data/longmemeval/eval_subset_full_haystack.json",
    LONGMEMEVAL_CONCURRENCY: "6",
  },
});
process.exit(result.status ?? 1);
