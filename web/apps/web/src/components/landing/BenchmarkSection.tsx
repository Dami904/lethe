export function BenchmarkSection() {
  return (
    <section id="benchmarks" className="skew-target py-28 px-6 bg-[#040406] relative z-20 border-t border-white/5">
      <div className="max-w-7xl mx-auto">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <span className="text-accent font-mono text-xs tracking-widest block mb-3">/// EMPIRICAL EVALUATION</span>
          <h2 className="font-display font-bold text-4xl md:text-5xl text-white scramble-text mb-4">
            LongMemEval Benchmark
          </h2>
          <p className="text-gray-400 text-base leading-relaxed">
            Evaluated on all 78 real oracle-setting instances (72 knowledge-update + 6 paired abstention)
            from the <a href="https://github.com/xiaowu0162/LongMemEval" target="_blank" rel="noreferrer" className="text-accent underline">LongMemEval</a> dataset
            — 181 auto-extracted update pairs, scored against Lethe's live `/recall`, not a mocked run.
          </p>
        </div>

        {/* Big Metric Comparison Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          <div className="glass-panel spotlight-card rounded-2xl p-6 border border-success/30 bg-success/5 text-center">
            <div className="font-mono text-xs text-success uppercase font-bold mb-2">LETHE GRAPH ACCURACY (AFTER UPDATE)</div>
            <div className="text-5xl md:text-6xl font-display font-bold text-white mb-2">91%</div>
            <p className="text-gray-300 text-xs font-mono">164 / 181 Correct Update Recalls</p>
            <div className="mt-4 inline-block px-3 py-1 bg-success/20 rounded-full text-success text-[10px] font-mono font-bold">
              THE INVARIANT THAT MATTERS
            </div>
          </div>

          <div className="glass-panel spotlight-card rounded-2xl p-6 border border-danger/30 bg-danger/5 text-center">
            <div className="font-mono text-xs text-danger uppercase font-bold mb-2">VECTOR SIMILARITY ACCURACY</div>
            <div className="text-5xl md:text-6xl font-display font-bold text-white mb-2">1%</div>
            <p className="text-gray-400 text-xs font-mono">2 / 181 Correct Update Recalls</p>
            <div className="mt-4 inline-block px-3 py-1 bg-danger/20 rounded-full text-danger text-[10px] font-mono font-bold">
              COSINE DISTANCE COLLISION
            </div>
          </div>

          <div className="glass-panel spotlight-card rounded-2xl p-6 border border-white/10 text-center flex flex-col justify-between">
            <div>
              <div className="font-mono text-xs text-accent uppercase font-bold mb-2">LETHE ACCURACY (BEFORE UPDATE)</div>
              <div className="text-5xl md:text-6xl font-display font-bold text-white mb-2">92%</div>
              <p className="text-gray-400 text-xs font-mono">166 / 181 correct at the earlier timestamp</p>
            </div>
            <div className="mt-4 inline-block px-3 py-1 bg-white/10 rounded-full text-gray-300 text-[10px] font-mono">
              SEE DOCS/LIMITATIONS.MD FOR THE 9% TRACED CAUSE
            </div>
          </div>
        </div>

        {/* Detailed Comparison Table */}
        <div className="glass-panel spotlight-card rounded-2xl overflow-hidden border border-white/10">
          <div className="p-6 border-b border-white/10 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-black/40">
            <div>
              <h3 className="font-display font-bold text-lg text-white">System Characteristic Comparison</h3>
              <p className="text-gray-400 text-xs font-mono">Tested live against HydraDB HTTP query engine</p>
            </div>
            <span className="font-mono text-xs text-accent bg-accent/10 border border-accent/30 px-3 py-1 rounded-full">
              pnpm eval:longmemeval
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-xs">
              <thead className="border-b border-white/10 bg-white/[0.02] text-gray-400 uppercase text-[10px]">
                <tr>
                  <th className="p-4">Capability / Invariant</th>
                  <th className="p-4 text-accent">Lethe (HydraDB Graph)</th>
                  <th className="p-4 text-gray-400">Naive Vector Embedding (mem0/Zep)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-gray-300">
                <tr className="hover:bg-white/[0.02]">
                  <td className="p-4 font-sans font-medium text-white">Temporal Point-in-Time Recall</td>
                  <td className="p-4 text-success font-bold">✓ 91% (Cypher filter + SUPERSEDES walk)</td>
                  <td className="p-4 text-danger font-bold">✗ 1% (Static embedding similarity only)</td>
                </tr>
                <tr className="hover:bg-white/[0.02]">
                  <td className="p-4 font-sans font-medium text-white">Contradiction Handling</td>
                  <td className="p-4 text-success font-bold">✓ Explicit SUPERSEDES directed edges</td>
                  <td className="p-4 text-danger font-bold">✗ High cosine similarity collision</td>
                </tr>
                <tr className="hover:bg-white/[0.02]">
                  <td className="p-4 font-sans font-medium text-white">Non-Existent Fact Recall</td>
                  <td className="p-4 text-success font-bold">✓ Explicit abstention (no_fact_stated)</td>
                  <td className="p-4 text-danger font-bold">✗ Guesses / Hallucinates nearest vector</td>
                </tr>
                <tr className="hover:bg-white/[0.02]">
                  <td className="p-4 font-sans font-medium text-white">Cross-Entity Path Traversal</td>
                  <td className="p-4 text-success font-bold">✓ algo.SPpaths (Native Bounded BFS)</td>
                  <td className="p-4 text-danger font-bold">✗ No concept of relationship paths</td>
                </tr>
                <tr className="hover:bg-white/[0.02]">
                  <td className="p-4 font-sans font-medium text-white">Read Isolation During Writes</td>
                  <td className="p-4 text-success font-bold">✓ Pinned snapshot consistency</td>
                  <td className="p-4 text-yellow-500 font-bold">⚠ Prone to torn / partial reads</td>
                </tr>
                <tr className="hover:bg-white/[0.02]">
                  <td className="p-4 font-sans font-medium text-white">Live Streaming Transport</td>
                  <td className="p-4 text-success font-bold">✓ NDJSON (Accept: application/x-ndjson)</td>
                  <td className="p-4 text-gray-400">Standard JSON payload buffering</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  )
}
