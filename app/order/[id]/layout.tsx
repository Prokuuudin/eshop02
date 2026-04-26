import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { headers } from 'next/headers'
import { translations, type Language } from '@/data/translations'

type LayoutProps = {
  children: ReactNode
  params: Promise<{
    id: string
  }>
}

const interpolate = (template: string, params: Record<string, string>): string => {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => params[key] ?? match)
}

export async function generateMetadata({ params }: LayoutProps): Promise<Metadata> {
  const { id } = await params
  const headersList = await headers()
  const normalized = (headersList.get('accept-language') ?? '').toLowerCase()
  const language: Language = normalized.includes('ru') ? 'ru' : normalized.includes('lv') ? 'lv' : 'en'
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
