export function BeamBenchmarkSection() {
  return (
    <section id="beam-benchmark" className="skew-target py-28 px-6 bg-[#040406] relative z-20 border-t border-white/5">
      <div className="max-w-7xl mx-auto">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <span className="text-accent font-mono text-xs tracking-widest block mb-3">/// A SECOND, INDEPENDENT BENCHMARK</span>
          <h2 className="font-display font-bold text-4xl md:text-5xl text-white scramble-text mb-4">
            BEAM Benchmark
          </h2>
          <p className="text-gray-400 text-base leading-relaxed">
            <a href="https://github.com/mohammadtavakoli78/BEAM" target="_blank" rel="noreferrer" className="text-accent underline">BEAM</a> shares
            no source data, generation process, or question authorship with LongMemEval — real multi-turn
            conversations with their own hand-authored knowledge-update questions. All 20 chats in the
            "100K" tier, 155 auto-extracted update pairs, scored live against `/recall`.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          <div className="glass-panel spotlight-card rounded-2xl p-6 border border-success/30 bg-success/5 text-center">
            <div className="font-mono text-xs text-success uppercase font-bold mb-2">LETHE GRAPH ACCURACY (AFTER UPDATE)</div>
            <div className="text-5xl md:text-6xl font-display font-bold text-white mb-2">100%</div>
            <p className="text-gray-300 text-xs font-mono">155 / 155 Correct Update Recalls</p>
            <div className="mt-4 inline-block px-3 py-1 bg-success/20 rounded-full text-success text-[10px] font-mono font-bold">
              THE INVARIANT THAT MATTERS
            </div>
          </div>

          <div className="glass-panel spotlight-card rounded-2xl p-6 border border-danger/30 bg-danger/5 text-center">
            <div className="font-mono text-xs text-danger uppercase font-bold mb-2">VECTOR SIMILARITY ACCURACY</div>
            <div className="text-5xl md:text-6xl font-display font-bold text-white mb-2">1%</div>
            <p className="text-gray-400 text-xs font-mono">2 / 155 Correct Update Recalls</p>
            <div className="mt-4 inline-block px-3 py-1 bg-danger/20 rounded-full text-danger text-[10px] font-mono font-bold">
              COSINE DISTANCE COLLISION
            </div>
          </div>

          <div className="glass-panel spotlight-card rounded-2xl p-6 border border-white/10 text-center flex flex-col justify-between">
            <div>
              <div className="font-mono text-xs text-accent uppercase font-bold mb-2">LETHE ACCURACY (BEFORE UPDATE)</div>
              <div className="text-5xl md:text-6xl font-display font-bold text-white mb-2">91%</div>
              <p className="text-gray-400 text-xs font-mono">141 / 155 correct at the earlier timestamp</p>
            </div>
            <div className="mt-4 inline-block px-3 py-1 bg-white/10 rounded-full text-gray-300 text-[10px] font-mono">
              SAME METHODOLOGY AS LONGMEMEVAL, ABOVE
            </div>
          </div>
        </div>

        <div className="glass-panel spotlight-card rounded-2xl p-6 border border-white/10 text-center">
          <p className="text-gray-300 text-sm leading-relaxed max-w-3xl mx-auto">
            Two datasets with no shared lineage landing on structurally the same result —
            <span className="text-white font-bold"> ~91% before the update, 100% (or near it) once time has passed</span> —
            is a stronger signal that the invariant genuinely holds than either number alone.
          </p>
        </div>
      </div>
    </section>
  )
}
