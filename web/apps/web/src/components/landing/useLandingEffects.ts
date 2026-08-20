import { useEffect } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'

gsap.registerPlugin(ScrollTrigger)

const SCRAMBLE_CHARS = '!<>-_\\/[]{}—=+*^?#________'

class ScrambleText {
  private el: HTMLElement
  private queue: { from: string; to: string; start: number; end: number; char?: string }[] = []
  private frame = 0
  private frameRequest = 0
  private resolve: (() => void) | null = null

  constructor(el: HTMLElement) {
    this.el = el
    this.update = this.update.bind(this)
  }

  setText(newText: string) {
    const oldText = this.el.innerText
    const length = Math.max(oldText.length, newText.length)
    const promise = new Promise<void>((resolve) => (this.resolve = resolve))
    this.queue = []
    for (let i = 0; i < length; i++) {
      const from = oldText[i] || ''
      const to = newText[i] || ''
      const start = Math.floor(Math.random() * 25)
      const end = start + Math.floor(Math.random() * 25)
      this.queue.push({ from, to, start, end })
    }
    cancelAnimationFrame(this.frameRequest)
    this.frame = 0
    this.update()
    return promise
  }

  private update() {
    let output = ''
    let complete = 0
    for (const item of this.queue) {
      if (this.frame >= item.end) {
        complete++
        output += item.to
      } else if (this.frame >= item.start) {
        if (!item.char || Math.random() < 0.28) {
          item.char = SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)]
        }
        output += `<span class="opacity-50">${item.char}</span>`
      } else {
        output += item.from
      }
    }
    this.el.innerHTML = output
    if (complete === this.queue.length) {
      this.resolve?.()
    } else {
      this.frameRequest = requestAnimationFrame(this.update)
      this.frame++
    }
  }
}

export function useLandingEffects() {
  useEffect(() => {
    // 1. Ultra-Fluid Native-Feel Smooth Scroll
    const lenis = new Lenis({
      duration: 0.9,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      touchMultiplier: 1.2,
      infinite: false,
    })

    lenis.on('scroll', ScrollTrigger.update)
    const tickerCallback = (time: number) => {
      lenis.raf(time * 1000)
    }
    gsap.ticker.add(tickerCallback)
    gsap.ticker.lagSmoothing(0)

    // 2. Dynamic Scroll-Velocity Tilting (Slight & Controlled)
    const skewTargets = Array.from(document.querySelectorAll<HTMLElement>('.skew-target'))
    let currentSkew = 0
    let lastSkewApplied = 0
    let rafSkewId = 0

    const updateSkew = () => {
      const skewTarget = lenis.velocity * 0.035
      currentSkew += (skewTarget - currentSkew) * 0.1
      const clamped = Math.max(Math.min(currentSkew, 1.6), -1.6)

      if (Math.abs(clamped - lastSkewApplied) > 0.01 || Math.abs(clamped) > 0.01) {
        lastSkewApplied = clamped
        const transformVal = Math.abs(clamped) < 0.01 ? '' : `skewY(${clamped.toFixed(2)}deg)`
        for (let i = 0; i < skewTargets.length; i++) {
          skewTargets[i].style.transform = transformVal
        }
      }
      rafSkewId = requestAnimationFrame(updateSkew)
    }
    rafSkewId = requestAnimationFrame(updateSkew)

    // 3. Smooth Anchor Navigation Handler
    const handleAnchorClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest('a[href^="#"]') as HTMLAnchorElement | null
      if (!target) return
      const href = target.getAttribute('href')
      if (!href || href === '#') return

      const element = document.querySelector(href) as HTMLElement | null
      if (element) {
        e.preventDefault()
        lenis.scrollTo(element, { offset: -40, duration: 1.0 })
      }
    }
    document.addEventListener('click', handleAnchorClick)

    // 4. Optimized Cursor-Following Spotlight Cards
    const onMouseMove = (e: MouseEvent) => {
      const targetCard = (e.target as HTMLElement).closest('.spotlight-card') as HTMLElement | null
      if (targetCard) {
        const rect = targetCard.getBoundingClientRect()
        targetCard.style.setProperty('--mouse-x', `${e.clientX - rect.left}px`)
        targetCard.style.setProperty('--mouse-y', `${e.clientY - rect.top}px`)
      }
    }
    window.addEventListener('mousemove', onMouseMove, { passive: true })

    // 5. Scramble Text Observer
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const el = entry.target as HTMLElement
            new ScrambleText(el).setText(el.innerText)
            observer.unobserve(el)
          }
        })
      },
      { threshold: 0.3 },
    )
    document.querySelectorAll('.scramble-text').forEach((el) => observer.observe(el))

    // 6. GSAP ScrollTrigger Animations
    const ctx = gsap.context(() => {
      const counter = document.querySelector<HTMLElement>('.counter')
      if (counter) {
        const target = Number(counter.dataset.target || '0')
        const state = { value: 0 }
        gsap.to(state, {
          value: target,
          duration: 1.5,
          ease: 'power2.out',
          scrollTrigger: { trigger: counter, start: 'top 90%', once: true },
          onUpdate: () => {
            counter.textContent = String(Math.round(state.value))
          },
        })
      }

      gsap.utils.toArray<HTMLElement>('.glass-panel').forEach((panel, i) => {
        gsap.from(panel, {
          scrollTrigger: { trigger: panel, start: 'top 96%' },
          y: 15,
          opacity: 0,
          duration: 0.5,
          delay: (i % 3) * 0.05,
          ease: 'power2.out',
        })
      })
    })

    return () => {
      cancelAnimationFrame(rafSkewId)
      document.removeEventListener('click', handleAnchorClick)
      window.removeEventListener('mousemove', onMouseMove)
      gsap.ticker.remove(tickerCallback)
      lenis.destroy()
      observer.disconnect()
      ctx.revert()
      for (let i = 0; i < skewTargets.length; i++) {
        skewTargets[i].style.transform = ''
      }
    }
  }, [])
}
