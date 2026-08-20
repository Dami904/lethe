import { GithubIcon } from '@hugeicons/core-free-icons'
import { Icon } from '@/components/icons/Icon'

export function Footer() {
  return (
    <footer className="bg-[#030305] pt-32 pb-10 px-6 border-t border-white/10 relative overflow-hidden">
      <div className="absolute bottom-0 left-0 w-full select-none pointer-events-none opacity-[0.03] leading-none">
        <svg className="block w-full" viewBox="0 0 740 190" aria-hidden="true">
          <text
            x="0"
            y="188"
            fontSize="240"
            fontWeight="700"
            fill="#ffffff"
            textLength="740"
            lengthAdjust="spacingAndGlyphs"
            style={{ fontFamily: '"Space Grotesk", sans-serif' }}
          >
            LETHE
          </text>
        </svg>
      </div>

      <div className="max-w-[1400px] mx-auto relative z-10 flex flex-col md:flex-row justify-between items-start md:items-end gap-12">
        <div>
          <div className="flex items-center gap-3 mb-4">
            <img src="/lethe-icon.png" alt="Lethe" className="w-8 h-8 rounded-lg object-cover border border-accent/40" />
            <span className="font-display font-bold text-xl text-white">LETHE</span>
          </div>
          <p className="text-gray-400 text-sm max-w-md leading-relaxed mb-6 font-light">
            A temporal, self-correcting agent memory system on HydraDB. Points of knowledge are graph nodes, supersessions are directed edges, and recall is a mathematical traversal.
          </p>
          <div className="flex flex-col sm:flex-row gap-4">
            <a
              href="#playground"
              className="bg-accent text-white px-6 py-3 rounded-xl font-bold text-sm hover:bg-white hover:text-black transition-colors text-center shadow-[0_4px_20px_rgba(255,34,71,0.3)]"
            >
              LAUNCH PLAYGROUND
            </a>
            <a
              href="https://github.com/Dami904/lethe"
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-2 border border-white/10 bg-white/5 px-6 py-3 rounded-xl font-bold text-sm text-white hover:border-accent hover:bg-accent/10 transition-colors"
            >
              <Icon icon={GithubIcon} size={16} strokeWidth={2} /> GITHUB REPO
            </a>
          </div>
        </div>

        <div className="flex gap-12 text-sm text-gray-500 font-mono tracking-wider uppercase">
          <div className="flex flex-col gap-3">
            <span className="text-white">Navigation</span>
            <a href="#guarantees" className="hover:text-accent transition-colors">Guarantees</a>
            <a href="#playground" className="hover:text-accent transition-colors">Playground</a>
            <a href="#architecture" className="hover:text-accent transition-colors">Architecture</a>
            <a href="#benchmarks" className="hover:text-accent transition-colors">Benchmarks</a>
            <a href="#beam-benchmark" className="hover:text-accent transition-colors">BEAM</a>
          </div>
          <div className="flex flex-col gap-3">
            <span className="text-white">Hack Hydra</span>
            <a href="https://github.com/Dami904/lethe" target="_blank" rel="noreferrer" className="hover:text-accent transition-colors">Documentation</a>
            <a href="https://github.com/hydra-db/hydradb" target="_blank" rel="noreferrer" className="hover:text-accent transition-colors">HydraDB</a>
            <a href="https://github.com/xiaowu0162/LongMemEval" target="_blank" rel="noreferrer" className="hover:text-accent transition-colors">LongMemEval</a>
            <a href="https://github.com/mohammadtavakoli78/BEAM" target="_blank" rel="noreferrer" className="hover:text-accent transition-colors">BEAM</a>
          </div>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto mt-20 pt-6 border-t border-white/5 flex flex-col md:flex-row justify-between items-center text-[10px] text-gray-500 font-mono uppercase gap-4 md:gap-0">
        <span>© 2026 LETHE · AGENT MEMORY ON HYDRADB</span>
        <span className="md:mt-0">HACK HYDRA TRACK 3 · MIT LICENSE</span>
      </div>
    </footer>
  )
}
