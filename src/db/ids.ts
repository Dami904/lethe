/**
 * HydraDB treats a node property literally named `id` as the node's
 * internal vertex identity: it must be an integer, and it's the ONLY way
 * `CREATE`/`MERGE` can reference an existing node (property-pattern
 * matching on write is not supported -- see docs/API_NOTES.md). This maps
 * our application-level string keys (entity names, session ids, an
 * idempotency key) to deterministic integer ids, namespaced by node kind so
 * a Session/Entity/Fact can never collide on id even if their source
 * strings happen to hash the same.
 *
 * Determinism matters beyond convenience: it's what makes MERGE-based
 * idempotent writes work at all. Two requests carrying the same
 * idempotency key must compute the same Fact id so they MERGE onto the
 * same node instead of creating two.
 */
const NAMESPACE_OFFSET = {
  session: 1_000_000_000_000,
  entity: 2_000_000_000_000,
  fact: 3_000_000_000_000,
} as const;

export type IdNamespace = keyof typeof NAMESPACE_OFFSET;

function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0; // unsigned 32-bit
}

/**
 * Deterministic id in [namespace offset, namespace offset + 2^32). At
 * hackathon demo scale (dozens of facts/entities/sessions) collision
 * probability within one namespace is negligible; documented as a known
 * limitation for production scale in docs/LIMITATIONS.md.
 */
export function hashToId(namespace: IdNamespace, key: string): number {
  return NAMESPACE_OFFSET[namespace] + fnv1a(key);
}
