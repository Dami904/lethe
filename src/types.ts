export interface IngestFactRequest {
  session_id: string;
  entity: string;
  attribute: string;
  content: string;
  timestamp: string; // ISO 8601
  idempotency_key?: string;
}

export interface Fact {
  id: string;
  entity: string;
  attribute: string;
  content: string;
  written_at: string;
  session_id: string;
}

export interface IngestFactResponse {
  fact: Fact;
  /** Set when `fact` supersedes an earlier fact (the common case). */
  superseded_fact_id: string | null;
  /**
   * Set when `fact` itself was immediately superseded on arrival -- a
   * backfill/correction written with an earlier timestamp than the
   * already-current fact for this entity+attribute.
   */
  superseded_by_fact_id: string | null;
  deduped: boolean;
}

export interface RecallResult {
  answer: string | null;
  fact: Fact | null;
  reason?: "no_fact_stated";
}

export interface ConnectResult {
  from: string;
  to: string;
  found: boolean;
  path: Array<{ label: string; id: string; content?: string }>;
}
