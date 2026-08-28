import React from 'react';
import { getPrivacyContent } from '@/data/privacy-content';
import { resolveLanguage } from '@/lib/i18n-routing';
import { getServerContent } from '@/lib/server-translation';
import { sanitizeContentHtml } from '@/lib/sanitize-content-html';

export default async function PrivacyPage({ params }: { params: Promise<{ lang: string }> }): Promise<React.ReactElement> {
    const language = resolveLanguage((await params).lang);
    const content = getPrivacyContent(language);
    const { t } = await getServerContent(language);

    return (
        <main className="legal-page max-w-4xl mx-auto py-10 px-4 text-foreground">
            <h1 className="legal-page__title text-3xl font-bold mb-8">{t('legal.privacy.title', content.title)}</h1>
            <div
                className="legal-page__content public-content-rhythm text-sm text-gray-700 dark:text-gray-300 sm:text-base"
                dangerouslySetInnerHTML={{ __html: sanitizeContentHtml(t('legal.privacy.html', content.html)) }}
            />
        </main>
    );
}
