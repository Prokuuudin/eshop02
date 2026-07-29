'use client'

import React from 'react'
import { Product } from '@/data/products'
import { useTranslation } from '@/lib/use-translation'

type CertificatesProps = {
  product: Product
}

export default function Certificates({ product }: CertificatesProps): React.ReactElement | null {
  const { t } = useTranslation()
  if (!product.certificates || product.certificates.length === 0) {
    return null
  }

  return (
    <div className="rounded-lg border border-border p-6">
      <h3 className="text-lg font-bold text-foreground mb-4">{t('product.certificates')}</h3>
      
      <div className="space-y-2">
        {product.certificates.map((url, idx) => {
          const fileName = url.split('/').pop() || `Сертификат ${idx + 1}`
          return (
            <div key={idx} className="flex items-center gap-3">
              <svg className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path d="M4 4a2 2 0 012-2h6a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" />
              </svg>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
              >
                {fileName}
              </a>
            </div>
          )
        })}
      </div>
    </div>
  )
}
