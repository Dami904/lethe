import { UnicornBackground } from '@/components/landing/UnicornBackground'
import { Nav } from '@/components/landing/Nav'
import { Hero } from '@/components/landing/Hero'
import { Marquee } from '@/components/landing/Marquee'
import { Bento } from '@/components/landing/Bento'
import { MemoryPlayground } from '@/components/landing/MemoryPlayground'
import { Architecture } from '@/components/landing/Architecture'
import { BenchmarkSection } from '@/components/landing/BenchmarkSection'
import { Cli } from '@/components/landing/Cli'
import { Footer } from '@/components/landing/Footer'
import { useLandingEffects } from '@/components/landing/useLandingEffects'

export default function Landing() {
  useLandingEffects()

  return (
    <>
      <div className="fixed inset-0 bg-[#040406] -z-50"></div>
      <UnicornBackground />
      <div className="noise-overlay"></div>
      <Nav />
      <main>
        <Hero />
        <Marquee />
        <Bento />
        <MemoryPlayground />
        <Architecture />
        <BenchmarkSection />
        <Cli />
        <Footer />
      </main>
    </>
  )
}
