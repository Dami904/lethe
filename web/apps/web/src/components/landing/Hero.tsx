export function Hero() {
  return (
    <section className="skew-target relative min-h-screen w-full flex flex-col justify-center items-center overflow-hidden pt-28 pb-16">
      <div className="absolute inset-0 bg-gradient-to-t from-[#040406] via-transparent to-[#040406] z-10 pointer-events-none"></div>
      <div className="absolute inset-0 bg-gradient-to-r from-[#040406] via-transparent to-[#040406] z-10 pointer-events-none"></div>

      <div className="relative z-20 text-center max-w-5xl px-6 py-8">
        <div className="inline-flex items-center gap-3 border border-accent/40 bg-accent/10 px-4 py-1.5 rounded-full mb-8 backdrop-blur-md shadow-[0_0_25px_rgba(255,34,71,0.2)]">
          <span className="w-2 h-2 rounded-full bg-accent animate-pulse"></span>
          <span className="font-mono text-[11px] text-accent tracking-widest uppercase font-semibold">
            Hack Hydra Track 3 · Agent Memory on HydraDB
          </span>
        </div>

        <h1 className="font-display font-bold text-5xl sm:text-7xl md:text-8xl lg:text-9xl tracking-tighter mb-6 leading-[0.9] text-white mix-blend-screen">
          <span className="scramble-text block">TEMPORAL</span>
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-white via-red-300 to-accent block">
            GRAPH MEMORY
          </span>
        </h1>

        <p className="text-gray-300 text-base sm:text-lg md:text-xl max-w-3xl mx-auto leading-relaxed mb-10 font-light">
          Vector similarity cannot tell a fresh fact from an outdated one. <br className="hidden md:block" />
          <strong className="text-white font-medium">Lethe</strong> links facts as immutable graph nodes connected by explicit <code className="text-accent bg-accent/10 px-1.5 py-0.5 rounded font-mono text-sm">SUPERSEDES</code> edges — a real graph traversal, not a similarity guess, deciding what's current.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center w-full sm:w-auto mb-16">
          <a
            href="#playground"
            className="bg-accent text-white px-8 py-4 font-bold text-sm uppercase tracking-widest hover:bg-white hover:text-black transition-all w-full sm:w-auto btn-magnetic rounded-xl shadow-[0_8px_30px_rgba(255,34,71,0.35)]"
          >
            Try Memory Playground
          </a>
          <a
            href="#benchmarks"
            className="px-8 py-4 border border-white/20 text-white font-bold text-sm uppercase tracking-widest hover:bg-white/10 hover:border-accent transition-all w-full sm:w-auto btn-magnetic rounded-xl"
          >
            View Benchmark Results
          </a>
        </div>

        {/* Hero Holographic Graph Display Card */}
        <div className="relative max-w-5xl mx-auto rounded-2xl border border-white/10 bg-[#08080c] p-2 shadow-[0_20px_80px_rgba(0,0,0,0.8)] overflow-hidden group">
          <div className="scan-line"></div>
          <div className="relative rounded-xl overflow-hidden border border-white/5">
            <img
              src="/lethe-graph-hero.jpg"
              alt="Lethe Spatial & Temporal Memory Graph Visualizer"
              className="w-full h-auto object-cover opacity-90 group-hover:scale-[1.01] transition-transform duration-700"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#040406] via-transparent to-transparent opacity-80"></div>
            
            {/* Live Graph Floating Badges */}
            <div className="absolute top-4 left-4 flex flex-wrap items-center gap-2">
              <span className="flex items-center gap-1.5 rounded-lg border border-accent/40 bg-black/70 px-3 py-1 font-mono text-[10px] text-accent backdrop-blur-md">
                <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse"></span>
                TOPOLOGY: SUPERSEDES EDGES
              </span>
              <span className="rounded-lg border border-white/10 bg-black/70 px-3 py-1 font-mono text-[10px] text-gray-300 backdrop-blur-md hidden sm:inline-block">
                QUERY: algo.SPpaths + algo.SSpaths
              </span>
            </div>

            <div className="absolute bottom-4 right-4 flex items-center gap-2">
              <span className="rounded-lg border border-white/10 bg-black/80 px-3 py-1.5 font-mono text-[10px] text-gray-400 backdrop-blur-md">
                SNAPSHOT CONSISTENCY: <span className="text-success font-semibold">PINNED</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
