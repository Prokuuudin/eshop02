import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { headers } from 'next/headers'
import { translations, type Language } from '@/data/translations'
import AdminGate from '@/components/admin/AdminGate'

const resolveLanguageFromHeader = (acceptLanguage: string | null): Language => {
  const normalized = (acceptLanguage ?? '').toLowerCase()
  if (normalized.includes('ru')) return 'ru'
  if (normalized.includes('lv')) return 'lv'
  return 'en'
}

export async function generateMetadata(): Promise<Metadata> {
  const language = resolveLanguageFromHeader((await headers()).get('accept-language'))
  const t = translations[language]
  return {
    title: `${t['admin.title'] ?? 'Admin panel'} | Eshop`,
    description: t['meta.adminDescription'] ?? 'Administrative panel of Eshop',
    robots: { index: false, follow: false },
    alternates: { canonical: '/admin' }
  }
}

export default function AdminLayout({ children }: { children: ReactNode }): ReactNode {
  return (
    <AdminGate access="partial">
      <div className="mx-auto w-full max-w-[1600px] px-4 py-6 lg:px-6">
        <section>{children}</section>
      </div>
    </AdminGate>
  )
}
