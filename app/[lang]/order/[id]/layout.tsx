import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { translations } from '@/data/translations'
import { resolveLanguage } from '@/lib/i18n-routing'

type LayoutProps = {
  children: ReactNode
  params: Promise<{
    lang: string
    id: string
  }>
}

const interpolate = (template: string, params: Record<string, string>): string => {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => params[key] ?? match)
}

export async function generateMetadata({ params }: LayoutProps): Promise<Metadata> {
  const { id, lang } = await params
  const language = resolveLanguage(lang)
  const t = translations[language]
  const titleTemplate = t['meta.orderTitleTemplate'] ?? 'Order {id} | Eshop'
  const descriptionTemplate = t['meta.orderDescriptionTemplate'] ?? 'Order page {id} in Eshop'

  return {
    title: interpolate(titleTemplate, { id }),
    description: interpolate(descriptionTemplate, { id }),
    robots: { index: false, follow: false },
    alternates: { canonical: `/order/${id}` }
  }
}

export default function OrderLayout({ children }: { children: ReactNode }): ReactNode {
  return children
}
