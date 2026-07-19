import Link from 'next/link'
import LoginForm from '@/components/auth/LoginForm'
import { Button } from '@/components/ui/button'
import { translations } from '@/data/translations'
import { resolveLanguage } from '@/lib/i18n-routing'

export default async function LoginPage({ params }: { params: Promise<{ lang: string }> }) {
  const language = resolveLanguage((await params).lang);
  const t = translations[language];

  return (
    <main className="w-full px-4 py-12">
      <div className="max-w-md mx-auto">
        <h1 className="text-2xl font-bold mb-6 text-center">{t['auth.login'] ?? 'Login'}</h1>
        <LoginForm />
        <div className="mt-4 text-center text-sm text-gray-600">
          {t['auth.noAccount'] ?? "Don't have an account?"}
          <Link href="/auth/register" className="ml-2 text-primary hover:underline">
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
