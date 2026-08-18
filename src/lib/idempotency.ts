import { createHash } from "node:crypto";

/**
 * Deterministic idempotency key for a fact write: hash of
 * session_id+entity+attribute+content, so a retried POST during a flaky
 * demo network reuses the same key and dedupes instead of double-writing
 * or spuriously superseding itself.
 */
export function idempotencyKeyFor(input: {
  session_id: string;
  entity: string;
  attribute: string;
  content: string;
}): string {
  const basis = `${input.session_id}|${input.entity}|${input.attribute}|${input.content}`;
  return createHash("sha256").update(basis).digest("hex");
}
