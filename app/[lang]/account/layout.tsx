import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { translations } from '@/data/translations'
import { resolveLanguage } from '@/lib/i18n-routing'
import AccountGuard from '@/components/account/AccountGuard'

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const language = resolveLanguage((await params).lang);
  const t = translations[language];
  return {
    title: `${t['account.title'] ?? 'My account'} | Eshop`,
    description: t['meta.accountDescription'] ?? 'Customer account in Eshop',
    robots: { index: false, follow: false },
    alternates: { canonical: '/account' }
  };
}

export default function AccountLayout({ children }: { children: ReactNode }): ReactNode {
  return <AccountGuard>{children}</AccountGuard>
}
