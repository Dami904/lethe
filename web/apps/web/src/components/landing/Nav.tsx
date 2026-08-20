import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Menu01Icon, Cancel01Icon } from '@hugeicons/core-free-icons'
import { Icon } from '@/components/icons/Icon'

const LINKS = [
  { label: 'GUARANTEES', href: '#guarantees' },
  { label: 'PLAYGROUND', href: '#playground' },
  { label: 'ARCHITECTURE', href: '#architecture' },
  { label: 'BENCHMARKS', href: '#benchmarks' },
  { label: 'CLI', href: '#cli' },
]

export function Nav() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <nav className="fixed top-0 w-full z-50 border-b border-white/5 bg-[#040406]/85 backdrop-blur-md">
        <div className="flex h-20 max-w-7xl mx-auto px-6 items-center justify-between">
          <Link to="/" className="group flex items-center gap-3 z-50">
            <img src="/lethe-logo.png" alt="Lethe Logo" className="w-9 h-9 rounded-xl object-cover border border-accent/40 shadow-lg shadow-accent/20" />
            <span className="group-hover:text-accent transition-colors text-xl font-bold text-white tracking-tighter font-display">
              LETHE<span className="text-accent group-hover:text-white transition-colors">//</span>MEMORY
            </span>
          </Link>

          <div className="hidden md:flex gap-8 text-xs font-mono tracking-widest text-gray-400">
            {LINKS.map((link) => (
              <a key={link.href} href={link.href} className="hover:text-white transition-colors">
                {link.label}
              </a>
            ))}
          </div>

          <div className="hidden md:flex gap-4 items-center">
            <span className="hidden lg:flex items-center gap-2 text-[10px] text-accent font-mono border border-accent/30 bg-accent/10 px-2.5 py-1 rounded-full">
              <span className="w-1.5 h-1.5 animate-pulse bg-accent rounded-full"></span>
              HYDRADB ONLINE
            </span>
            <a
              href="#playground"
              className="uppercase hover:bg-white hover:text-black transition-all btn-magnetic text-xs font-bold text-white tracking-wider border-accent/40 bg-accent/20 hover:border-white border px-6 py-2 rounded-lg shadow-[0_0_20px_rgba(255,34,71,0.25)]"
            >
              Playground
            </a>
          </div>

          <button onClick={() => setOpen(!open)} className="md:hidden z-50 text-white p-2 focus:outline-none" aria-label="Toggle navigation">
            <Icon icon={open ? Cancel01Icon : Menu01Icon} size={24} strokeWidth={2} />
          </button>
        </div>
      </nav>

      <div
        className={`fixed inset-0 z-40 bg-[#040406]/98 backdrop-blur-2xl flex flex-col items-center justify-center transition-opacity duration-300 ${
          open ? 'opacity-100 visible pointer-events-auto' : 'opacity-0 invisible pointer-events-none'
        }`}
      >
        <div className="flex flex-col gap-8 text-center">
          {LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="text-2xl font-display font-bold text-white hover:text-accent transition-colors"
            >
              {link.label}
            </a>
          ))}
          <div className="w-12 h-[1px] bg-white/10 mx-auto my-4"></div>
          <a
            href="#playground"
            onClick={() => setOpen(false)}
            className="text-xl font-mono text-accent hover:text-white transition-colors"
          >
            OPEN_PLAYGROUND
          </a>
        </div>
      </div>
    </>
  )
}
