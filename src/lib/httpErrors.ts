import type { Response } from "express";

/**
 * Logs the real error server-side (the only place it would otherwise be
 * recorded at all -- there's no logger elsewhere in this codebase) and
 * sends a generic, sanitized response to the client instead of relaying
 * HydraDB's raw error text, which can include internal query fragments and
 * status detail. If the response has already started streaming (NDJSON),
 * `res.status()`/`res.json()` would throw `ERR_HTTP_HEADERS_SENT`, so this
 * writes a trailing NDJSON error frame and ends the stream instead.
 */
export function respondToUpstreamFailure(
  res: Response,
  context: string,
  error: unknown,
): void {
  console.error(`[${context}]`, error);

  if (res.headersSent) {
    res.write(
      JSON.stringify({
        type: "error",
        error: "hydradb_query_failed",
        message: "Upstream query failed mid-stream; see server logs.",
      }) + "\n",
    );
    res.end();
    return;
  }

  res.status(502).json({
    error: "hydradb_query_failed",
    message: "Upstream query failed; see server logs.",
  });
}
