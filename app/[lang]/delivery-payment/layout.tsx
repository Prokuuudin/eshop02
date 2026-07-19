import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { translations } from '@/data/translations'
import { pageAlternates, localizePath, resolveLanguage } from '@/lib/i18n-routing'

type LayoutProps = {
  children: ReactNode
  params: Promise<{ lang: string }>
}

export async function generateMetadata({ params }: LayoutProps): Promise<Metadata> {
  const language = resolveLanguage((await params).lang)
  const t = translations[language]
  const pageTitle = `${t['deliveryPayment.title'] ?? 'Delivery & payment'} | Eshop`
  const pageDescription = t['deliveryPayment.note'] ?? 'Delivery and payment terms for Eshop orders'

  return {
    title: pageTitle,
    description: pageDescription,
    alternates: pageAlternates('/delivery-payment', language),
    openGraph: {
      title: pageTitle,
      description: pageDescription,
      url: localizePath('/delivery-payment', language),
      type: 'website'
    }
  }
}

export default function DeliveryPaymentLayout({ children }: LayoutProps): ReactNode {
  return children
}
