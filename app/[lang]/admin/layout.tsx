import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { translations } from '@/data/translations'
import AdminGate from '@/components/admin/AdminGate'
import { getAdminAccessLevel, getServerUser, hasAdminUsersInDb } from '@/lib/server-auth'
import { resolveLanguage } from '@/lib/i18n-routing'

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const language = resolveLanguage((await params).lang)
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
