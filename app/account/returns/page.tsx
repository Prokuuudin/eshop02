'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Package, RotateCcw } from 'lucide-react';
import { useReturnsStore, mapServerReturn, RETURN_REASON_LABELS, type ReturnReason, type ReturnStatus } from '@/lib/returns-store';
import { getCurrentUser } from '@/lib/auth';
import { useTranslation } from '@/lib/use-translation';
import { getLocaleFromLanguage } from '@/lib/utils';
import { Button } from '@/components/ui/button';

const STATUS_CLASSES: Record<ReturnStatus, string> = {
    pending:   'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
    approved:  'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
    rejected:  'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
    refunded:  'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
    completed: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
};

const STATUS_KEY: Record<ReturnStatus, string> = {
    pending:   'account.returns.statusPending',
    approved:  'account.returns.statusApproved',
    rejected:  'account.returns.statusRejected',
    refunded:  'account.returns.statusRefunded',
    completed: 'account.returns.statusCompleted',
};

const REASON_KEY: Record<ReturnReason, string> = {
    defective:        'account.returns.reasonDefective',
    wrong_item:       'account.returns.reasonWrongItem',
    changed_mind:     'account.returns.reasonChangedMind',
    not_as_described: 'account.returns.reasonNotAsDescribed',
    damaged:          'account.returns.reasonDamaged',
    other:            'account.returns.reasonOther',
};

export default function AccountReturnsPage() {
    const { t, language } = useTranslation();
    const locale = getLocaleFromLanguage(language);
    const router = useRouter();
    const returns = useReturnsStore((s) => s.returns);
    const setReturns = useReturnsStore((s) => s.setReturns);
    const [userEmail, setUserEmail] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const user = getCurrentUser();
        if (!user) { router.replace('/auth/login'); return; }
        setUserEmail(user.email);
    }, [router]);

    useEffect(() => {
        fetch('/api/returns')
            .then((r) => r.json())
            .then(({ returns: dbReturns }) => {
                if (Array.isArray(dbReturns)) setReturns(dbReturns.map(mapServerReturn));
            })
            .catch(() => {})
            .finally(() => setLoading(false));
    }, [setReturns]);

    if (!userEmail) return null;

    const userReturns = returns.filter((r) => r.email.toLowerCase() === userEmail.toLowerCase());

    return (
        <main className="w-full max-w-3xl mx-auto px-4 py-10">
            <div className="mb-8">
                <Link
                    href="/account"
                    className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 transition-colors mb-4"
                >
                    <ArrowLeft className="w-4 h-4" />
                    {t('common.back', 'Назад')}
                </Link>
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 text-orange-500 dark:bg-orange-950/40 dark:text-orange-400">
                        <RotateCcw className="h-5 w-5" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-foreground">
                            {t('account.returns.title', 'Возвраты')}
                        </h1>
                        {userReturns.length > 0 && (
                            <p className="text-sm text-muted-foreground">
                                {userReturns.length} {t('account.returns.total', 'заявок')}
                            </p>
                        )}
                    </div>
                </div>
            </div>

            {loading && userReturns.length === 0 ? (
                <p className="py-12 text-center text-sm text-muted-foreground">{t('common.loading', 'Загрузка...')}</p>
            ) : userReturns.length === 0 ? (
                <div className="flex flex-col items-center gap-4 py-20 text-center">
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
                        <Package className="h-8 w-8 text-gray-400" />
                    </div>
                    <div>
                        <p className="text-base font-medium text-gray-700 dark:text-gray-300">
                            {t('account.returns.empty', 'У вас пока нет заявок на возврат')}
                        </p>
                        <p className="mt-1 text-sm text-gray-400 dark:text-gray-500">
                            {t('account.returns.emptyHint', 'Оформить возврат можно со страницы оплаченного заказа')}
                        </p>
                    </div>
                    <Link href="/account">
                        <Button variant="outline" className="mt-2">{t('account.returns.backToAccount', 'В аккаунт')}</Button>
                    </Link>
                </div>
            ) : (
                <div className="divide-y divide-gray-100 rounded-2xl border border-orange-100 bg-white shadow-sm dark:divide-gray-800 dark:border-orange-900/50 dark:bg-gray-900">
                    {userReturns.map((ret) => {
                        const date = new Date(ret.createdAt);
                        return (
                            <div key={ret.id} className="flex items-start gap-4 px-5 py-4">
                                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gray-50 text-gray-400 dark:bg-gray-800">
                                    <Package className="h-4 w-4" />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <p className="text-xs font-mono text-muted-foreground">#{ret.id}</p>
                                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASSES[ret.status]}`}>
                                            {t(STATUS_KEY[ret.status])}
                                        </span>
                                    </div>
                                    <p className="mt-1 text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                                        {t(REASON_KEY[ret.reason], RETURN_REASON_LABELS[ret.reason])}
                                    </p>
                                    <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
                                        {t('account.returns.order', 'Заказ')} {ret.orderId} · {ret.items.length}{' '}
                                        {t('account.returns.items', 'поз.')} · {ret.refundAmount.toFixed(2)} € ·{' '}
                                        {date.toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' })}
                                    </p>
                                    {ret.resolution && (
                                        <p className="mt-1 text-xs text-muted-foreground italic">{ret.resolution}</p>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </main>
    );
}
