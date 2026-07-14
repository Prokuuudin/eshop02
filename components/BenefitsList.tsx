'use client';
import React from 'react';

import { useTranslation } from '@/lib/use-translation';

const ITEMS = [
    { id: 'b1', key: 'benefits.deliveryFree', icon: '/icons/delivery.svg' },
    { id: 'b2', key: 'benefits.consultationMain', icon: '/icons/consulting.svg' },
    { id: 'b3', key: 'benefits.processingFast', icon: '/icons/orders.svg' },
    { id: 'b4', key: 'benefits.inStock', icon: '/icons/goods.svg' },
    { id: 'b5', key: 'benefits.brands100', icon: '/icons/originals.svg' },
    { id: 'b6', key: 'benefits.bonusPoints', icon: '/icons/bonuses.svg' },
];

export default function BenefitsList({
    compact = false,
    only,
}: {
    compact?: boolean;
    only?: string[];
}) {
    const { t } = useTranslation();
    const items = only ? ITEMS.filter((it) => only.includes(it.id)) : ITEMS;
    return (
        <ul
            className={
                compact
                    ? 'benefits-list-compact text-sm text-gray-700 dark:text-gray-300 space-y-1 list-disc list-inside'
                    : 'benefits-list text-lg text-foreground space-y-2 list-disc list-inside'
            }
        >
            {items.map((it) => (
                <li key={it.id} className="list-disc list-inside">
                    {t(it.key)}
                </li>
            ))}
        </ul>
    );
}
