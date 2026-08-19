'use client';

import React, { useEffect, useMemo } from 'react';
import Link from 'next/link';
import { Bell, ShoppingBag, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { useProductNewsStore, ProductNewsSubscription } from '@/lib/product-news-store';
import { useAuthStore } from '@/lib/auth-store';
import { useTranslation } from '@/lib/use-translation';

function ProductNewsCard({
    sub,
    onUpdate,
    onUnsubscribe,
    t,
}: {
    sub: ProductNewsSubscription;
    onUpdate: (flags: { notifyPrice: boolean; notifyStock: boolean; notifyPromo: boolean }) => void;
    onUnsubscribe: () => void;
    t: (key: string) => string;
}) {
    const toggle = (key: 'notifyPrice' | 'notifyStock' | 'notifyPromo') => {
        const next = {
            notifyPrice: sub.notifyPrice,
            notifyStock: sub.notifyStock,
            notifyPromo: sub.notifyPromo,
            [key]: !sub[key],
        };
        if (!next.notifyPrice && !next.notifyStock && !next.notifyPromo) return;
        onUpdate(next);
    };

    return (
        <div className="account-product-news__card rounded-lg border border-border bg-card p-4">
            <div className="flex items-start justify-between gap-3">
                <Link href={`/product/${sub.productId}`} className="text-sm font-medium text-foreground hover:text-primary leading-snug">
                    {sub.productTitle}
                </Link>
                <button
                    onClick={onUnsubscribe}
                    className="shrink-0 text-gray-400 hover:text-red-500 transition-colors"
                    title={t('productNews.unsubscribeBtn')}
                >
                    <X className="w-4 h-4" />
                </button>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
                <label className="flex items-center gap-1.5 cursor-pointer">
                    <Checkbox checked={sub.notifyPrice} onCheckedChange={() => toggle('notifyPrice')} />
                    {t('productNews.typePrice')}
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                    <Checkbox checked={sub.notifyStock} onCheckedChange={() => toggle('notifyStock')} />
                    {t('productNews.typeStock')}
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                    <Checkbox checked={sub.notifyPromo} onCheckedChange={() => toggle('notifyPromo')} />
                    {t('productNews.typePromo')}
                </label>
            </div>
        </div>
    );
}

export const AccountProductNewsSection: React.FC = () => {
    const { t } = useTranslation();
    const subscriptions = useProductNewsStore((state) => state.subscriptions);
    const { update, unsubscribe, hydrateFromServer } = useProductNewsStore();
    const userId = useAuthStore((state) => state.user?.id ?? null);

    useEffect(() => {
        if (userId) void hydrateFromServer();
    }, [userId, hydrateFromServer]);

    const subs = useMemo(() => subscriptions, [subscriptions]);

    return (
        <section className="account-product-news rounded-xl border border-border bg-card p-5">
            <div className="account-product-news__header flex items-center gap-2 mb-4">
                <Bell className="w-4 h-4 text-primary" />
                <h2 className="text-base font-semibold text-foreground">
                    {t('productNews.sectionTitle')}
                </h2>
                {subs.length > 0 && (
                    <Badge className="ml-1 text-xs bg-primary/10 text-primary dark:bg-primary/40 dark:text-primary border-0">
                        {subs.length}
                    </Badge>
                )}
            </div>

            {subs.length === 0 ? (
                <div className="account-product-news__empty flex flex-col items-center gap-3 py-6 text-center">
                    <div className="w-12 h-12 rounded-full bg-primary/5 dark:bg-primary/20 flex items-center justify-center">
                        <Bell className="w-5 h-5 text-primary/80" />
                    </div>
                    <div>
                        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                            {t('productNews.emptyTitle')}
                        </p>
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                            {t('productNews.emptyHint')}
                        </p>
                    </div>
                    <Link href="/catalog">
                        <button className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline font-medium">
                            <ShoppingBag className="w-3.5 h-3.5" />
                            {t('productNews.emptyCta')}
                        </button>
                    </Link>
                </div>
            ) : (
                <div className="account-product-news__list space-y-3">
                    {subs.map((sub) => (
                        <ProductNewsCard
                            key={sub.id}
                            sub={sub}
                            t={t}
                            onUpdate={(flags) => update(sub.id, flags)}
                            onUnsubscribe={() => unsubscribe(sub.id)}
                        />
                    ))}
                </div>
            )}
        </section>
    );
};
