/**
 * The handful of LongMemEval-derived contradiction cases used for the demo
 * comparison (frontend dropdown + `scripts/run-baseline-comparison.ts`).
 * Sourced from `data/longmemeval/subset.json` (question_ids noted below);
 * facts are hand-extracted from the evidence turns since LongMemEval ships
 * full multi-turn transcripts, not pre-extracted entity/attribute/content
 * triples. See scripts/seed.ts.
 */
export interface DemoScenario {
  id: string;
  sourceQuestionId: string;
  entity: string;
  attribute: string;
  naturalLanguageQuery: string;
  /** Timestamps a judge can pick from the frontend's as-of control. */
  timestamps: {
    beforeEither: string;
    afterFirst: string;
    afterSecond: string;
  };
}

export const demoScenarios: DemoScenario[] = [
  {
    id: "tennis_frequency",
    sourceQuestionId: "f685340e",
    entity: "user",
    attribute: "tennis_frequency",
    naturalLanguageQuery:
      "How often does the user play tennis with friends at the local park?",
    timestamps: {
      beforeEither: "2023-01-01T00:00:00.000Z",
      afterFirst: "2023-05-01T00:00:00.000Z",
      afterSecond: "2023-08-15T00:00:00.000Z",
    },
  },
  {
    id: "french_press_ratio",
    sourceQuestionId: "6071bd76",
    entity: "user",
    attribute: "french_press_ratio",
    naturalLanguageQuery: "What is the user's French press coffee-to-water ratio?",
    timestamps: {
      beforeEither: "2023-01-01T00:00:00.000Z",
      afterFirst: "2023-04-01T00:00:00.000Z",
      afterSecond: "2023-07-23T00:00:00.000Z",
    },
  },
  {
    id: "apex_legends_goal",
    sourceQuestionId: "9bbe84a2",
    entity: "user",
    attribute: "apex_legends_goal",
    naturalLanguageQuery: "What is the user's Apex Legends level goal?",
    timestamps: {
      beforeEither: "2023-01-01T00:00:00.000Z",
      afterFirst: "2023-08-01T00:00:00.000Z",
      afterSecond: "2023-10-12T00:00:00.000Z",
    },
  },
];

/** The abstention case: paired with tennis_frequency, never actually stated. */
export const abstentionScenario = {
  id: "table_tennis_frequency",
  sourceQuestionId: "f685340e_abs",
  entity: "user",
  attribute: "table_tennis_frequency",
  naturalLanguageQuery:
    "How often does the user play table tennis with friends at the local park?",
  asOf: "2023-08-15T00:00:00.000Z",
};

/**
 * The cross-entity connect scenario: exercises `GET /connect` (algo.SPpaths)
 * through the shipped demo instead of only against synthetic data in tests.
 * A vector-similarity baseline has no relationship-traversal concept at
 * all -- there's no "recall query" to run against it for this, which is
 * itself worth showing, not just an endpoint we skip comparing.
 */
export const connectScenario = {
  id: "user_priya_connection",
  from: "user",
  to: "Priya",
  naturalLanguageQuery: "How is the user connected to Priya?",
};
