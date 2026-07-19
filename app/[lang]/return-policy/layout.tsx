import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { getReturnPolicyContent } from '@/data/return-policy-content'
import { pageAlternates, resolveLanguage } from '@/lib/i18n-routing'

type LayoutProps = {
  children: ReactNode
  params: Promise<{ lang: string }>
}

export async function generateMetadata({ params }: LayoutProps): Promise<Metadata> {
  const language = resolveLanguage((await params).lang)
  const content = getReturnPolicyContent(language)

  return {
    title: `${content.title} | Eshop`,
    alternates: pageAlternates('/return-policy', language),
  }
}

export default function ReturnPolicyLayout({ children }: LayoutProps): ReactNode {
  return children
}
