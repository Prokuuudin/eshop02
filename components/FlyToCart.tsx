'use client'

import { useEffect } from 'react'

interface FlyToCartDetail {
  x: number
  y: number
}

export default function FlyToCart(): null {
  useEffect(() => {
    const handleFly = (e: Event) => {
      const { x: startX, y: startY } = (e as CustomEvent<FlyToCartDetail>).detail

      const cartEl = document.querySelector('.header__cart')
      if (!cartEl) return

      const cartRect = cartEl.getBoundingClientRect()
      const targetX = cartRect.left + cartRect.width / 2
      const targetY = cartRect.top + cartRect.height / 2

      const dx = targetX - startX
      const dy = targetY - startY

      const dot = document.createElement('div')
      dot.style.cssText = [
        'position:fixed',
        `left:${startX - 6}px`,
        `top:${startY - 6}px`,
        'width:12px',
        'height:12px',
        'border-radius:50%',
        'background:#4f46e5',
        'z-index:9999',
        'pointer-events:none',
      ].join(';')
      document.body.appendChild(dot)

      const anim = dot.animate(
        [
          { transform: 'translate(0, 0) scale(1)', opacity: 1, offset: 0 },
          { transform: `translate(${dx * 0.5}px, -80px) scale(0.9)`, opacity: 0.9, offset: 0.45 },
          { transform: `translate(${dx}px, ${dy}px) scale(0.3)`, opacity: 0, offset: 1 },
        ],
        { duration: 650, easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)', fill: 'forwards' }
      )

      anim.onfinish = () => dot.remove()
    }

    document.addEventListener('fly-to-cart', handleFly)
    return () => document.removeEventListener('fly-to-cart', handleFly)
  }, [])

  return null
}
