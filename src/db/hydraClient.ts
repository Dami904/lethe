import { env } from "../env.js";
import { decodeRow, type DecodedValue, type HydraTaggedValue } from "./valueCodec.js";

export type QueryParamValue =
  | null
  | string
  | number
  | boolean
  | QueryParamValue[];

export interface QueryOptions {
  parameters?: Record<string, QueryParamValue>;
  /**
   * "causal" (default hot path) or "strong" (refreshes from object storage
   * before pinning the snapshot). We never send `read_epoch` — HydraDB's
   * HTTP API rejects it outright ("read_epoch is not a storage snapshot
   * selector; use bookmark for causal reads"), so as-of-time correctness is
   * implemented entirely in Cypher, not via HydraDB snapshot selection.
   * See docs/LIMITATIONS.md.
   */
  consistency?: "causal" | "strong";
}

export interface QueryResult {
  queryId: string;
  columns: string[];
  rows: Record<string, DecodedValue>[];
  bookmark: string | null;
}

interface RawQueryResponse {
  query_id: string;
  columns: string[];
  rows: HydraTaggedValue[][];
  read_epoch: number | null;
  next_cursor: number | null;
  bookmark: string | null;
}

function endpointUrl(): string {
  return `${env.hydraHttpUrl}/v1/graphs/${env.hydraGraphId}/query`;
}

function baseHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${env.hydraAuthToken}`,
    "X-Graph-Namespace": env.hydraNamespace,
    "Content-Type": "application/json",
  };
}

/**
 * Runs a Cypher query against HydraDB's HTTP query API and returns the full
 * (single-page) result as plain JS rows. Good for everything except the
 * streaming recall path, which uses `queryNdjson` instead.
 */
export async function query(
  cypher: string,
  options: QueryOptions = {},
): Promise<QueryResult> {
  const response = await fetch(endpointUrl(), {
    method: "POST",
    headers: baseHeaders(),
    body: JSON.stringify({
      cell_id: env.hydraCellId,
      query: cypher,
      parameters: options.parameters ?? {},
      consistency: options.consistency,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `HydraDB query failed (${response.status}): ${body || response.statusText}`,
    );
  }

  const payload = (await response.json()) as RawQueryResponse;
  return {
    queryId: payload.query_id,
    columns: payload.columns,
    rows: payload.rows.map((row) => decodeRow(payload.columns, row)),
    bookmark: payload.bookmark,
  };
}

export interface NdjsonEvent {
  type: "header" | "row" | "summary" | "error";
  raw: Record<string, unknown>;
}

/**
 * Runs a Cypher query against HydraDB's NDJSON streaming endpoint
 * (`Accept: application/x-ndjson`) and yields decoded rows as they arrive,
 * instead of waiting for the full result. Used by the recall endpoint so
 * results can be piped directly into an agent loop.
 */
export async function* queryNdjson(
  cypher: string,
  options: QueryOptions = {},
): AsyncGenerator<Record<string, DecodedValue>> {
  const response = await fetch(endpointUrl(), {
    method: "POST",
    headers: {
      ...baseHeaders(),
      Accept: "application/x-ndjson",
    },
    body: JSON.stringify({
      cell_id: env.hydraCellId,
      query: cypher,
      parameters: options.parameters ?? {},
      consistency: options.consistency,
    }),
  });

  if (!response.ok || !response.body) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `HydraDB NDJSON query failed (${response.status}): ${body || response.statusText}`,
    );
  }

  let columns: string[] = [];
  let buffer = "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  let sawSummary = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let newlineIndex: number;
      while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);
        if (!line) continue;

        const event = JSON.parse(line) as Record<string, unknown>;
        if (event["type"] === "header") {
          columns = (event["columns"] as string[]) ?? [];
        } else if (event["type"] === "row") {
          const values = event["values"] as HydraTaggedValue[];
          yield decodeRow(columns, values);
        } else if (event["type"] === "error") {
          throw new Error(`HydraDB NDJSON stream error: ${JSON.stringify(event)}`);
        } else if (event["type"] === "summary") {
          sawSummary = true;
        }
      }
    }

    // A connection cut mid-frame must not look identical to a clean end of
    // stream: either there's an unterminated trailing line, or the server
    // never sent the closing "summary" event at all.
    buffer += decoder.decode();
    if (buffer.trim().length > 0 || !sawSummary) {
      throw new Error(
        "HydraDB NDJSON stream ended mid-frame (no trailing summary event) -- " +
          "treat this as a failed query, not an empty result.",
      );
    }
  } finally {
    reader.releaseLock();
  }
}
