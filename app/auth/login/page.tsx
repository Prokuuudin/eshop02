import Link from 'next/link'
import { headers } from 'next/headers'
import LoginForm from '@/components/auth/LoginForm'
import { Button } from '@/components/ui/button'
import { translations, type Language } from '@/data/translations'

export default async function LoginPage() {
  const normalized = ((await headers()).get('accept-language') ?? '').toLowerCase();
  const language: Language = normalized.includes('ru') ? 'ru' : normalized.includes('lv') ? 'lv' : 'en';
  const t = translations[language];

  return (
    <main className="w-full px-4 py-12">
      <div className="max-w-md mx-auto">
        <h1 className="text-2xl font-bold mb-6 text-center">{t['auth.login'] ?? 'Login'}</h1>
        <LoginForm />
        <div className="mt-4 text-center text-sm text-gray-600">
          {t['auth.noAccount'] ?? "Don't have an account?"}
          <Link href="/auth/register" className="ml-2 text-indigo-600 hover:underline">
            {t['auth.activateCta'] ?? 'Activate by barcode'}
          </Link>
        </div>
        <div className="mt-4 text-center">
          <Link href="/">
            <Button variant="ghost">{t['notFound.home'] ?? 'Home'}</Button>
          </Link>
        </div>
      </div>
    </main>
  );
}
