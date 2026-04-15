import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { headers } from 'next/headers'
import { translations, type Language } from '@/data/translations'

type LayoutProps = {
  children: ReactNode
  params: {
    id: string
  }
}

export async function generateMetadata({ params }: LayoutProps): Promise<Metadata> {
  const headersList = await headers();
  const normalized = (headersList.get('accept-language') ?? '').toLowerCase();
  const language: Language = normalized.includes('ru') ? 'ru' : normalized.includes('lv') ? 'lv' : 'en';
  const t = translations[language];
  const titleTemplate = t['meta.orderTitleTemplate'] ?? 'Order {id} | Eshop';
  const descriptionTemplate = t['meta.orderDescriptionTemplate'] ?? 'Order page {id} in Eshop';

  return {
    title: titleTemplate.replace('{id}', params.id),
    description: descriptionTemplate.replace('{id}', params.id),
    robots: { index: false, follow: false },
    alternates: { canonical: `/order/${params.id}` }
  };
}

export default function OrderLayout({ children }: { children: ReactNode }): ReactNode {
  return children
}
