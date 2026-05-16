'use client';
import React from 'react';
import Image from 'next/image';

import { useTranslation } from '@/lib/use-translation';

const ITEMS = [
    { id: 'b1', key: 'benefits.deliveryFree', icon: '/icons/delivery.svg' },
    { id: 'b2', key: 'benefits.consultation', icon: '/icons/support.svg', isHtml: true },
    { id: 'b3', key: 'benefits.processingFast', icon: '/icons/quality.svg' },
    { id: 'b4', key: 'benefits.inStock', icon: '/icons/quality.svg' },
    { id: 'b5', key: 'benefits.brands100', icon: '/icons/original.svg' },
];

export default function BenefitsList({
    compact = false,
    hideIcons = false,
}: {
    compact?: boolean;
    hideIcons?: boolean;
}) {
    const { t } = useTranslation();
    return (
        <ul
            className={
                compact
                    ? 'benefits-list-compact text-sm text-gray-700 dark:text-gray-300 space-y-1 list-disc list-inside'
                    : 'benefits-list text-lg text-gray-800 dark:text-gray-100 space-y-2 list-disc list-inside'
            }
        >
            {ITEMS.map((it) => (
                <li key={it.id} className="list-disc list-inside">
                    {it.isHtml ? (
                        <span dangerouslySetInnerHTML={{ __html: t(it.key) }} />
                    ) : (
                        t(it.key)
                    )}
                </li>
            ))}
        </ul>
    );
}
