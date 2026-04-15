import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { headers } from 'next/headers'
import { translations, type Language } from '@/data/translations'

const resolveLanguageFromHeader = (acceptLanguage: string | null): Language => {
  const normalized = (acceptLanguage ?? '').toLowerCase()
  if (normalized.includes('ru')) return 'ru'
  if (normalized.includes('lv')) return 'lv'
  return 'en'
}

export async function generateMetadata(): Promise<Metadata> {
  const language = resolveLanguageFromHeader((await headers()).get('accept-language'));
  const t = translations[language];
  return {
    title: `${t['auth.login'] ?? 'Login'} | Eshop`,
    description: t['meta.authDescription'] ?? 'Sign in or create an account in Eshop',
    robots: { index: false, follow: false }
  };
}

export default function AuthLayout({ children }: { children: ReactNode }): ReactNode {
  return children
}
