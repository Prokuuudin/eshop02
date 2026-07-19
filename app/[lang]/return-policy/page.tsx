import React from 'react';
import { getReturnPolicyContent } from '@/data/return-policy-content';
import { resolveLanguage } from '@/lib/i18n-routing';

export default async function ReturnPolicyPage({ params }: { params: Promise<{ lang: string }> }): Promise<React.ReactElement> {
    const language = resolveLanguage((await params).lang);
    const content = getReturnPolicyContent(language);

    return (
        <main className="return-policy-page max-w-4xl mx-auto py-10 px-4 text-foreground">
            <h1 className="return-policy-page__title text-3xl font-bold mb-8">{content.title}</h1>
            <div
                className="return-policy-page__content text-sm sm:text-base text-gray-700 dark:text-gray-300 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:mt-6 [&_h2]:mb-3 [&_ul]:list-disc [&_ul]:pl-6 [&_p]:mb-3 [&_li]:mb-2"
                dangerouslySetInnerHTML={{ __html: content.html }}
            />
        </main>
    );
}
