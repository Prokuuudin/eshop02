import React from 'react';
import { getReturnPolicyContent } from '@/data/return-policy-content';
import { resolveLanguage } from '@/lib/i18n-routing';
import { getServerContent } from '@/lib/server-translation';
import { sanitizeContentHtml } from '@/lib/sanitize-content-html';

export default async function ReturnPolicyPage({ params }: { params: Promise<{ lang: string }> }): Promise<React.ReactElement> {
    const language = resolveLanguage((await params).lang);
    const content = getReturnPolicyContent(language);
    const { t } = await getServerContent(language);

    return (
        <main className="return-policy-page max-w-4xl mx-auto py-10 px-4 text-foreground">
            <h1 className="return-policy-page__title text-3xl font-bold mb-8">{t('legal.returnPolicy.title', content.title)}</h1>
            <div
                className="return-policy-page__content public-content-rhythm text-sm text-gray-700 dark:text-gray-300 sm:text-base"
                dangerouslySetInnerHTML={{ __html: sanitizeContentHtml(t('legal.returnPolicy.html', content.html)) }}
            />
        </main>
    );
}
