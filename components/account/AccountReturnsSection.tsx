'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { RotateCcw, ChevronRight, Package } from 'lucide-react';
import { useReturnsStore, mapServerReturn, RETURN_REASON_LABELS, type ReturnReason, ReturnStatus } from '@/lib/returns-store';
import { useAuthStore } from '@/lib/auth-store';
import { useTranslation } from '@/lib/use-translation';
import { getLocaleFromLanguage } from '@/lib/utils';

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

export const AccountReturnsSection: React.FC = () => {
    const { t, language } = useTranslation();
    const locale = getLocaleFromLanguage(language);
    const returns = useReturnsStore((s) => s.returns);
    const setReturns = useReturnsStore((s) => s.setReturns);
    const userEmail = useAuthStore((state) => state.user?.email ?? null);

    useEffect(() => {
        fetch('/api/returns')
            .then((r) => r.json())
            .then(({ returns: dbReturns }) => {
                if (Array.isArray(dbReturns)) setReturns(dbReturns.map(mapServerReturn));
            })
            .catch(() => {});
    }, [setReturns]);

    const userReturns = userEmail
        ? returns.filter((r) => r.email.toLowerCase() === userEmail.toLowerCase())
        : [];

    if (userReturns.length === 0) return null;

    const activeCount = userReturns.filter((r) => r.status === 'pending' || r.status === 'approved').length;

    return (
        <section className="rounded-2xl border border-orange-100 bg-white shadow-sm dark:border-orange-900/50 dark:bg-gray-900">
            <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 px-5 py-4">
                <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-50 text-orange-500 dark:bg-orange-950/40 dark:text-orange-400">
                        <RotateCcw className="h-4 w-4" />
                    </div>
                    <div>
                        <h3 className="text-sm font-semibold text-foreground">
                            {t('account.returns.title', 'Возвраты')}
                        </h3>
                        {activeCount > 0 && (
                            <p className="text-xs text-orange-600 dark:text-orange-400">
                                {activeCount} {t('account.returns.active', 'активных заявок')}
                            </p>
                        )}
                    </div>
                </div>
            </div>

            <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {userReturns.slice(0, 3).map((ret) => {
                    const date = new Date(ret.createdAt);
                    return (
                        <div key={ret.id} className="flex items-start gap-4 px-5 py-4">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gray-50 text-gray-400 dark:bg-gray-800">
                                <Package className="h-4 w-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                    <p className="text-xs font-mono text-muted-foreground">
                                        #{ret.id}
                                    </p>
                                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASSES[ret.status]}`}>
                                        {t(STATUS_KEY[ret.status])}
                                    </span>
                                </div>
                                <p className="mt-1 text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                                    {t(REASON_KEY[ret.reason], RETURN_REASON_LABELS[ret.reason])}
                                </p>
                                <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
                                    {ret.items.length} {t('account.returns.items', 'поз.')} · {ret.refundAmount.toFixed(2)} € ·{' '}
                                    {date.toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' })}
                                </p>
                                {ret.resolution && (
                                    <p className="mt-1 text-xs text-muted-foreground italic line-clamp-1">
                                        {ret.resolution}
                                    </p>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {userReturns.length > 3 && (
                <div className="border-t border-gray-100 dark:border-gray-800 px-5 py-3">
                    <Link
                        href="/account/returns"
                        className="inline-flex items-center gap-1 text-sm font-medium text-orange-600 dark:text-orange-400 hover:underline"
                    >
                        {t('account.returns.showAll', 'Все заявки')} ({userReturns.length})
                        <ChevronRight className="h-3.5 w-3.5" />
                    </Link>
                </div>
            )}
        </section>
    );
};
