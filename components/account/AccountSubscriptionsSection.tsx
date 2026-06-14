'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Pause, Play, X, Package, ChevronDown, ShoppingBag } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    useSubscriptionStore,
    ProductSubscription,
    SubscriptionInterval,
    SUBSCRIPTION_DISCOUNTS,
} from '@/lib/subscription-store';
import { getCurrentUser } from '@/lib/auth';
import { useTranslation } from '@/lib/use-translation';
import { formatEuro } from '@/lib/utils';
import ConfirmActionDialog from '@/components/ConfirmActionDialog';

const STATUS_CONFIG = {
    active:    { label: 'subscription.statusActive',    className: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' },
    paused:    { label: 'subscription.statusPaused',    className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300' },
    cancelled: { label: 'subscription.statusCancelled', className: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' },
};

const INTERVALS: SubscriptionInterval[] = ['monthly', 'quarterly'];

function SubscriptionCard({
    sub,
    onPause,
    onResume,
    onCancel,
    onChangeInterval,
    t,
}: {
    sub: ProductSubscription;
    onPause: () => void;
    onResume: () => void;
    onCancel: () => void;
    onChangeInterval: (iv: SubscriptionInterval) => void;
    t: (key: string) => string;
}) {
    const [intervalOpen, setIntervalOpen] = useState(false);
    const statusCfg = STATUS_CONFIG[sub.status];

    const discountedPrice = parseFloat(
        (sub.pricePerUnit * (1 - sub.discountPercent / 100)).toFixed(2)
    );
    const nextDate = new Date(sub.nextOrderDate).toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
    });

    return (
        <div className="account-subscriptions__card rounded-lg border border-border bg-card p-4">
            <div className="flex items-start gap-3">
                {sub.productImage ? (
                    <img
                        src={sub.productImage}
                        alt={sub.productTitle}
                        className="w-14 h-14 rounded-md object-cover shrink-0 border border-gray-100 dark:border-gray-800"
                    />
                ) : (
                    <div className="w-14 h-14 rounded-md bg-muted flex items-center justify-center shrink-0">
                        <Package className="w-6 h-6 text-gray-400" />
                    </div>
                )}

                <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium text-foreground leading-snug">
                            {sub.productTitle}
                        </p>
                        <Badge className={`text-xs shrink-0 border-0 ${statusCfg.className}`}>
                            {t(statusCfg.label)}
                        </Badge>
                    </div>

                    <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span>
                            <span className="font-medium text-gray-700 dark:text-gray-300">
                                {formatEuro(discountedPrice, 'en-US')}
                            </span>
                            {' × '}{sub.quantity} {t('product.pcs')}
                        </span>
                        <span className="text-green-600 dark:text-green-400 font-medium">
                            -{sub.discountPercent}%
                        </span>
                        <span>{t(`subscription.${sub.interval}`)}</span>
                    </div>

                    {sub.status !== 'cancelled' && (
                        <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                            {t('subscription.nextOn')} <span className="font-medium text-muted-foreground">{nextDate}</span>
                        </p>
                    )}
                </div>
            </div>

            {sub.status !== 'cancelled' && (
                <div className="account-subscriptions__actions mt-3 flex flex-wrap gap-2 border-t border-gray-100 dark:border-gray-800 pt-3">
                    {sub.status === 'active' ? (
                        <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={onPause}>
                            <Pause className="w-3 h-3" />
                            {t('subscription.pause')}
                        </Button>
                    ) : (
                        <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={onResume}>
                            <Play className="w-3 h-3" />
                            {t('subscription.resume')}
                        </Button>
                    )}

                    <div className="relative">
                        <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs gap-1"
                            onClick={() => setIntervalOpen((v) => !v)}
                        >
                            <RefreshCw className="w-3 h-3" />
                            {t('subscription.changeInterval')}
                            <ChevronDown className="w-3 h-3" />
                        </Button>
                        {intervalOpen && (
                            <div className="absolute top-full left-0 mt-1 z-10 bg-card border border-border rounded-lg shadow-lg p-1 min-w-[160px]">
                                {INTERVALS.map((iv) => (
                                    <button
                                        key={iv}
                                        onClick={() => { onChangeInterval(iv); setIntervalOpen(false); }}
                                        className={`w-full text-left px-3 py-1.5 text-xs rounded hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center justify-between ${sub.interval === iv ? 'font-semibold text-primary' : 'text-gray-700 dark:text-gray-300'}`}
                                    >
                                        {t(`subscription.${iv}`)}
                                        <span className="text-green-600 dark:text-green-400">-{SUBSCRIPTION_DISCOUNTS[iv]}%</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    <ConfirmActionDialog
                        title={t('subscription.confirmCancelTitle')}
                        description={t('subscription.confirmCancelDesc')}
                        confirmLabel={t('subscription.cancel')}
                        cancelLabel={t('common.back')}
                        onConfirm={onCancel}
                        trigger={
                            <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 text-xs gap-1 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 ml-auto"
                            >
                                <X className="w-3 h-3" />
                                {t('subscription.cancel')}
                            </Button>
                        }
                    />
                </div>
            )}
        </div>
    );
}

export const AccountSubscriptionsSection: React.FC = () => {
    const { t } = useTranslation();
    const allSubscriptions = useSubscriptionStore((state) => state.subscriptions);
    const { pause, resume, cancel, changeInterval } = useSubscriptionStore();
    const [userId, setUserId] = useState<string | null>(null);
    const [showCancelled, setShowCancelled] = useState(false);

    useEffect(() => {
        setUserId(getCurrentUser()?.id ?? null);
    }, []);

    const subs = useMemo(
        () => (userId ? allSubscriptions.filter((s) => s.userId === userId) : []),
        [allSubscriptions, userId]
    );

    const active = subs.filter((s) => s.status !== 'cancelled');
    const cancelled = subs.filter((s) => s.status === 'cancelled');

    return (
        <section className="account-subscriptions rounded-xl border border-border bg-card p-5">
            <div className="account-subscriptions__header flex items-center gap-2 mb-4">
                <RefreshCw className="w-4 h-4 text-primary" />
                <h2 className="text-base font-semibold text-foreground">
                    {t('subscription.sectionTitle')}
                </h2>
                {active.length > 0 && (
                    <Badge className="ml-1 text-xs bg-primary/10 text-primary dark:bg-primary/20/40 dark:text-primary border-0">
                        {active.length}
                    </Badge>
                )}
            </div>

            {subs.length === 0 ? (
                <div className="account-subscriptions__empty flex flex-col items-center gap-3 py-6 text-center">
                    <div className="w-12 h-12 rounded-full bg-primary/5 dark:bg-primary/20 flex items-center justify-center">
                        <RefreshCw className="w-5 h-5 text-primary/80" />
                    </div>
                    <div>
                        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                            {t('subscription.emptyTitle')}
                        </p>
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                            {t('subscription.emptyHint')}
                        </p>
                    </div>
                    <Link href="/catalog">
                        <button className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline font-medium">
                            <ShoppingBag className="w-3.5 h-3.5" />
                            {t('subscription.emptyCta')}
                        </button>
                    </Link>
                </div>
            ) : (
                <>
                    <div className="account-subscriptions__list space-y-3">
                        {active.map((sub) => (
                            <SubscriptionCard
                                key={sub.id}
                                sub={sub}
                                t={t}
                                onPause={() => pause(sub.id)}
                                onResume={() => resume(sub.id)}
                                onCancel={() => cancel(sub.id)}
                                onChangeInterval={(iv) => changeInterval(sub.id, iv)}
                            />
                        ))}
                    </div>

                    {cancelled.length > 0 && (
                        <div className="mt-3">
                            <button
                                onClick={() => setShowCancelled((v) => !v)}
                                className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 flex items-center gap-1"
                            >
                                <ChevronDown className={`w-3 h-3 transition-transform ${showCancelled ? 'rotate-180' : ''}`} />
                                {t('subscription.showCancelled')} ({cancelled.length})
                            </button>
                            {showCancelled && (
                                <div className="mt-2 space-y-2 opacity-60">
                                    {cancelled.map((sub) => (
                                        <SubscriptionCard
                                            key={sub.id}
                                            sub={sub}
                                            t={t}
                                            onPause={() => {}}
                                            onResume={() => {}}
                                            onCancel={() => {}}
                                            onChangeInterval={() => {}}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </>
            )}
        </section>
    );
};
