'use client';

import React, { useMemo, useState } from 'react';
import Image from 'next/image';
import { RefreshCw, X, Check } from 'lucide-react';
import { useTranslation } from '@/lib/use-translation';
import { useCart } from '@/lib/cart-store';
import { getReorderSuggestions } from '@/lib/reorder-suggestions';
import type { Order } from '@/lib/orders-store';

const SNOOZE_DAYS = 30;
const SNOOZE_MS = SNOOZE_DAYS * 24 * 60 * 60 * 1000;

const dismissKey = (userId: string, productId: string): string => `reorder-dismissed:${userId}:${productId}`;

const readDismissed = (userId: string): Set<string> => {
    if (typeof window === 'undefined') return new Set();
    const now = Date.now();
    const dismissed = new Set<string>();
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key?.startsWith(`reorder-dismissed:${userId}:`)) continue;
        const ts = Number(localStorage.getItem(key));
        if (ts && now - ts < SNOOZE_MS) dismissed.add(key.slice(`reorder-dismissed:${userId}:`.length));
    }
    return dismissed;
};

interface AccountReorderSuggestionsWidgetProps {
    userOrders: Order[];
    userId: string;
}

export const AccountReorderSuggestionsWidget: React.FC<AccountReorderSuggestionsWidgetProps> = ({
    userOrders,
    userId,
}) => {
    const { t } = useTranslation();
    const addItem = useCart((s) => s.addItem);
    const [dismissed, setDismissed] = useState<Set<string>>(() => readDismissed(userId));
    const [added, setAdded] = useState<Set<string>>(new Set());

    const suggestions = useMemo(
        () => getReorderSuggestions(userOrders).filter((s) => !dismissed.has(s.item.id)),
        [userOrders, dismissed]
    );

    if (suggestions.length === 0) return null;

    const handleDismiss = (productId: string) => {
        if (typeof window !== 'undefined') {
            localStorage.setItem(dismissKey(userId, productId), String(Date.now()));
        }
        setDismissed((prev) => new Set(prev).add(productId));
    };

    const handleReorder = (productId: string, item: (typeof suggestions)[number]['item']) => {
        addItem(item, item.quantity, item.selectedVariants);
        setAdded((prev) => new Set(prev).add(productId));
    };

    return (
        <div className="flex flex-col rounded-2xl border border-amber-100 bg-amber-50 p-5 shadow-sm dark:border-amber-900 dark:bg-amber-950/30">
            <div className="mb-4 flex items-center justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/80 text-amber-500 shadow-sm dark:bg-gray-950/40 dark:text-amber-400">
                    <RefreshCw className="h-5 w-5" />
                </div>
            </div>

            <p className="text-sm font-semibold text-foreground">
                {t('account.reorderSuggestions', 'Возможно, заканчивается')}
            </p>

            <div className="mt-3 space-y-2">
                {suggestions.map(({ item }) => (
                    <div
                        key={item.id}
                        className="flex items-center gap-3 rounded-xl border border-transparent p-1.5 hover:border-amber-200 hover:bg-white/60 dark:hover:border-amber-800 dark:hover:bg-gray-900/50 transition-all"
                    >
                        <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-amber-100 bg-white p-1.5 dark:border-amber-900 dark:bg-gray-900">
                            <Image
                                src={item.image ?? '/hero-placeholder.svg'}
                                alt={item.title}
                                width={56}
                                height={56}
                                sizes="56px"
                                className="h-full w-full object-contain"
                            />
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-medium text-gray-800 dark:text-gray-200">
                                {item.title}
                            </p>
                            <p className="text-xs text-amber-600 dark:text-amber-400 font-semibold mt-0.5">
                                {item.price.toFixed(2)} €
                            </p>
                        </div>
                        {added.has(item.id) ? (
                            <span className="shrink-0 text-emerald-600 dark:text-emerald-400" aria-label={t('account.reorderAdded', 'Добавлено')}>
                                <Check className="h-4 w-4" />
                            </span>
                        ) : (
                            <button
                                type="button"
                                className="shrink-0 text-xs font-medium text-amber-700 dark:text-amber-300 underline underline-offset-2"
                                onClick={() => handleReorder(item.id, item)}
                            >
                                {t('account.reorderAgain', 'Заказать снова')}
                            </button>
                        )}
                        <button
                            type="button"
                            aria-label={t('account.reorderDismiss', 'Скрыть')}
                            className="shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                            onClick={() => handleDismiss(item.id)}
                        >
                            <X className="h-3.5 w-3.5" />
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
};
