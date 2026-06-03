'use client'

import React, { useRef, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useTranslation } from '@/lib/use-translation'

type CheckoutGuardButtonProps = {
  canCheckout: boolean
  label: string
  href?: string
  className?: string
  onNavigate?: () => void
}

export default function CheckoutGuardButton({
  canCheckout,
  label,
  href = '/checkout',
  className,
  onNavigate
}: CheckoutGuardButtonProps) {
  const { t } = useTranslation()
  const [shaking, setShaking] = useState(false)
  const shakeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [magOffset, setMagOffset] = useState({ x: 0, y: 0 })
  const linkRef = useRef<HTMLAnchorElement>(null)

  const handleDisabledClick = () => {
    if (shaking) return
    setShaking(true)
    shakeTimerRef.current = setTimeout(() => setShaking(false), 350)
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (!linkRef.current) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const rect = linkRef.current.getBoundingClientRect()
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    const ox = Math.max(-6, Math.min(6, ((e.clientX - cx) / (rect.width / 2)) * 6))
    const oy = Math.max(-6, Math.min(6, ((e.clientY - cy) / (rect.height / 2)) * 6))
    setMagOffset({ x: ox, y: oy })
  }

  const handleMouseLeave = () => setMagOffset({ x: 0, y: 0 })

  if (canCheckout) {
    return (
      <Link
        ref={linkRef}
        href={href}
        onClick={onNavigate}
        className="block"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        <Button
          className={className}
          style={{ transform: `translate(${magOffset.x}px, ${magOffset.y}px)`, transition: 'transform 0.3s ease, background-color 0.15s ease, color 0.15s ease' }}
        >
          {label}
        </Button>
      </Link>
    )
  }

  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="block" onClick={handleDisabledClick}>
            <Button
              className={`${className ?? ''} ${shaking ? 'animate-shake' : ''} pointer-events-none`}
              disabled
              tabIndex={-1}
            >
              {label}
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>{t('checkout.emptyCartTooltip')}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
