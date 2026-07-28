'use client'

import React from 'react'

type RevealProps = {
  children: React.ReactNode
  index?: number
  className?: string
}

export default function Reveal({ children, index = 0, className = '' }: RevealProps) {
  const ref = React.useRef<HTMLDivElement | null>(null)
  const [isVisible, setIsVisible] = React.useState(false)

  React.useEffect(() => {
    const node = ref.current
    if (!node) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setIsVisible(true)
          observer.unobserve(node)
        }
      },
      { threshold: 0.1, rootMargin: '0px 0px -10% 0px' }
    )

    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      className={`reveal h-full ${isVisible ? 'is-visible' : ''} ${className}`}
      style={{ transitionDelay: `${Math.min(index * 40, 240)}ms` }}
    >
      {children}
    </div>
  )
}
