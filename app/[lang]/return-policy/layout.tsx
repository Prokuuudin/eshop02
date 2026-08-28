import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { getReturnPolicyContent } from '@/data/return-policy-content'
import { resolveLanguage } from '@/lib/i18n-routing'
import { buildPublicPageMetadata } from '@/lib/page-metadata'
import { getServerContent } from '@/lib/server-translation'

type LayoutProps = {
  children: ReactNode
  params: Promise<{ lang: string }>
}

export async function generateMetadata({ params }: LayoutProps): Promise<Metadata> {
  const language = resolveLanguage((await params).lang)
  const content = getReturnPolicyContent(language)
  const { t } = await getServerContent(language)

  const descriptions = {
    ru: 'Условия возврата товаров, право отказа и порядок возврата средств в Hairshop-Pro.',
    en: 'Hairshop-Pro product return, right of withdrawal and refund conditions.',
    lv: 'Hairshop-Pro preču atgriešanas, atteikuma tiesību un atmaksas nosacījumi.',
  }
  return buildPublicPageMetadata({ language, path: '/return-policy', title: t('legal.returnPolicy.title', content.title), description: descriptions[language] })
}

export default function ReturnPolicyLayout({ children }: LayoutProps): ReactNode {
  return children
}
