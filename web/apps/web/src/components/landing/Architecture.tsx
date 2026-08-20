export function Architecture() {
  return (
    <section id="architecture" className="py-24 bg-[#040406] relative z-20 border-t border-white/5">
      <div className="max-w-[1400px] mx-auto px-6">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <span className="text-accent font-mono text-xs tracking-widest block mb-3">/// GRAPH DATA MODEL</span>
          <h2 className="font-display font-bold text-4xl md:text-5xl text-white scramble-text mb-4">
            Directed Knowledge Topology
          </h2>
          <p className="text-gray-400 text-base leading-relaxed">
            Rather than reducing knowledge into flat vector coordinates, Lethe represents facts as graph nodes with typed causal relationships in HydraDB.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-16">
          {/* Node: Entity */}
          <div className="glass-panel spotlight-card rounded-2xl p-6 border border-white/10">
            <div className="flex items-center justify-between mb-4">
              <span className="font-mono text-xs text-accent uppercase font-bold">:Entity Node</span>
              <span className="text-[10px] font-mono text-gray-500">Root Subject</span>
            </div>
            <div className="bg-black/60 rounded-xl p-4 font-mono text-xs text-gray-300 space-y-1 mb-4 border border-white/5">
              <div><span className="text-purple-400">id:</span> <span className="text-green-400">fnv1a("entity:user")</span></div>
              <div><span className="text-purple-400">name:</span> <span className="text-green-400">"user" | "Priya"</span></div>
              <div><span className="text-purple-400">kind:</span> <span className="text-green-400">"user" | "person" | "system"</span></div>
            </div>
            <p className="text-gray-400 text-xs leading-relaxed">
              Anchors all facts regarding an actor, user, or topic across long multi-turn agent sessions.
            </p>
          </div>

          {/* Node: Fact */}
          <div className="glass-panel spotlight-card rounded-2xl p-6 border border-accent/40 bg-accent/5 shadow-[0_0_30px_rgba(255,34,71,0.1)]">
            <div className="flex items-center justify-between mb-4">
              <span className="font-mono text-xs text-accent uppercase font-bold">:Fact Node</span>
              <span className="text-[10px] font-mono text-accent bg-accent/20 px-2 py-0.5 rounded">Immutable Knowledge</span>
            </div>
            <div className="bg-black/60 rounded-xl p-4 font-mono text-xs text-gray-300 space-y-1 mb-4 border border-white/5">
              <div><span className="text-purple-400">id:</span> <span className="text-green-400">fnv1a(idempotency_key)</span></div>
              <div><span className="text-purple-400">content:</span> <span className="text-green-400">"Plays tennis every other week"</span></div>
              <div><span className="text-purple-400">written_at:</span> <span className="text-green-400">"2023-07-30T01:19:00Z"</span></div>
              <div><span className="text-purple-400">attribute:</span> <span className="text-green-400">"tennis_frequency"</span></div>
            </div>
            <p className="text-gray-300 text-xs leading-relaxed">
              Point-in-time timestamped assertion. Never mutated in place — superseded via outgoing directional edges.
            </p>
          </div>

          {/* Node: Session */}
          <div className="glass-panel spotlight-card rounded-2xl p-6 border border-white/10">
            <div className="flex items-center justify-between mb-4">
              <span className="font-mono text-xs text-accent uppercase font-bold">:Session Node</span>
              <span className="text-[10px] font-mono text-gray-500">Dialogue Context</span>
            </div>
            <div className="bg-black/60 rounded-xl p-4 font-mono text-xs text-gray-300 space-y-1 mb-4 border border-white/5">
              <div><span className="text-purple-400">id:</span> <span className="text-green-400">fnv1a("session:conv-491")</span></div>
              <div><span className="text-purple-400">started_at:</span> <span className="text-green-400">"2023-07-30T01:15:00Z"</span></div>
            </div>
            <p className="text-gray-400 text-xs leading-relaxed">
              Groups co-occurring facts, enabling cross-entity path traversal via native <code className="text-accent">algo.SPpaths</code>.
            </p>
          </div>
        </div>

        {/* Directed Edge Relationships Visualizer */}
        <div className="glass-panel spotlight-card rounded-2xl p-8 border border-white/10 bg-[#07070b]">
          <h3 className="font-display font-bold text-xl text-white mb-6 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-accent"></span>
            HydraDB Edge Traversal Graph
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 font-mono text-xs">
            <div className="bg-black/50 p-4 rounded-xl border border-white/5">
              <div className="text-accent font-bold mb-2">(:Session)-[:STATES]-&gt;(:Fact)</div>
              <p className="text-gray-400 text-[11px] leading-relaxed">
                Connects facts stated in the same turn, allowing relation discovery between disconnected entities without manual relation graphs.
              </p>
            </div>
            <div className="bg-black/50 p-4 rounded-xl border border-white/5">
              <div className="text-accent font-bold mb-2">(:Fact)-[:ABOUT]-&gt;(:Entity)</div>
              <p className="text-gray-400 text-[11px] leading-relaxed">
                Indexes facts directly onto their subject, enabling instantaneous single-hop candidate filtering.
              </p>
            </div>
            <div className="bg-black/50 p-4 rounded-xl border border-accent/30 bg-accent/5">
              <div className="text-accent font-bold mb-2">(:Fact)-[:SUPERSEDES {'{at}'}]-&gt;(:Fact)</div>
              <p className="text-gray-300 text-[11px] leading-relaxed">
                The core innovation: new fact points to the older fact it invalidates. Recall simply walks to the terminal valid node.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
