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
}: CheckoutGuardButtonProps): React.ReactElement {
  const { t } = useTranslation()
  const [shaking, setShaking] = useState(false)
  const shakeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleDisabledClick = () => {
    if (shaking) return
    setShaking(true)
    shakeTimerRef.current = setTimeout(() => setShaking(false), 350)
  }

  if (canCheckout) {
    return (
      <Link href={href} onClick={onNavigate} className="block">
        <Button className={className}>{label}</Button>
      </Link>
    )
  }

  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className="block"
            role="button"
            tabIndex={0}
            onClick={handleDisabledClick}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') handleDisabledClick()
            }}
          >
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
