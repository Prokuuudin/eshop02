import { Button } from '@/components/ui/button';
import { headers } from 'next/headers';
import { translations, type Language } from '@/data/translations';
import RegisterForm from '@/components/auth/RegisterForm';
import Link from 'next/link';
export default async function RegisterPage() {
  const normalized = ((await headers()).get('accept-language') ?? '').toLowerCase();
  const language: Language = normalized.includes('ru') ? 'ru' : normalized.includes('lv') ? 'lv' : 'en';
  const t = translations[language];

  return (
    <main className="w-full px-4 py-12">
      <div className="max-w-md mx-auto">
        <h1 className="text-2xl font-bold mb-2 text-center">{t['auth.activationTitle'] ?? 'Client activation by barcode'}</h1>
        <p className="mb-6 text-center text-sm text-gray-600 dark:text-gray-300">{t['auth.activationSubtitle'] ?? 'Activate your client account using the issued barcode.'}</p>
        <RegisterForm />
        <div className="mt-4 text-center text-sm text-gray-600">
          {t['auth.haveAccount'] ?? 'Already have an account?'}
          <Link href="/auth/login" className="ml-2 text-indigo-600 hover:underline">
            {t['auth.login'] ?? 'Login'}
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
