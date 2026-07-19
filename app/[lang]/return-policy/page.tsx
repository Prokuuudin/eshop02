'use client';

import React from 'react';

import { useTranslation } from '@/lib/use-translation';
import { getReturnPolicyContent } from '@/data/return-policy-content';

export default function ReturnPolicyPage(): React.ReactElement {
    const { language } = useTranslation();
    const content = getReturnPolicyContent(language as string);

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
