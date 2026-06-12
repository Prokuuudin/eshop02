'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Bell, BellOff, ChevronRight } from 'lucide-react';
import { useStockNotifyStore, StockNotifySubscription } from '@/lib/stock-notify-store';
import { getCurrentUser } from '@/lib/auth';
import { useTranslation } from '@/lib/use-translation';
import { Button } from '@/components/ui/button';

export const AccountStockNotificationsSection: React.FC = () => {
    const { t } = useTranslation();
    const subscriptions = useStockNotifyStore((s) => s.subscriptions);
    const unsubscribe = useStockNotifyStore((s) => s.unsubscribe);
    const [userEmail, setUserEmail] = useState<string | null>(null);

    useEffect(() => {
        setUserEmail(getCurrentUser()?.email ?? null);
    }, []);

    const userSubs: StockNotifySubscription[] = userEmail
        ? subscriptions.filter(
              (s) => s.email.toLowerCase() === userEmail.toLowerCase() && !s.notified
          )
        : [];

    if (userSubs.length === 0) return null;

    return (
        <section className="rounded-2xl border border-violet-100 bg-white shadow-sm dark:border-violet-900/50 dark:bg-gray-900">
            <div className="flex items-center gap-3 border-b border-gray-100 dark:border-gray-800 px-5 py-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-50 text-violet-500 dark:bg-violet-950/40 dark:text-violet-400">
                    <Bell className="h-4 w-4" />
                </div>
                <div>
                    <h3 className="text-sm font-semibold text-foreground">
                        {t('account.stockNotify.title', 'Уведомления о наличии')}
                    </h3>
                    <p className="text-xs text-violet-600 dark:text-violet-400">
                        {userSubs.length} {t('account.stockNotify.waiting', 'ожидает поступления')}
                    </p>
                </div>
            </div>

            <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {userSubs.map((sub) => {
                    const date = new Date(sub.createdAt);
                    return (
                        <div key={sub.id} className="flex items-center gap-4 px-5 py-3">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-400 dark:bg-violet-950/30">
                                <Bell className="h-3.5 w-3.5" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <Link
                                    href={`/product/${sub.productId}`}
                                    className="text-sm font-medium text-gray-800 dark:text-gray-200 hover:text-violet-600 dark:hover:text-violet-400 transition-colors truncate block"
                                >
                                    {sub.productTitle}
                                </Link>
                                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                                    {t('account.stockNotify.subscribedAt', 'Подписан')} {date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                                </p>
                            </div>
                            <Button
                                size="sm"
                                variant="outline"
                                className="shrink-0 text-xs text-red-500 border-red-200 hover:bg-red-50 hover:text-red-600 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/30"
                                onClick={() => unsubscribe(sub.id)}
                            >
                                <BellOff className="h-3 w-3 mr-1" />
                                {t('account.stockNotify.unsubscribe', 'Отписаться')}
                            </Button>
                        </div>
                    );
                })}
            </div>

            <div className="border-t border-gray-100 dark:border-gray-800 px-5 py-3">
                <p className="text-xs text-gray-400 dark:text-gray-500">
                    {t('account.stockNotify.hint', 'Вы получите уведомление, когда товар снова появится в наличии')}
                </p>
            </div>
        </section>
    );
};
