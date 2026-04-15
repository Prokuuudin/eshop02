'use client'

import React from 'react'
import { useTranslation } from '@/lib/use-translation'

type WholesaleMinimumAlertProps = {
  minOrderAmount: number
  shortage: number
  formatCurrency: (value: number) => string
  className?: string
}

export default function WholesaleMinimumAlert({
  minOrderAmount,
  shortage,
  formatCurrency,
  className
}: WholesaleMinimumAlertProps) {
  const { t } = useTranslation()

  return (
    <div className={className ?? 'rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800'}>
      <p>
        {t('checkout.minimumOrder')} {t('checkout.wholesale.requiredAmount')}:{' '}
        <span className="font-semibold">{formatCurrency(minOrderAmount)}</span>
      </p>
      <p className="mt-1">
        {t('checkout.wholesale.addMore')} <span className="font-semibold">{formatCurrency(shortage)}</span>
      </p>
    </div>
  )
}
