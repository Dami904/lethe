/**
 * Decodes HydraDB's tagged HTTP query values.
 * Mirrors `HttpQueryValue` in hydradb `src/client/http.rs`:
 *   #[serde(tag = "type", content = "value", rename_all = "snake_case")]
 *   enum HttpQueryValue { Null, VertexId(u64), Integer(u64), SignedInteger(i64),
 *                         Float(f64), Boolean(bool), String(String),
 *                         List(Vec<HttpQueryValue>), Path(QueryPath) }
 */
export type HydraTaggedValue =
  | { type: "null"; value?: null }
  | { type: "vertex_id"; value: number }
  | { type: "integer"; value: number }
  | { type: "signed_integer"; value: number }
  | { type: "float"; value: number }
  | { type: "boolean"; value: boolean }
  | { type: "string"; value: string }
  | { type: "list"; value: HydraTaggedValue[] }
  | { type: "path"; value: unknown };

export type DecodedValue =
  | null
  | number
  | boolean
  | string
  | DecodedValue[]
  | { __hydraPath: unknown };

export function decodeValue(raw: HydraTaggedValue): DecodedValue {
  switch (raw.type) {
    case "null":
      return null;
    case "vertex_id":
    case "integer":
    case "signed_integer":
    case "float":
      return raw.value;
    case "boolean":
      return raw.value;
    case "string":
      return raw.value;
    case "list":
      return raw.value.map(decodeValue);
    case "path":
      return { __hydraPath: raw.value };
    default: {
      const exhaustive: never = raw;
      throw new Error(`Unknown HydraDB value type: ${JSON.stringify(exhaustive)}`);
    }
  }
}

/** Decodes a single-row-per-column result into a plain object keyed by column name. */
export function decodeRow(
  columns: string[],
  row: HydraTaggedValue[],
): Record<string, DecodedValue> {
  const out: Record<string, DecodedValue> = {};
  columns.forEach((col, i) => {
    const cell = row[i];
    out[col] = cell === undefined ? null : decodeValue(cell);
  });
  return out;
}

/**
 * Decoded shape of a `path` value returned by `algo.SPpaths`/`algo.SSpaths`,
 * confirmed empirically against a live node (not from docs -- the Rust
 * `QueryPath` struct wasn't reviewed in source). Observed shape:
 *   { nodes: [{ id, labels, properties: { key: {String: "..."} | {Integer: N} | ... } }],
 *     relationships: [{ id, edge_type, src, dst, properties }] }
 * Property values inside a path use a different tagging convention than
 * top-level HttpQueryValue ({Variant: value} instead of {type, value}).
 */
export interface HydraPathNode {
  id: string;
  labels: string[];
  properties: Record<string, DecodedValue>;
}

export interface HydraPathRelationship {
  edgeType: string;
  src: string;
  dst: string;
}

export interface DecodedHydraPath {
  nodes: HydraPathNode[];
  relationships: HydraPathRelationship[];
}

function decodePathPropertyValue(value: unknown): DecodedValue {
  if (value === null || value === undefined) return null;
  if (typeof value !== "object") return value as DecodedValue;
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length !== 1) return null;
  const [, inner] = entries[0] as [string, unknown];
  return inner as DecodedValue;
}

/** Extracts the `{nodes, relationships}` path from the `{__hydraPath: ...}` wrapper `decodeValue` produces. */
export function decodeHydraPath(value: DecodedValue): DecodedHydraPath | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const wrapped = (value as { __hydraPath?: unknown }).__hydraPath;
  if (wrapped === undefined || typeof wrapped !== "object" || wrapped === null) return null;

  const raw = wrapped as { nodes?: unknown[]; relationships?: unknown[] };
  const nodes: HydraPathNode[] = (raw.nodes ?? []).map((n) => {
    const node = n as { id: unknown; labels?: unknown[]; properties?: Record<string, unknown> };
    const properties: Record<string, DecodedValue> = {};
    for (const [key, propValue] of Object.entries(node.properties ?? {})) {
      properties[key] = decodePathPropertyValue(propValue);
    }
    return {
      id: String(node.id),
      labels: Array.isArray(node.labels) ? node.labels.map(String) : [],
      properties,
    };
  });
  const relationships: HydraPathRelationship[] = (raw.relationships ?? []).map((r) => {
    const rel = r as { edge_type: unknown; src: unknown; dst: unknown };
    return { edgeType: String(rel.edge_type), src: String(rel.src), dst: String(rel.dst) };
  });
  return { nodes, relationships };
}
