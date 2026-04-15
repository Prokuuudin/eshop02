'use client'

import React from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

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
  if (canCheckout) {
    return (
      <Link href={href} onClick={onNavigate} className="block">
        <Button className={className}>{label}</Button>
      </Link>
    )
  }

  return (
    <Button className={className} disabled>
      {label}
    </Button>
  )
}
