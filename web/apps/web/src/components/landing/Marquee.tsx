const STACK = [
  'HYDRADB',
  'CYPHER GRAPH',
  'ALGO.SPPATHS',
  'ALGO.SSPATHS',
  'LONGMEMEVAL ORACLE',
  'NDJSON STREAMING',
  'FNV-1A DUAL HASH',
  'PINNED SNAPSHOTS',
  'GEMINI 3.1 FLASH',
  'DOCKER ENGINE',
  'ZERO-HALLUCINATION ABSTENTION',
]

export function Marquee() {
  return (
    <div className="border-y border-white/5 bg-[#060609] py-7 relative z-20 overflow-hidden marquee-mask w-full">
      <div className="flex whitespace-nowrap animate-marquee w-[max-content]">
        {[0, 1, 2].map((copy) => (
          <div key={copy} className="flex gap-12 md:gap-16 px-6 md:px-10 items-center">
            {STACK.map((name) => (
              <span
                key={name}
                className="font-display font-bold text-lg md:text-xl text-white/30 hover:text-accent transition-colors flex items-center gap-4 cursor-default"
              >
                <span>{name}</span>
                <span className="w-1.5 h-1.5 rounded-full bg-accent/40"></span>
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
