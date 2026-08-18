/**
 * Deterministic, fully offline "embedding" for the naive baseline: a hashed
 * bag-of-words vector (the classic feature-hashing trick), L2-normalized.
 * No model weights, no network call, no API key -- a judge can clone the
 * repo cold and run the baseline comparison. This is intentionally the
 * *naive* side of the demo: it captures lexical similarity only, with zero
 * notion of recency or contradiction, which is exactly the failure mode
 * Lethe exists to fix.
 */
const DIMENSIONS = 256;

function tokenize(text: string): string[] {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const tokens = [...words];
  for (let i = 0; i < words.length - 1; i++) {
    tokens.push(`${words[i]}_${words[i + 1]}`);
  }
  return tokens;
}

function hashToken(token: string): number {
  let hash = 2166136261; // FNV-1a offset basis
  for (let i = 0; i < token.length; i++) {
    hash ^= token.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash) % DIMENSIONS;
}

export function embed(text: string): Float64Array {
  const vector = new Float64Array(DIMENSIONS);
  for (const token of tokenize(text)) {
    const idx = hashToken(token);
    vector[idx] = (vector[idx] ?? 0) + 1;
  }
  let norm = 0;
  for (const v of vector) norm += v * v;
  norm = Math.sqrt(norm);
  if (norm > 0) {
    for (let i = 0; i < DIMENSIONS; i++) vector[i] = (vector[i] ?? 0) / norm;
  }
  return vector;
}

export function cosineSimilarity(a: Float64Array, b: Float64Array): number {
  let dot = 0;
  for (let i = 0; i < DIMENSIONS; i++) dot += (a[i] ?? 0) * (b[i] ?? 0);
  return dot;
}
