import React from 'react';
import { getCookieContent } from '@/data/cookie-content';
import { resolveLanguage } from '@/lib/i18n-routing';

export default async function CookiesPage({ params }: { params: Promise<{ lang: string }> }): Promise<React.ReactElement> {
    const language = resolveLanguage((await params).lang);
    const content = getCookieContent(language);

    return (
        <main className="legal-page max-w-4xl mx-auto py-10 px-4 text-foreground">
            <h1 className="legal-page__title text-3xl font-bold mb-8">{content.title}</h1>
            <div
                className="legal-page__content text-sm sm:text-base text-gray-700 dark:text-gray-300"
                dangerouslySetInnerHTML={{ __html: content.html }}
            />
        </main>
    );
}
