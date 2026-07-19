'use client';

import React from 'react';

import { useTranslation } from '@/lib/use-translation';
import { getPrivacyContent } from '@/data/privacy-content';

export default function PrivacyPage(): React.ReactElement {
    const { language } = useTranslation();
    const content = getPrivacyContent(language as string);

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
