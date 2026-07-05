import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { translations, type Language } from '@/data/translations'
import AdminGate from '@/components/admin/AdminGate'
import { getAdminAccessLevel, getServerUser, hasAdminUsersInDb } from '@/lib/server-auth'

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

export default async function AdminLayout({ children }: { children: ReactNode }): Promise<ReactNode> {
  // Real authorization boundary — the DB-backed session, not the client's
  // localStorage copy. AdminGate below stays only as a client-side UX layer
  // (instant redirect/feedback on client navigations); it must never be the
  // sole guard, since it never had a way to stop the RSC payload/bundle from
  // being sent to an unauthorized request in the first place.
  const user = await getServerUser()
  if (getAdminAccessLevel(user) === 'none') {
    const adminExists = await hasAdminUsersInDb()
    redirect(adminExists ? '/auth/login' : '/auth/admin-setup')
  }

  return (
    <AdminGate access="partial">
      <div className="mx-auto w-full max-w-7xl px-4 py-4">
        <section>{children}</section>
      </div>
    </AdminGate>
  )
}
