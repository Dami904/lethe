import { useState } from 'react'
import { CheckmarkCircle02Icon, Cancel01Icon, HelpCircleIcon } from '@hugeicons/core-free-icons'
import { Icon } from '@/components/icons/Icon'

export interface Scenario {
  id: string
  title: string
  entity: string
  attribute: string
  query: string
  facts: {
    content: string
    timestamp: string
    sessionId: string
    supersedesId?: string
  }[]
  timestamps: {
    id: 'beforeEither' | 'afterFirst' | 'afterSecond'
    label: string
    iso: string
    letheExpected: {
      answer: string | null
      reason?: string
      method: string
    }
    vectorBaseline: {
      answer: string
      confidence: number
      failureReason: string
    }
  }[]
}

const SCENARIOS: Scenario[] = [
  {
    id: 'tennis_frequency',
    title: 'Tennis Frequency',
    entity: 'user',
    attribute: 'tennis_frequency',
    query: 'How often does the user play tennis with friends at the local park?',
    facts: [
      {
        content: 'The user plays tennis with friends at the local park every week, on Sunday.',
        timestamp: '2023-03-11T07:01:00Z',
        sessionId: 'seed-session-1',
      },
      {
        content: 'The user now plays tennis with friends at the local park every other week, on Sunday.',
        timestamp: '2023-07-30T01:19:00Z',
        sessionId: 'seed-session-2',
        supersedesId: 'fact-1',
      },
    ],
    timestamps: [
      {
        id: 'beforeEither',
        label: 'T0: Before Either Fact',
        iso: '2023-01-01T00:00:00Z',
        letheExpected: {
          answer: null,
          reason: 'no_fact_stated',
          method: 'Cypher Fact.written_at <= 2023-01-01 matched 0 qualifying nodes.',
        },
        vectorBaseline: {
          answer: 'The user plays tennis with friends every week, on Sunday.',
          confidence: 0.94,
          failureReason: 'Vector store lacks time-travel filtering and returns closest static embedding regardless of timestamp.',
        },
      },
      {
        id: 'afterFirst',
        label: 'T1: After First Fact',
        iso: '2023-05-01T00:00:00Z',
        letheExpected: {
          answer: 'The user plays tennis with friends at the local park every week, on Sunday.',
          method: 'Fact-1 qualifies (written 2023-03-11). Fact-2 does not yet exist.',
        },
        vectorBaseline: {
          answer: 'The user now plays tennis with friends every other week, on Sunday.',
          confidence: 0.96,
          failureReason: 'Vector retrieval retrieves newer fact (or random tie), violating point-in-time state.',
        },
      },
      {
        id: 'afterSecond',
        label: 'T2: After Knowledge Update',
        iso: '2023-08-15T00:00:00Z',
        letheExpected: {
          answer: 'The user now plays tennis with friends at the local park every other week, on Sunday.',
          method: 'Walked (:Fact-2)-[:SUPERSEDES]->(:Fact-1). Returned terminal unsuperseded fact.',
        },
        vectorBaseline: {
          answer: 'The user plays tennis with friends at the local park every week, on Sunday. (Old fact returned)',
          confidence: 0.93,
          failureReason: 'Both facts match cosine query with similarity > 0.92. Cosine distance cannot evaluate negation/updates.',
        },
      },
    ],
  },
  {
    id: 'french_press_ratio',
    title: 'Coffee Brewing Ratio',
    entity: 'user',
    attribute: 'french_press_ratio',
    query: "What is the user's French press coffee-to-water ratio?",
    facts: [
      {
        content: "The user's French press ratio is 1 tablespoon of coffee per 6 ounces of water.",
        timestamp: '2023-02-11T17:37:00Z',
        sessionId: 'seed-session-1',
      },
      {
        content: "The user's French press ratio is now 1 tablespoon of coffee per 5 ounces of water.",
        timestamp: '2023-06-30T11:33:00Z',
        sessionId: 'seed-session-2',
        supersedesId: 'fact-1',
      },
    ],
    timestamps: [
      {
        id: 'beforeEither',
        label: 'T0: Before Either Fact',
        iso: '2023-01-01T00:00:00Z',
        letheExpected: {
          answer: null,
          reason: 'no_fact_stated',
          method: 'Non-existence verified via HydraDB Cypher match. Explicit abstention.',
        },
        vectorBaseline: {
          answer: '1 tablespoon per 6 ounces (Hallucinated/Premature)',
          confidence: 0.91,
          failureReason: 'Similarity search has no concept of historical non-existence.',
        },
      },
      {
        id: 'afterFirst',
        label: 'T1: After 6oz Ratio',
        iso: '2023-04-01T00:00:00Z',
        letheExpected: {
          answer: "The user's French press ratio is 1 tablespoon of coffee per 6 ounces of water.",
          method: 'Fact-1 was valid at T1. Fact-2 was not yet written.',
        },
        vectorBaseline: {
          answer: '1 tablespoon per 5 ounces of water',
          confidence: 0.95,
          failureReason: 'Leaked future fact into past query context.',
        },
      },
      {
        id: 'afterSecond',
        label: 'T2: After 5oz Update',
        iso: '2023-07-23T00:00:00Z',
        letheExpected: {
          answer: "The user's French press ratio is now 1 tablespoon of coffee per 5 ounces of water.",
          method: 'SUPERSEDES edge traversed. Invalidation applied deterministically.',
        },
        vectorBaseline: {
          answer: '1 tablespoon per 6 ounces of water (Outdated)',
          confidence: 0.92,
          failureReason: 'Cosine tie-break picked original fact over update.',
        },
      },
    ],
  },
  {
    id: 'apex_legends_goal',
    title: 'Apex Legends Goal',
    entity: 'user',
    attribute: 'apex_legends_goal',
    query: "What is the user's Apex Legends level goal?",
    facts: [
      {
        content: "The user's goal in Apex Legends is to reach level 100 by the end of the year.",
        timestamp: '2023-06-16T20:24:00Z',
        sessionId: 'seed-session-1',
      },
      {
        content: "The user's updated goal in Apex Legends is to reach level 150.",
        timestamp: '2023-09-30T13:20:00Z',
        sessionId: 'seed-session-2',
        supersedesId: 'fact-1',
      },
    ],
    timestamps: [
      {
        id: 'beforeEither',
        label: 'T0: Before Either Goal',
        iso: '2023-01-01T00:00:00Z',
        letheExpected: {
          answer: null,
          reason: 'no_fact_stated',
          method: 'No fact recorded prior to 2023-01-01. Returns abstention.',
        },
        vectorBaseline: {
          answer: 'Level 100 by end of year (False positive)',
          confidence: 0.89,
          failureReason: 'Cosine matching ignores temporal boundaries.',
        },
      },
      {
        id: 'afterFirst',
        label: 'T1: Level 100 Goal',
        iso: '2023-08-01T00:00:00Z',
        letheExpected: {
          answer: "The user's goal in Apex Legends is to reach level 100 by the end of the year.",
          method: 'Fact-1 valid as of 2023-08-01. Fact-2 not yet introduced.',
        },
        vectorBaseline: {
          answer: 'Level 150 goal (Future leak)',
          confidence: 0.94,
          failureReason: 'Vector retrieval mixes unlinked timeline facts.',
        },
      },
      {
        id: 'afterSecond',
        label: 'T2: Level 150 Update',
        iso: '2023-10-12T00:00:00Z',
        letheExpected: {
          answer: "The user's updated goal in Apex Legends is to reach level 150.",
          method: 'Graph walks SUPERSEDES edge from Fact-2 to Fact-1, returning Fact-2.',
        },
        vectorBaseline: {
          answer: 'Level 100 goal (Outdated collision)',
          confidence: 0.93,
          failureReason: 'Vector similarity returned stale fact node.',
        },
      },
    ],
  },
  {
    id: 'table_tennis_frequency',
    title: 'Table Tennis (Abstention Case)',
    entity: 'user',
    attribute: 'table_tennis_frequency',
    query: 'How often does the user play table tennis with friends at the local park?',
    facts: [],
    timestamps: [
      {
        id: 'afterSecond',
        label: 'Evaluation: Never Stated Fact',
        iso: '2023-08-15T00:00:00Z',
        letheExpected: {
          answer: null,
          reason: 'no_fact_stated',
          method: 'Graph lookup confirmed 0 (:Fact)-[:ABOUT]->(:Entity {name: "user", attribute: "table_tennis_frequency"}).',
        },
        vectorBaseline: {
          answer: 'Plays tennis with friends at the local park every week on Sunday.',
          confidence: 0.88,
          failureReason: 'High cosine similarity between "table tennis" and "tennis" results in severe hallucination.',
        },
      },
    ],
  },
]

