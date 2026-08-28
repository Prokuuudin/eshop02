import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { getServerContent } from '@/lib/server-translation'
import { resolveLanguage } from '@/lib/i18n-routing'
import { buildPublicPageMetadata } from '@/lib/page-metadata'

type LayoutProps = {
  children: ReactNode
  params: Promise<{ lang: string }>
}

export async function generateMetadata({ params }: LayoutProps): Promise<Metadata> {
  const language = resolveLanguage((await params).lang)
  const { t } = await getServerContent(language)
  const pageTitle = t('contact.title', 'Contact')
  const pageDescription = t('contact.info', 'Hairshop-Pro support contacts: email, phone, address and working hours')

  return buildPublicPageMetadata({ language, path: '/contact', title: pageTitle, description: pageDescription })
}

export default function ContactLayout({ children }: LayoutProps): ReactNode {
  return children
}
