'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/lib/use-translation';

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
    const { t } = useTranslation();
    useEffect(() => {
        // Log the error to an error reporting service
        console.error(error);
    }, [error]);

    return (
        <main className="w-full px-4 py-20">
            <div className="max-w-2xl mx-auto text-center">
                <div className="text-6xl font-bold text-red-600 mb-4">⚠️</div>

                <h1 className="text-4xl font-bold mb-4">{t('error.title')}</h1>

                <p className="text-xl text-gray-600 mb-8">{t('error.description')}</p>

                <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-8 text-left">
                    <p className="text-sm font-mono text-red-700 break-words">{error.message}</p>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                    <Button onClick={reset} size="lg">
                        🔄 {t('error.tryAgain')}
                    </Button>
                    <Link href="/">
                        <Button variant="outline" size="lg">
                            🏠 {t('notFound.home')}
                        </Button>
                    </Link>
                    <Link href="/contact">
                        <Button variant="secondary" size="lg">
                            {t('notFound.contact', 'Связаться с нами')}
                        </Button>
                    </Link>
                </div>

                {/* ...удалён блок "Нужна помощь?"... */}
            </div>
        </main>
    );
}
