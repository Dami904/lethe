import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

/**
 * File-backed cache for LLM classification results, keyed by a hash of the
 * two contents being compared. Exists so re-running the baseline/extraction
 * scripts repeatedly during development doesn't re-pay LLM cost+latency for
 * the same pair every time -- an in-memory cache wouldn't survive across
 * separate `pnpm` script invocations, which is the actual use case this is
 * for. Demo-scale only: single JSON file, synchronous I/O, not built for
 * concurrent-writer correctness. See docs/LIMITATIONS.md.
 */
const CACHE_DIR = path.resolve(process.cwd(), ".cache");
const CACHE_FILE = path.join(CACHE_DIR, "classifier-cache.json");

let cache: Record<string, string> | null = null;

function load(): Record<string, string> {
  if (cache) return cache;
  if (existsSync(CACHE_FILE)) {
    try {
      cache = JSON.parse(readFileSync(CACHE_FILE, "utf8")) as Record<string, string>;
      return cache;
    } catch {
      // Corrupt cache file -- treat as empty rather than failing the caller.
    }
  }
  cache = {};
  return cache;
}

export function cacheKey(a: string, b: string, context: string): string {
  return createHash("sha256").update(`${context}|${a}|${b}`).digest("hex");
}

export function getCached(key: string): string | undefined {
  return load()[key];
}

export function setCached(key: string, value: string): void {
  const data = load();
  data[key] = value;
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2));
}
