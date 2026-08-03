import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { translations } from '@/data/translations'
import { resolveLanguage } from '@/lib/i18n-routing'
import { buildPublicPageMetadata } from '@/lib/page-metadata'

type LayoutProps = { children: ReactNode; params: Promise<{ lang: string }> }

export async function generateMetadata({ params }: LayoutProps): Promise<Metadata> {
  const language = resolveLanguage((await params).lang)
  const t = translations[language]
  return buildPublicPageMetadata({
    language,
    path: '/payment',
    title: t['deliveryPayment.paymentTitle'] ?? 'Payment',
    description: t['deliveryPayment.paymentNote'] ?? 'Payment terms for Hairshop-Pro orders',
  })
}

export default function PaymentLayout({ children }: LayoutProps): ReactNode { return children }
