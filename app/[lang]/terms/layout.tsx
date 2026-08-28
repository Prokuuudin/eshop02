import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { getTermsContent } from '@/data/terms-content'
import { resolveLanguage } from '@/lib/i18n-routing'
import { buildPublicPageMetadata } from '@/lib/page-metadata'
import { getServerContent } from '@/lib/server-translation'

type LayoutProps = {
  children: ReactNode
  params: Promise<{ lang: string }>
}

export async function generateMetadata({ params }: LayoutProps): Promise<Metadata> {
  const language = resolveLanguage((await params).lang)
  const content = getTermsContent(language)
  const { t } = await getServerContent(language)

  const descriptions = {
    ru: 'Условия использования интернет-магазина Hairshop-Pro и заключения дистанционного договора.',
    en: 'Terms of use for the Hairshop-Pro online store and distance contract conditions.',
    lv: 'Hairshop-Pro interneta veikala lietošanas un distances līguma noteikumi.',
  }
  return buildPublicPageMetadata({ language, path: '/terms', title: t('legal.terms.title', content.title), description: descriptions[language] })
}

export default function TermsLayout({ children }: LayoutProps): ReactNode {
  return children
}