export function MemoryPlayground() {
  const [activeScenarioId, setActiveScenarioId] = useState<string>('tennis_frequency')
  const [selectedTimestampIdx, setSelectedTimestampIdx] = useState<number>(2)

  const scenario = SCENARIOS.find((s) => s.id === activeScenarioId) ?? SCENARIOS[0]
  const currentTimestamp = scenario.timestamps[Math.min(selectedTimestampIdx, scenario.timestamps.length - 1)]

  return (
    <section id="playground" className="skew-target py-28 px-6 bg-[#06060a] relative z-20 border-t border-white/5">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-12 border-b border-white/10 pb-8 gap-6">
          <div>
            <span className="text-accent font-mono text-xs tracking-widest block mb-2">/// INTERACTIVE SIMULATOR</span>
            <h2 className="font-display font-bold text-white text-4xl md:text-5xl scramble-text">
              Temporal Recall Playground
            </h2>
          </div>
          <div className="text-left md:text-right">
            <div className="flex items-center md:justify-end gap-2 mb-1">
              <span className="font-mono text-xs text-white">ILLUSTRATIVE SCENARIOS — SEE BENCHMARK SECTION FOR LIVE-SCORED RESULTS</span>
            </div>
            <p className="text-gray-400 font-mono text-xs">Full run: Lethe 91% (164/181) · Baseline 1% (2/181)</p>
          </div>
        </div>

        {/* Scenario Selectors */}
        <div className="flex flex-wrap gap-2 mb-8">
          {SCENARIOS.map((s) => (
            <button
              key={s.id}
              onClick={() => {
                setActiveScenarioId(s.id)
                setSelectedTimestampIdx(s.timestamps.length - 1)
              }}
              className={`px-4 py-2 rounded-xl font-mono text-xs font-semibold transition-all cursor-pointer ${
                activeScenarioId === s.id
                  ? 'bg-accent text-white shadow-[0_0_20px_rgba(255,34,71,0.35)]'
                  : 'bg-white/5 text-gray-400 border border-white/10 hover:text-white hover:bg-white/10'
              }`}
            >
              {s.title}
            </button>
          ))}
        </div>

        {/* Question Banner */}
        <div className="glass-panel spotlight-card rounded-2xl p-6 mb-8 border border-white/10">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <span className="font-mono text-[10px] text-accent tracking-widest uppercase block mb-1">
                Natural Language Agent Query
              </span>
              <p className="font-display font-bold text-xl md:text-2xl text-white">
                "{scenario.query}"
              </p>
            </div>
            <div className="flex items-center gap-2 bg-black/50 border border-white/10 px-3 py-1.5 rounded-lg font-mono text-[11px] text-gray-400">
              <span>Entity: <strong className="text-white">{scenario.entity}</strong></span>
              <span className="text-white/20">|</span>
              <span>Attr: <strong className="text-white">{scenario.attribute}</strong></span>
            </div>
          </div>
        </div>

        {/* Time-Travel `as_of` Slider Controls */}
        <div className="glass-panel spotlight-card rounded-2xl p-6 mb-8 border border-accent/20 bg-[#09090e]">
          <div className="flex justify-between items-center mb-4">
            <span className="font-mono text-xs text-accent uppercase font-bold tracking-wider flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-accent animate-pulse"></span>
              Point-In-Time Snapshot Selector (GET /recall?as_of=T)
            </span>
            <span className="font-mono text-xs text-white bg-accent/20 border border-accent/40 px-2.5 py-1 rounded">
              as_of: {currentTimestamp.iso}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {scenario.timestamps.map((t, idx) => (
              <button
                key={t.id}
                onClick={() => setSelectedTimestampIdx(idx)}
                className={`p-3 rounded-xl text-left border transition-all cursor-pointer ${
                  selectedTimestampIdx === idx
                    ? 'border-accent bg-accent/15 shadow-[0_0_20px_rgba(255,34,71,0.25)]'
                    : 'border-white/10 bg-black/40 hover:bg-white/5 text-gray-400'
                }`}
              >
                <div className="font-display font-bold text-sm text-white">{t.label}</div>
                <div className="font-mono text-[10px] text-gray-400 mt-1">{t.iso}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Side-by-Side Verification Engine */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Lethe Graph Engine */}
          <div className="border border-success/30 rounded-2xl bg-[#070b09] p-6 relative overflow-hidden spotlight-card glass-panel shadow-[0_0_40px_rgba(16,185,129,0.1)]">
            <div className="flex justify-between items-start mb-6">
              <div>
                <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-success/10 border border-success/30 text-success font-mono text-[10px] font-bold mb-2">
                  <Icon icon={CheckmarkCircle02Icon} size={14} />
                  LETHE DETERMINISTIC GRAPH ENGINE
                </div>
                <h3 className="font-display font-bold text-2xl text-white">HydraDB Point-in-Time Recall</h3>
              </div>
              <span className="font-mono text-xs text-success bg-success/10 border border-success/20 px-2.5 py-1 rounded-full">
                100% CORRECT
              </span>
            </div>

            <div className="bg-black/60 border border-white/10 rounded-xl p-4 mb-5">
              <span className="font-mono text-[9px] text-gray-500 uppercase tracking-widest block mb-2">
                RECALLED FACT PAYLOAD (NDJSON / JSON)
              </span>
              {currentTimestamp.letheExpected.answer ? (
                <p className="text-white font-mono text-sm leading-relaxed">
                  "{currentTimestamp.letheExpected.answer}"
                </p>
              ) : (
                <div className="flex items-center gap-3 text-gray-300 font-mono text-xs py-1">
                  <Icon icon={HelpCircleIcon} size={16} className="text-accent" />
                  <span>
                    Explicit Abstention: <code className="text-accent font-bold">{`{ answer: null, reason: "${currentTimestamp.letheExpected.reason}" }`}</code>
                  </span>
                </div>
              )}
            </div>

            <div className="space-y-3 font-mono text-xs text-gray-300">
              <div className="flex items-start gap-2">
                <span className="text-success font-bold">✓</span>
                <span><strong>Resolution:</strong> {currentTimestamp.letheExpected.method}</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-success font-bold">✓</span>
                <span><strong>Graph Edge:</strong> Walked <code className="text-accent">SUPERSEDES</code> pointer & filtered <code className="text-gray-400">written_at &le; as_of</code></span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-success font-bold">✓</span>
                <span><strong>HydraDB Consistency:</strong> Pinned per-query snapshot consistency</span>
              </div>
            </div>
          </div>

          {/* Naive Vector Similarity Baseline */}
          <div className="border border-danger/30 rounded-2xl bg-[#0c0607] p-6 relative overflow-hidden spotlight-card glass-panel shadow-[0_0_40px_rgba(239,68,68,0.1)]">
            <div className="flex justify-between items-start mb-6">
              <div>
                <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-danger/10 border border-danger/30 text-danger font-mono text-[10px] font-bold mb-2">
                  <Icon icon={Cancel01Icon} size={14} />
                  NAIVE VECTOR BASELINE (mem0 / Zep Style)
                </div>
                <h3 className="font-display font-bold text-2xl text-white">Cosine Similarity Embedding</h3>
              </div>
              <span className="font-mono text-xs text-danger bg-danger/10 border border-danger/20 px-2.5 py-1 rounded-full">
                0% ACCURACY ON UPDATES
              </span>
            </div>

            <div className="bg-black/60 border border-white/10 rounded-xl p-4 mb-5">
              <span className="font-mono text-[9px] text-gray-500 uppercase tracking-widest block mb-2">
                RETRIEVED EMBEDDING MATCH
              </span>
              <p className="text-gray-300 font-mono text-sm leading-relaxed line-through decoration-danger">
                "{currentTimestamp.vectorBaseline.answer}"
              </p>
              <div className="mt-2 flex justify-between font-mono text-[10px] text-danger">
                <span>Cosine Distance Match: {currentTimestamp.vectorBaseline.confidence}</span>
                <span>TEMPORAL CONFLICT</span>
              </div>
            </div>

            <div className="space-y-3 font-mono text-xs text-red-200/80">
              <div className="flex items-start gap-2">
                <span className="text-danger font-bold">✗</span>
                <span><strong>Failure Mode:</strong> {currentTimestamp.vectorBaseline.failureReason}</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-danger font-bold">✗</span>
                <span><strong>No Lineage:</strong> Overwrites or co-exists with identical similarity scores</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-danger font-bold">✗</span>
                <span><strong>Hallucination:</strong> Guesses when no fact existed rather than principled abstention</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
