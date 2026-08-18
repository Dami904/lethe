import { query } from "../db/hydraClient.js";
import { cosineSimilarity, embed } from "./embeddings.js";

export interface BaselineMatch {
  fact_id: string;
  entity: string;
  content: string;
  written_at: string;
  score: number;
}

export interface BaselineResult {
  query: string;
  matches: BaselineMatch[];
  ambiguous: boolean;
}

/**
 * The naive vector-memory baseline: embeds every stored fact string (no
 * supersession filtering, no time awareness at all -- it reads every Fact
 * node that has ever been written) and ranks by cosine similarity to the
 * query. This is what mem0/Zep-style similarity search does, and it is
 * exactly why it can't tell a fresh fact from a contradicted one: both
 * versions of an updated fact usually share most of their words.
 */
export async function baselineRecall(
  userQuery: string,
  topK = 2,
): Promise<BaselineResult> {
  const result = await query(
    `MATCH (f:Fact)-[:ABOUT]->(e:Entity)
     RETURN f.id AS id, e.name AS entity, f.content AS content, f.written_at AS written_at`,
  );

  const queryVector = embed(userQuery);
  const scored = result.rows.map((row) => {
    const content = String(row["content"]);
    return {
      fact_id: String(row["id"]),
      entity: String(row["entity"]),
      content,
      written_at: String(row["written_at"]),
      score: cosineSimilarity(queryVector, embed(content)),
    };
  });

  scored.sort((a, b) => b.score - a.score);
  const matches = scored.slice(0, topK);
  const ambiguous =
    matches.length >= 2 && (matches[0]?.score ?? 0) - (matches[1]?.score ?? 0) < 0.08;

  return { query: userQuery, matches, ambiguous };
}
