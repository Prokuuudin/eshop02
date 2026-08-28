import React from 'react';
import { getTermsContent } from '@/data/terms-content';
import { resolveLanguage } from '@/lib/i18n-routing';
import { getServerContent } from '@/lib/server-translation';
import { sanitizeContentHtml } from '@/lib/sanitize-content-html';

export default async function TermsPage({ params }: { params: Promise<{ lang: string }> }): Promise<React.ReactElement> {
    const language = resolveLanguage((await params).lang);
    const content = getTermsContent(language);
    const { t } = await getServerContent(language);

    return (
        <main className="terms-page max-w-4xl mx-auto py-10 px-4 text-foreground">
            <h1 className="terms-page__title text-3xl font-bold mb-8">{t('legal.terms.title', content.title)}</h1>
            <div
                className="terms-page__content public-content-rhythm text-sm text-gray-700 dark:text-gray-300 sm:text-base"
                dangerouslySetInnerHTML={{ __html: sanitizeContentHtml(t('legal.terms.html', content.html)) }}
            />
        </main>
    );
}
