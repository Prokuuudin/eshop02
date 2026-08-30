'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { type ReturnStatus, type ReturnReason, getReturnReasonLabels } from '@/lib/returns-store';
import { formatDate, formatEuro } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { logAdminAction } from '@/lib/admin-log-store';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { reportAdminError } from '@/lib/admin-ui-errors';

const STATUS_LIST: ReturnStatus[] = ['pending', 'approved', 'rejected', 'refunded', 'completed'];

const STATUS_COLORS: Record<ReturnStatus, string> = {
    pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200',
    approved: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200',
    rejected: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200',
    refunded: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200',
    completed: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200',
};

const REASON_LIST: ReturnReason[] = [
    'defective',
    'wrong_item',
    'changed_mind',
    'not_as_described',
    'damaged',
    'other',
];

import { useAdminReturnsPage } from './useAdminReturnsPage';
import ReturnCreateForm from './ReturnCreateForm';

export default function AdminReturnsPage(): React.ReactElement {
    const pageState = useAdminReturnsPage();
    const {
            returns,
            setReturnStatus,
            locale,
            language,
            l,
            search,
            setSearch,
            statusFilter,
            setStatusFilter,
            reasonFilter,
            setReasonFilter,
            expandedReturn,
            setExpandedReturn,
            resolutionDraft,
            setResolutionDraft,
            notifySending,
            notifyResult,
            showCreate,
            setShowCreate,
            statsByStatus,
            totalRefund,
            filtered,
            sendNotification,
          } = pageState;
    const statusLabels: Record<ReturnStatus, string> = {
        pending: l('Новый', 'New', 'Jauns'), approved: l('Одобрен', 'Approved', 'Apstiprināts'),
        rejected: l('Отклонён', 'Rejected', 'Noraidīts'), refunded: l('Возвращён', 'Refunded', 'Atmaksāts'),
        completed: l('Завершён', 'Completed', 'Pabeigts'),
    };
    const reasonLabels = getReturnReasonLabels(language);
    return (
        <main className="w-full py-4 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h1 className="text-3xl font-bold text-foreground">{l('Возвраты и отмены', 'Returns and cancellations', 'Atgriešana un atcelšana')}</h1>
                <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={() => setShowCreate((v) => !v)}>
                        {showCreate ? l('Отмена', 'Cancel', 'Atcelt') : `+ ${l('Новый возврат', 'New return', 'Jauna atgriešana')}`}
                    </Button>
                    <Link href="/admin">
                        <Button variant="outline">{l('Назад в админку', 'Back to admin', 'Atpakaļ uz administrāciju')}</Button>
                    </Link>
                </div>
            </div>

            {/* Statistics */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
                <div className="col-span-2 rounded-xl border border-border bg-card p-4">
                    <p className="text-xs text-muted-foreground">{l('Сумма всех заявок', 'Total requested amount', 'Visu pieprasījumu summa')}</p>
                    <p className="text-2xl font-bold mt-1 text-foreground">
                        {formatEuro(totalRefund, locale)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        {returns.length} {l('заявок всего', 'requests total', 'pieprasījumi kopā')}
                    </p>
                </div>
                {STATUS_LIST.map((s) => (
                    <button
                        key={s}
                        type="button"
                        onClick={() => setStatusFilter(statusFilter === s ? 'all' : s)}
                        className={`rounded-xl border p-4 text-left transition-colors ${
                            statusFilter === s
                                ? 'border-primary/70 bg-primary/5 dark:border-primary dark:bg-primary/10'
                                : 'border-border bg-card hover:border-gray-300 dark:hover:border-gray-600'
                        }`}
                    >
                        <p className="text-xs text-muted-foreground">{statusLabels[s]}</p>
                        <p className="text-2xl font-bold mt-1 text-foreground">
                            {statsByStatus[s] ?? 0}
                        </p>
                    </button>
                ))}
            </div>

            <ReturnCreateForm state={pageState} reasonLabels={reasonLabels} />

            {/* Filters */}
            <div className="bg-card rounded-xl border border-border p-4 space-y-3">
                <div className="flex flex-wrap gap-3">
                    <Input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder={l('Поиск по ID, заказу, имени, email...', 'Search by ID, order, name or email...', 'Meklēt pēc ID, pasūtījuma, vārda vai e-pasta...')}
                        className="flex-1 min-w-[220px] rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                    <Select
                        value={statusFilter}
                        onValueChange={(v) => setStatusFilter(v as ReturnStatus | 'all')}
                    >
                        <SelectTrigger className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">{l('Все статусы', 'All statuses', 'Visi statusi')}</SelectItem>
                            {STATUS_LIST.map((s) => (
                                <SelectItem key={s} value={s}>
                                    {statusLabels[s]}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Select
                        value={reasonFilter}
                        onValueChange={(v) => setReasonFilter(v as ReturnReason | 'all')}
                    >
                        <SelectTrigger className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">{l('Все причины', 'All reasons', 'Visi iemesli')}</SelectItem>
                            {REASON_LIST.map((r) => (
                                <SelectItem key={r} value={r}>
                                    {reasonLabels[r]}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <span className="ml-auto self-center text-xs text-muted-foreground">
                        {filtered.length} {l('из', 'of', 'no')} {returns.length}
                    </span>
                </div>
            </div>

            {/* Returns list */}
            <div className="space-y-3">
                {filtered.map((ret) => {
                    const isExpanded = expandedReturn === ret.id;

                    return (
                        <div
                            key={ret.id}
                            className="rounded-xl border border-border bg-muted overflow-hidden"
                        >
                            <button
                                type="button"
                                onClick={() => setExpandedReturn(isExpanded ? null : ret.id)}
                                aria-expanded={isExpanded}
                                className="w-full text-left px-5 py-4 flex flex-wrap items-start gap-3 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors"
                            >
                                <div className="flex-1 min-w-0 space-y-1.5">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="font-mono text-xs text-muted-foreground">
                                            {ret.id}
                                        </span>
                                        <span
                                            className={`text-xs rounded-full px-2 py-0.5 font-medium ${
                                                STATUS_COLORS[ret.status]
                                            }`}
                                        >
                                            {statusLabels[ret.status]}
                                        </span>
                                        <span className="text-xs rounded-full px-2 py-0.5 bg-muted text-muted-foreground">
                                            {reasonLabels[ret.reason]}
                                        </span>
                                    </div>
                                    <p className="text-sm text-foreground">
                                        {ret.firstName} {ret.lastName}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        {l('Заказ:', 'Order:', 'Pasūtījums:')} <span className="font-mono">{ret.orderId}</span> ·{' '}
                                        {ret.email}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        {formatDate(ret.createdAt, locale)}
                                    </p>
                                </div>
                                <div className="text-right shrink-0">
                                    <p className="font-bold text-foreground">
                                        {formatEuro(ret.refundAmount, locale)}
                                    </p>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                        {ret.items.length}{' '}
                                        {ret.items.length === 1
                                            ? l('товар', 'product', 'produkts')
                                            : ret.items.length < 5
                                            ? l('товара', 'products', 'produkti')
                                            : l('товаров', 'products', 'produkti')}
                                    </p>
                                </div>
                            </button>

                            {isExpanded && (
                                <div className="border-t border-border px-5 py-5 space-y-5 bg-card">
                                    {/* Quick actions */}
                                    <div className="flex flex-wrap items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() =>
                                                void navigator.clipboard.writeText(ret.id)
                                            }
                                            className="inline-flex items-center rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                                        >
                                            {l('Скопировать ID', 'Copy ID', 'Kopēt ID')}
                                        </button>
                                        <a
                                            href={`mailto:${ret.email}`}
                                            className="inline-flex items-center rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                                        >
                                            {l('Написать клиенту', 'Email customer', 'Rakstīt klientam')}
                                        </a>
                                        <button
                                            type="button"
                                            disabled={notifySending === ret.id}
                                            onClick={() => void sendNotification(ret)}
                                            className="inline-flex items-center rounded-lg border border-primary/50 dark:border-primary/50 bg-primary/5 dark:bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary dark:text-primary hover:bg-primary/10 dark:hover:bg-primary/40 transition-colors disabled:opacity-50"
                                        >
                                            {notifySending === ret.id
                                                ? l('Отправка...', 'Sending...', 'Nosūtīšana...')
                                                : l('Уведомить клиента', 'Notify customer', 'Paziņot klientam')}
                                        </button>
                                        {notifyResult[ret.id] === 'ok' && (
                                            <span className="text-xs text-emerald-600 dark:text-emerald-400">
                                                {l('Письмо отправлено', 'Email sent', 'E-pasts nosūtīts')}
                                            </span>
                                        )}
                                        {notifyResult[ret.id] === 'error' && (
                                            <span className="text-xs text-red-600 dark:text-red-400">
                                                {l('Ошибка отправки', 'Sending failed', 'Nosūtīšanas kļūda')}
                                            </span>
                                        )}
                                        <Link
                                            href="/admin/orders"
                                            className="inline-flex items-center rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                                        >
                                            {l('Открыть заказы', 'Open orders', 'Atvērt pasūtījumus')}
                                        </Link>
                                    </div>

                                    {/* Info blocks */}
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        {/* Customer */}
                                        <div className="rounded-lg border border-border p-4 space-y-2">
                                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                                {l('Клиент', 'Customer', 'Klients')}
                                            </p>
                                            <p className="text-sm font-medium text-foreground">
                                                {ret.firstName} {ret.lastName}
                                            </p>
                                            <a
                                                href={`mailto:${ret.email}`}
                                                className="block text-sm text-primary hover:underline truncate"
                                            >
                                                {ret.email}
                                            </a>
                                            {ret.phone && (
                                                <a
                                                    href={`tel:${ret.phone}`}
                                                    className="block text-sm text-foreground hover:underline"
                                                >
                                                    {ret.phone}
                                                </a>
                                            )}
                                        </div>

                                        {/* Order */}
                                        <div className="rounded-lg border border-border p-4 space-y-2">
                                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                                {l('Заказ', 'Order', 'Pasūtījums')}
                                            </p>
                                            <p className="font-mono text-xs text-foreground break-all">
                                                {ret.orderId}
                                            </p>
                                            <div className="pt-1 border-t border-border">
                                                <p className="text-xs text-muted-foreground">
                                                    {l('Причина возврата', 'Return reason', 'Atgriešanas iemesls')}
                                                </p>
                                                <p className="text-sm font-medium text-foreground">
                                                    {reasonLabels[ret.reason]}
                                                </p>
                                            </div>
                                            {ret.comment && (
                                                <div>
                                                    <p className="text-xs text-muted-foreground">
                                                        {l('Комментарий клиента', 'Customer comment', 'Klienta komentārs')}
                                                    </p>
                                                    <p className="text-sm text-foreground italic">
                                                        «{ret.comment}»
                                                    </p>
                                                </div>
                                            )}
                                        </div>

                                        {/* Dates */}
                                        <div className="rounded-lg border border-border p-4 space-y-2">
                                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                                {l('Даты', 'Dates', 'Datumi')}
                                            </p>
                                            <div>
                                                <p className="text-xs text-muted-foreground">
                                                    {l('Подана заявка', 'Request submitted', 'Pieprasījums iesniegts')}
                                                </p>
                                                <p className="text-sm text-foreground">
                                                    {formatDate(ret.createdAt, locale)}
                                                </p>
                                            </div>
                                            {ret.resolvedAt && (
                                                <div>
                                                    <p className="text-xs text-muted-foreground">
                                                        {l('Обработана', 'Processed', 'Apstrādāts')}
                                                    </p>
                                                    <p className="text-sm text-foreground">
                                                        {formatDate(ret.resolvedAt, locale)}
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Items */}
                                    {ret.items.length > 0 && (
                                        <div>
                                            <p className="text-sm font-semibold text-foreground mb-2">
                                                {l('Возвращаемые товары', 'Products being returned', 'Atgriežamie produkti')}
                                            </p>
                                            <div className="rounded-lg border border-border divide-y divide-border">
                                                {ret.items.map((item, idx) => (
                                                    <div
                                                        key={idx}
                                                        className="flex items-center gap-3 px-3 py-2.5"
                                                    >
                                                        {item.image && (
                                                            <Image
                                                                unoptimized
                                                                src={item.image}
                                                                alt={item.title}
                                                                width={40}
                                                                height={40}
                                                                className="w-10 h-10 object-cover rounded-md shrink-0"
                                                            />
                                                        )}
                                                        <p className="flex-1 min-w-0 text-sm text-foreground truncate">
                                                            {item.title}
                                                        </p>
                                                        <div className="text-right shrink-0">
                                                            <p className="text-xs text-muted-foreground">
                                                                {item.quantity} {l('шт', 'pcs', 'gab.')} ×{' '}
                                                                {formatEuro(item.price, locale)}
                                                            </p>
                                                            <p className="text-sm font-medium text-foreground">
                                                                {formatEuro(
                                                                    item.price * item.quantity,
                                                                    locale
                                                                )}
                                                            </p>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                            <div className="mt-2 flex justify-end">
                                                <p className="text-sm font-bold text-foreground">
                                                    {l('К возврату:', 'Refund amount:', 'Atmaksas summa:')}{' '}
                                                    <span className="text-emerald-700 dark:text-emerald-400">
                                                        {formatEuro(ret.refundAmount, locale)}
                                                    </span>
                                                </p>
                                            </div>
                                        </div>
                                    )}

                                    {/* Resolution + status */}
                                    <div className="pt-2 border-t border-border space-y-3">
                                        <p className="text-sm font-semibold text-foreground">
                                            {l('Решение администратора', 'Administrator decision', 'Administratora lēmums')}
                                        </p>

                                        {ret.resolution && (
                                            <div className="rounded-lg bg-muted border border-border px-3 py-2 text-sm text-foreground italic">
                                                {ret.resolution}
                                            </div>
                                        )}

                                        <Textarea
                                            rows={2}
                                            value={resolutionDraft[ret.id] ?? ''}
                                            onChange={(e) =>
                                                setResolutionDraft((prev) => ({
                                                    ...prev,
                                                    [ret.id]: e.target.value,
                                                }))
                                            }
                                            placeholder={l('Добавьте комментарий к решению...', 'Add a comment to the decision...', 'Pievienojiet lēmuma komentāru...')}
                                            className="w-full resize-none text-sm"
                                        />

                                        <div className="flex flex-wrap gap-2">
                                            {STATUS_LIST.map((s) => (
                                                <Button
                                                    key={s}
                                                    size="sm"
                                                    variant={
                                                        ret.status === s ? 'default' : 'outline'
                                                    }
                                                    className={
                                                        ret.status === s
                                                            ? 'bg-primary hover:bg-primary/90 text-primary-foreground'
                                                            : ''
                                                    }
                                                    onClick={async () => {
                                                        const result = await setReturnStatus(
                                                            ret.id,
                                                            s,
                                                            resolutionDraft[ret.id]
                                                        );
                                                        if (!result.ok) {
                                                            reportAdminError(new Error(result.error ?? 'return_update_failed'), l('Возвраты', 'Returns', 'Atgriešana'));
                                                            return;
                                                        }
                                                        logAdminAction(
                                                            'return.status_changed',
                                                            {
                                                                type: 'return',
                                                                id: ret.id,
                                                                title: `${ret.firstName} ${ret.lastName}`,
                                                            },
                                                            {
                                                                before: { status: ret.status },
                                                                after: { status: s },
                                                            }
                                                        );
                                                    }}
                                                >
                                                    {statusLabels[s]}
                                                </Button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}

                {filtered.length === 0 && (
                    <div className="rounded-xl border border-border p-10 bg-muted text-center text-sm text-muted-foreground">
                        {returns.length === 0
                            ? l('Заявок на возврат пока нет', 'No return requests yet', 'Atgriešanas pieprasījumu vēl nav')
                            : l('Нет заявок по выбранным фильтрам', 'No requests match the selected filters', 'Neviens pieprasījums neatbilst izvēlētajiem filtriem')}
                    </div>
                )}
            </div>
        </main>
    );
}
