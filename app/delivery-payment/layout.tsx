import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { headers } from 'next/headers'
import { translations, type Language } from '@/data/translations'

const resolveLanguageFromHeader = (acceptLanguage: string | null): Language => {
  const normalized = (acceptLanguage ?? '').toLowerCase()
  if (normalized.includes('ru')) return 'ru'
  if (normalized.includes('lv')) return 'lv'
  return 'en'
}

export async function generateMetadata(): Promise<Metadata> {
  const headersList = await headers();
  const language = resolveLanguageFromHeader(headersList.get('accept-language'))
  const t = translations[language]
  const pageTitle = `${t['deliveryPayment.title'] ?? 'Delivery & payment'} | Eshop`
  const pageDescription = t['deliveryPayment.note'] ?? 'Delivery and payment terms for Eshop orders'

  return {
    title: pageTitle,
    description: pageDescription,
    alternates: { canonical: '/delivery-payment' },
    openGraph: {
      title: pageTitle,
      description: pageDescription,
      url: '/delivery-payment',
      type: 'website'
    }
  }
}

export default function DeliveryPaymentLayout({ children }: { children: ReactNode }): ReactNode {
  return children
}
