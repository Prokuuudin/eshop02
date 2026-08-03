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
    path: '/delivery',
    title: t['deliveryPayment.deliveryTitle'] ?? 'Delivery',
    description: t['deliveryPayment.regions'] ?? 'Delivery terms for Hairshop-Pro orders',
  })
}

export default function DeliveryLayout({ children }: LayoutProps): ReactNode { return children }
