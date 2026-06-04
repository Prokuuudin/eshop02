'use client'

import { useEffect, useRef, useState } from 'react'

interface AnimatedPriceProps {
  value: number
  format: (n: number) => string
  duration?: number
}

export default function AnimatedPrice({ value, format, duration = 500 }: AnimatedPriceProps) {
  const [displayed, setDisplayed] = useState(value)
  const prevRef = useRef(value)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setDisplayed(value)
      prevRef.current = value
      return
    }

    const from = prevRef.current
    const to = value
    if (from === to) return

    const start = performance.now()

    const tick = (now: number) => {
      const elapsed = now - start
      const progress = Math.min(elapsed / duration, 1)
      setDisplayed(from + (to - from) * progress)
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        prevRef.current = to
      }
    }

    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(tick)

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      prevRef.current = value
    }
  }, [value, duration])

  return <>{format(displayed)}</>
}
