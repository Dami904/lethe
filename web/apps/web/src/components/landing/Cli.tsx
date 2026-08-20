export function Cli() {
  return (
    <section id="cli" className="skew-target py-24 bg-[#040406] border-t border-white/5 relative z-20">
      <div className="max-w-6xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
        <div className="order-2 lg:order-1">
          <span className="text-accent font-mono text-xs tracking-widest block mb-4">/// REPRODUCIBLE BENCHMARK</span>
          <h2 className="font-display font-bold text-4xl md:text-5xl mb-6 text-white scramble-text">
            Run the Invariant Locally
          </h2>
          <p className="text-gray-400 text-lg mb-8 leading-relaxed font-light">
            Every benchmark and point-in-time traversal is fully reproducible against a local HydraDB instance. Zero proprietary cloud lock-in.
          </p>

          <div className="space-y-6 font-mono">
            <div className="group flex gap-4 p-4 border border-white/5 hover:border-accent/40 bg-white/[0.02] hover:bg-accent/5 rounded-xl transition-all cursor-pointer">
              <div className="text-gray-500 group-hover:text-accent font-bold text-sm">01</div>
              <div>
                <h4 className="font-bold text-white text-sm font-display">pnpm baseline:eval</h4>
                <p className="text-xs text-gray-400 font-sans mt-1">Scores Lethe's graph supersession against a naive cosine similarity store on LongMemEval transcripts.</p>
              </div>
            </div>

            <div className="group flex gap-4 p-4 border border-white/5 hover:border-accent/40 bg-white/[0.02] hover:bg-accent/5 rounded-xl transition-all cursor-pointer">
              <div className="text-gray-500 group-hover:text-accent font-bold text-sm">02</div>
              <div>
                <h4 className="font-bold text-white text-sm font-display">GET /connect?from=A&to=B</h4>
                <p className="text-xs text-gray-400 font-sans mt-1">Executes HydraDB's native <code className="text-accent">algo.SPpaths</code> for cross-entity graph relationship traversal without client-side BFS.</p>
              </div>
            </div>

            <div className="group flex gap-4 p-4 border border-white/5 hover:border-accent/40 bg-white/[0.02] hover:bg-accent/5 rounded-xl transition-all cursor-pointer">
              <div className="text-gray-500 group-hover:text-accent font-bold text-sm">03</div>
              <div>
                <h4 className="font-bold text-white text-sm font-display">pnpm test</h4>
                <p className="text-xs text-gray-400 font-sans mt-1">Runs Vitest suites asserting point-in-time correctness guards, FNV-1a deterministic hashing, and abstention invariants.</p>
              </div>
            </div>
          </div>
        </div>

        <div className="relative group order-1 lg:order-2">
          <div className="absolute -inset-1 bg-gradient-to-r from-accent to-red-900 rounded-2xl blur-xl opacity-20 group-hover:opacity-40 transition duration-1000"></div>
          <div className="relative bg-[#07070b] border border-white/10 rounded-2xl p-6 font-mono text-xs sm:text-sm shadow-2xl overflow-x-auto min-h-[360px]">
            <div className="flex justify-between items-center mb-6 border-b border-white/5 pb-4">
              <div className="flex gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500/50"></div>
                <div className="w-3 h-3 rounded-full bg-yellow-500/50"></div>
                <div className="w-3 h-3 rounded-full bg-green-500/50"></div>
              </div>
              <span className="text-[10px] text-gray-500">bash — lethedb</span>
            </div>

            <div className="text-gray-300 leading-relaxed space-y-2">
              <div>
                <span className="text-purple-400">$</span> bash scripts/hydradb-up.sh
              </div>
              <div className="text-gray-500 text-xs pl-4">&gt; Waiting for HydraDB readiness on :9090/readyz ... HydraDB is ready.</div>
              <div>
                <span className="text-purple-400">$</span> pnpm seed
              </div>
              <div className="text-gray-500 text-xs pl-4">&gt; Ingested LongMemEval oracle facts (tennis, ratio, apex)</div>
              <div>
                <span className="text-purple-400">$</span> curl "http://localhost:3000/recall?entity=user&attribute=tennis_frequency&as_of=2023-08-15"
              </div>
              <div className="text-green-400 text-xs pl-4">
                {`{"answer":"The user now plays tennis with friends at the local park every other week, on Sunday.","method":"supersedes_edge_walk"}`}
              </div>
              <div>
                <span className="text-purple-400">$</span> pnpm eval:longmemeval
              </div>
              <div className="text-gray-400 text-xs pl-4">
                Lethe Accuracy: <span className="text-green-400 font-bold">91% (164/181)</span> | Baseline: <span className="text-red-400 font-bold">1% (2/181)</span>
              </div>
            </div>
            <div className="mt-4 text-accent animate-pulse">_</div>
          </div>
        </div>
      </div>
    </section>
  )
}
