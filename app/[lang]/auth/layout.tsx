import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { translations } from '@/data/translations'
import { resolveLanguage } from '@/lib/i18n-routing'

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const language = resolveLanguage((await params).lang);
  const t = translations[language];
  return {
    title: `${t['auth.login'] ?? 'Login'} | Hairshop-Pro`,
    description: t['meta.authDescription'] ?? 'Sign in or create a Hairshop-Pro account',
    robots: { index: false, follow: false }
  };
}

export default function AuthLayout({ children }: { children: ReactNode }): ReactNode {
  return children
}
