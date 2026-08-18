/**
 * The demo's seed facts, hand-extracted from real LongMemEval evidence turns
 * (see data/longmemeval/subset.json and docs/API_NOTES.md for why hand
 * extraction was necessary). Shared between scripts/seed.ts (writes them
 * into Lethe) and scripts/run-baseline-comparison.ts (needs to know the
 * "currently correct" content to score both systems against).
 */
export interface SeedFact {
  session_id: string;
  entity: string;
  attribute: string;
  content: string;
  timestamp: string;
}

const sessionEarly = "seed-session-1";
const sessionLate = "seed-session-2";

export const seedFacts: SeedFact[] = [
  // tennis_frequency (question_id f685340e): weekly -> every other week
  {
    session_id: sessionEarly,
    entity: "user",
    attribute: "tennis_frequency",
    content:
      "The user plays tennis with friends at the local park every week, on Sunday.",
    timestamp: "2023-03-11T07:01:00.000Z",
  },
  {
    session_id: sessionLate,
    entity: "user",
    attribute: "tennis_frequency",
    content:
      "The user now plays tennis with friends at the local park every other week, on Sunday.",
    timestamp: "2023-07-30T01:19:00.000Z",
  },

  // french_press_ratio (question_id 6071bd76): 6oz/tbsp -> 5oz/tbsp
  {
    session_id: sessionEarly,
    entity: "user",
    attribute: "french_press_ratio",
    content:
      "The user's French press ratio is 1 tablespoon of coffee per 6 ounces of water.",
    timestamp: "2023-02-11T17:37:00.000Z",
  },
  {
    session_id: sessionLate,
    entity: "user",
    attribute: "french_press_ratio",
    content:
      "The user's French press ratio is now 1 tablespoon of coffee per 5 ounces of water (less water than before).",
    timestamp: "2023-06-30T11:33:00.000Z",
  },

  // apex_legends_goal (question_id 9bbe84a2): level 100 -> level 150
  {
    session_id: sessionEarly,
    entity: "user",
    attribute: "apex_legends_goal",
    content: "The user's goal in Apex Legends is to reach level 100 by the end of the year.",
    timestamp: "2023-06-16T20:24:00.000Z",
  },
  {
    session_id: sessionLate,
    entity: "user",
    attribute: "apex_legends_goal",
    content: "The user's updated goal in Apex Legends is to reach level 150.",
    timestamp: "2023-09-30T13:20:00.000Z",
  },

  // A same-content restatement in a later session, to exercise the "no
  // spurious supersession on identical content" path.
  {
    session_id: sessionLate,
    entity: "user",
    attribute: "tennis_frequency",
    content:
      "The user now plays tennis with friends at the local park every other week, on Sunday.",
    timestamp: "2023-08-01T00:00:00.000Z",
  },
  // Deliberately NOT seeding table_tennis_frequency for any timestamp -- the
  // abstention scenario in src/demoScenarios.ts relies on it never existing.
];

/** The currently-correct (most recent) content for each entity+attribute pair. */
export function currentContentFor(entity: string, attribute: string): string | null {
  const matches = seedFacts.filter((f) => f.entity === entity && f.attribute === attribute);
  if (matches.length === 0) return null;
  return matches.reduce((latest, f) => (f.timestamp > latest.timestamp ? f : latest)).content;
}
