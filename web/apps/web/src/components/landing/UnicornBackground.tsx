export function UnicornBackground() {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
      {/* Deep Obsidian Background */}
      <div className="absolute inset-0 bg-[#040406]"></div>

      {/* Crimson Ambient Glows (Hardware GPU Accelerated) */}
      <div
        className="absolute -top-40 left-1/2 -translate-x-1/2 w-[800px] h-[500px] rounded-full blur-[140px] opacity-25"
        style={{
          background: 'radial-gradient(circle, #ff2247 0%, rgba(153, 27, 27, 0.4) 50%, transparent 70%)',
          transform: 'translateZ(0)',
        }}
      />
      <div
        className="absolute top-[40%] -left-40 w-[600px] h-[600px] rounded-full blur-[160px] opacity-15"
        style={{
          background: 'radial-gradient(circle, #991b1b 0%, rgba(255, 34, 71, 0.2) 60%, transparent 80%)',
          transform: 'translateZ(0)',
        }}
      />
      <div
        className="absolute top-[75%] -right-40 w-[700px] h-[700px] rounded-full blur-[160px] opacity-15"
        style={{
          background: 'radial-gradient(circle, #e11d48 0%, rgba(220, 38, 38, 0.2) 60%, transparent 80%)',
          transform: 'translateZ(0)',
        }}
      />

      {/* Subtle Dot Grid */}
      <div
        className="absolute inset-0 opacity-[0.035]"
        style={{
          backgroundImage: 'radial-gradient(rgba(255, 255, 255, 0.4) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
      />
    </div>
  )
}
