import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { translations } from '@/data/translations'
import { resolveLanguage } from '@/lib/i18n-routing'
import { buildPublicPageMetadata } from '@/lib/page-metadata'

type LayoutProps = {
  children: ReactNode
  params: Promise<{ lang: string }>
}

export async function generateMetadata({ params }: LayoutProps): Promise<Metadata> {
  const language = resolveLanguage((await params).lang)
  const t = translations[language]
  const pageTitle = t['deliveryPayment.title'] ?? 'Delivery & payment'
  const pageDescription = t['deliveryPayment.note'] ?? 'Delivery and payment terms for Hairshop-Pro orders'

  return buildPublicPageMetadata({ language, path: '/delivery-payment', title: pageTitle, description: pageDescription })
}

export default function DeliveryPaymentLayout({ children }: LayoutProps): ReactNode {
  return children
}
