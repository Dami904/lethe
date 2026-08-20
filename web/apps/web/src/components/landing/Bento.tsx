import { Layers01Icon, LockIcon, Activity01Icon, Database02Icon, HelpCircleIcon, Share08Icon } from '@hugeicons/core-free-icons'
import { Icon } from '@/components/icons/Icon'

export function Bento() {
  return (
    <section id="guarantees" className="skew-target py-24 md:py-32 px-6 relative z-20">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-16 border-b border-white/10 pb-8 gap-6 md:gap-0">
          <div>
            <span className="text-accent font-mono text-xs tracking-widest block mb-2">/// THE GUARANTEES</span>
            <h2 className="font-display font-bold text-white text-4xl md:text-5xl scramble-text">HydraDB Engine Proof</h2>
          </div>
          <div className="text-left md:text-right w-full md:w-auto">
            <div className="flex items-center md:justify-end gap-2 mb-1">
              <span className="w-2 h-2 bg-success rounded-full animate-blink"></span>
              <span className="font-mono text-xs text-white">HydraDB HTTP Query Engine</span>
            </div>
            <p className="text-gray-400 font-mono text-xs uppercase tracking-widest">Single-Hop Cypher Mutations</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 md:grid-rows-3 gap-6 h-auto md:h-[900px]">
          {/* Card 1: Explicit SUPERSEDES Graph (2x2 Large Card) */}
          <div className="md:col-span-2 md:row-span-2 min-h-[300px] glass-panel spotlight-card rounded-2xl overflow-hidden relative group">
            <div className="scan-line"></div>
            <img
              src="/lethe-hydradb-core.jpg"
              className="absolute inset-0 w-full h-full object-cover opacity-50 mix-blend-luminosity group-hover:scale-105 transition-transform duration-700"
              alt="HydraDB Core Processing"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent"></div>
            <div className="absolute top-6 right-6 border border-accent/40 bg-black/60 px-3 py-1 rounded text-[10px] font-mono text-accent">
              EDGE_TOPOLOGY: SUPERSEDES
            </div>
            <div className="absolute bottom-0 left-0 p-8 z-10 w-full">
              <div className="w-10 h-10 bg-accent flex items-center justify-center mb-4 text-white font-bold rounded-xl shadow-[0_0_20px_rgba(255,34,71,0.5)]">
                <Icon icon={Layers01Icon} size={24} strokeWidth={2} />
              </div>
              <h3 className="font-display font-bold text-2xl text-white mb-2">Immutable Facts, Explicit Invalidation</h3>
              <p className="text-gray-300 text-sm max-w-lg leading-relaxed">
                When a new fact contradicts an existing one about the same entity & attribute, Lethe writes a directed <code className="text-accent bg-accent/10 px-1 py-0.5 rounded font-mono">SUPERSEDES</code> edge. Facts are never blindly overwritten or diluted in an embedding space.
              </p>
            </div>
          </div>

          {/* Card 2: LongMemEval Accuracy Counter */}
          <div className="md:col-span-1 md:row-span-1 glass-panel spotlight-card rounded-2xl p-6 flex flex-col justify-between h-40 md:h-auto border-success/20">
            <div className="flex justify-between items-start">
              <span className="font-mono text-[10px] text-gray-400 uppercase">LongMemEval Updates</span>
              <div className="w-2 h-2 rounded-full bg-success animate-pulse"></div>
            </div>
            <div className="text-center py-2">
              <div className="text-4xl font-display font-bold text-white">
                <span className="counter" data-target="91">91</span>%
              </div>
              <div className="text-[10px] text-success font-mono mt-1">164/181 Auto-Extracted Pairs</div>
            </div>
            <div className="text-[9px] text-gray-400 font-mono">Naive Vector Baseline: 1%</div>
          </div>

          {/* Card 3: Deterministic FNV-1a Hash Lineage */}
          <div className="md:col-span-1 md:row-span-1 glass-panel spotlight-card rounded-2xl p-6 flex flex-col justify-between overflow-hidden h-40 md:h-auto">
            <div className="flex items-center gap-2 text-white mb-2">
              <Icon icon={LockIcon} size={14} strokeWidth={2} className="text-accent" />
              <span className="font-display font-bold text-sm">Deterministic Ids</span>
            </div>
            <div className="relative h-12 overflow-hidden font-mono text-[9px] text-gray-500 leading-relaxed">
              <div className="animate-[marquee_5s_linear_infinite_reverse] flex flex-col">
                <span>fnv1a(entity:user:tennis) &rarr; 0x7f8d9a2b</span>
                <span>fnv1a(session:seed-1) &rarr; 0x1a2b3c4d</span>
                <span>fnv1a(fact:6071bd76) &rarr; 0x9c8d7e6f</span>
                <span>fnv1a(edge:supersedes) &rarr; 0x1f2e3d4c</span>
              </div>
            </div>
            <div className="text-[10px] text-accent mt-2 flex items-center gap-1 font-mono">
              <span className="w-1 h-1 bg-accent rounded-full"></span> 32-BIT INTEGER ADDRESSING
            </div>
          </div>

          {/* Card 4: Native HydraDB Graph Algorithms */}
          <div className="md:col-span-1 md:row-span-1 glass-panel spotlight-card rounded-2xl p-6 flex flex-col justify-between h-40 md:h-auto">
            <div className="flex justify-between items-center mb-2">
              <span className="font-mono text-[10px] text-gray-400 uppercase">HydraDB Procs</span>
              <Icon icon={Share08Icon} size={14} strokeWidth={2} className="text-accent" />
            </div>
            <div className="font-mono text-xs text-white space-y-1">
              <div className="text-accent font-bold">&gt; algo.SPpaths</div>
              <div className="text-gray-400 text-[10px]">Cross-entity shortest path</div>
              <div className="text-accent font-bold mt-2">&gt; algo.SSpaths</div>
              <div className="text-gray-400 text-[10px]">Supersession chain walking</div>
            </div>
            <div className="text-right text-[10px] text-white font-mono mt-2">NATIVE BOUNDED BFS</div>
          </div>

          {/* Card 5: Principled Non-Existence Abstention */}
          <div className="md:col-span-1 md:row-span-1 glass-panel spotlight-card rounded-2xl p-6 relative overflow-hidden group h-40 md:h-auto border-accent/20">
            <div className="absolute inset-0 bg-red-950/20 z-0"></div>
            <div className="relative z-10 flex flex-col h-full justify-between">
              <div className="flex justify-between items-start">
                <span className="font-display font-bold text-sm text-white">Zero Guessing</span>
                <Icon icon={HelpCircleIcon} size={16} className="text-accent animate-pulse-fast" />
              </div>
              <div className="font-mono text-[10px] text-red-200/80">
                <div>&gt; MATCH (:Fact)-[:ABOUT]-&gt;(X)</div>
                <div>&gt; 0 QUALIFYING NODES</div>
                <div className="text-accent font-bold">&gt; ABSTAIN: no_fact_stated</div>
              </div>
            </div>
          </div>

          {/* Card 6: Pinned Snapshot Consistency */}
          <div className="md:col-span-2 md:row-span-1 glass-panel spotlight-card rounded-2xl p-8 flex flex-col sm:flex-row items-start sm:items-center justify-between h-auto">
            <div className="mb-4 sm:mb-0 max-w-sm">
              <div className="flex items-center gap-2 mb-2">
                <Icon icon={Database02Icon} size={18} className="text-accent" />
                <h3 className="font-display font-bold text-xl text-white">Pinned Snapshot Consistency</h3>
              </div>
              <p className="text-gray-300 text-xs font-mono">Every /recall query runs against an isolated snapshot, eliminating torn reads during concurrent writes.</p>
            </div>
            <div className="flex flex-col gap-1.5 w-full sm:w-44 bg-black/60 p-3 rounded-xl border border-white/10">
              <div className="flex justify-between text-[9px] text-gray-400 font-mono">
                <span>ISOLATION</span>
                <span className="text-success font-bold">SNAPSHOT</span>
              </div>
              <div className="flex justify-between text-[9px] text-gray-400 font-mono">
                <span>CONCURRENT WRITES</span>
                <span className="text-success font-bold">RACE-SAFE</span>
              </div>
            </div>
          </div>

          {/* Card 7: NDJSON Live Streaming */}
          <div className="md:col-span-2 md:row-span-1 glass-panel spotlight-card rounded-2xl p-6 relative overflow-hidden flex flex-col justify-between min-h-[200px]">
            <div className="flex justify-between items-center z-10">
              <div className="flex items-center gap-2">
                <Icon icon={Activity01Icon} size={16} className="text-accent" />
                <span className="font-display font-bold text-white text-lg">NDJSON Stream Transport</span>
              </div>
              <span className="text-accent text-xs font-mono border border-accent/30 bg-accent/10 px-2.5 py-0.5 rounded-full">
                Accept: application/x-ndjson
              </span>
            </div>
            <div className="bg-black/70 rounded-xl p-3 border border-white/10 font-mono text-[11px] text-gray-300 z-10">
              <div className="text-gray-500">// Direct pipe into agent evaluation loop:</div>
              <div><span className="text-accent">{`{"id": 48192, "entity": "user", "attribute": "tennis_frequency",`}</span></div>
              <div><span className="text-accent">{` "content": "Plays every other week, Sunday", "valid": true}`}</span></div>
            </div>
            <div className="text-right text-[10px] text-gray-400 font-mono z-10">
              Sub-millisecond memory resolution
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
