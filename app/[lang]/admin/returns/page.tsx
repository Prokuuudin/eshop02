'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { type ReturnStatus, type ReturnReason, RETURN_REASON_LABELS } from '@/lib/returns-store';
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

const STATUS_LABELS: Record<ReturnStatus, string> = {
    pending: 'Новый',
    approved: 'Одобрен',
    rejected: 'Отклонён',
    refunded: 'Возвращён',
    completed: 'Завершён',
};

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

export default function AdminReturnsPage(): React.ReactElement {
    const pageState = useAdminReturnsPage();
    const {
            returns,
            setReturnStatus,
            locale,
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
            formOrderId,
            setFormOrderId,
            foundOrder,
            lookupPending,
            formReason,
            setFormReason,
            formComment,
            setFormComment,
            formRefund,
            formFirstName,
            formLastName,
            formEmail,
            formPhone,
            formItems,
            formError,
            statsByStatus,
            totalRefund,
            filtered,
            sendNotification,
            lookupOrder,
            updateItemQty,
            submitReturn,
          } = pageState;
    return (
        <main className="w-full py-4 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h1 className="text-3xl font-bold text-foreground">Возвраты и отмены</h1>
                <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={() => setShowCreate((v) => !v)}>
                        {showCreate ? 'Отмена' : '+ Новый возврат'}
                    </Button>
                    <Link href="/admin">
                        <Button variant="outline">Назад в админку</Button>
                    </Link>
                </div>
            </div>

            {/* Statistics */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
                <div className="col-span-2 rounded-xl border border-border bg-card p-4">
                    <p className="text-xs text-muted-foreground">Сумма всех заявок</p>
                    <p className="text-2xl font-bold mt-1 text-foreground">
                        {formatEuro(totalRefund, locale)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        {returns.length} заявок всего
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
                        <p className="text-xs text-muted-foreground">{STATUS_LABELS[s]}</p>
                        <p className="text-2xl font-bold mt-1 text-foreground">
                            {statsByStatus[s] ?? 0}
                        </p>
                    </button>
                ))}
            </div>

            {/* Create form */}
            {showCreate && (
                <div className="rounded-xl border border-primary/30 dark:border-primary/40 bg-primary/5 dark:bg-primary/20/10 p-5 space-y-4">
                    <h2 className="text-base font-semibold text-foreground">
                        Новая заявка на возврат
                    </h2>

                    {/* Order lookup */}
                    <div className="flex gap-2">
                        <Input
                            type="text"
                            value={formOrderId}
                            onChange={(e) => setFormOrderId(e.target.value)}
                            placeholder="ID заказа (например ORD-...)"
                            className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                        />
                        <Button size="sm" variant="outline" onClick={lookupOrder} disabled={lookupPending}>
                            {lookupPending ? 'Поиск…' : 'Найти заказ'}
                        </Button>
                    </div>

                    {formError && (
                        <p className="text-xs text-amber-700 dark:text-amber-400">{formError}</p>
                    )}

                    {foundOrder && (
                        <div className="rounded-lg border border-border bg-card p-3 text-sm text-foreground">
                            Найден заказ · {foundOrder.firstName} {foundOrder.lastName} ·{' '}
                            {formatEuro(foundOrder.total, locale)}
                        </div>
                    )}

                    {/* Customer info */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <Input
                            value={formFirstName}
                            readOnly
                            placeholder="Имя *"
                            className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                        />
                        <Input
                            value={formLastName}
                            readOnly
                            placeholder="Фамилия"
                            className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                        />
                        <Input
                            value={formEmail}
                            readOnly
                            placeholder="Email *"
                            className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                        />
                        <Input
                            value={formPhone}
                            readOnly
                            placeholder="Телефон"
                            className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                        />
                    </div>

                    {/* Reason + refund */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <Select
                            value={formReason}
                            onValueChange={(v) => setFormReason(v as ReturnReason)}
                        >
                            <SelectTrigger className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {REASON_LIST.map((r) => (
                                    <SelectItem key={r} value={r}>
                                        {RETURN_REASON_LABELS[r]}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <div className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground">
                            Рассчитано по заказу: {formatEuro(formRefund, locale)}
                        </div>
                        <Input
                            value={formComment}
                            onChange={(e) => setFormComment(e.target.value)}
                            placeholder="Комментарий клиента"
                            className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                        />
                    </div>

                    {/* Items from order */}
                    {formItems.length > 0 && (
                        <div>
                            <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
                                Возвращаемые товары
                            </p>
                            <div className="rounded-lg border border-border divide-y divide-border bg-card">
                                {formItems.map((item, idx) => (
                                    <div key={idx} className="flex items-center gap-3 px-3 py-2.5">
                                        {item.image && (
                                            <Image
                                                unoptimized
                                                src={item.image}
                                                alt={item.title}
                                                width={32}
                                                height={32}
                                                className="w-8 h-8 object-cover rounded shrink-0"
                                            />
                                        )}
                                        <p className="flex-1 min-w-0 text-sm text-foreground truncate">
                                            {item.title}
                                        </p>
                                        <p className="text-xs text-muted-foreground shrink-0">
                                            {formatEuro(item.price, locale)}
                                        </p>
                                        <Input
                                            type="number"
                                            min={0}
                                            max={99}
                                            value={item.quantity}
                                            onChange={(e) =>
                                                updateItemQty(idx, Number(e.target.value))
                                            }
                                            className="w-16 rounded border border-border bg-background px-2 py-1 text-sm text-center text-foreground"
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="flex gap-2">
                        <Button onClick={submitReturn}>Создать заявку</Button>
                        <Button variant="outline" onClick={() => setShowCreate(false)}>
                            Отмена
                        </Button>
                    </div>
                </div>
            )}

            {/* Filters */}
            <div className="bg-card rounded-xl border border-border p-4 space-y-3">
                <div className="flex flex-wrap gap-3">
                    <Input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Поиск по ID, заказу, имени, email..."
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
                            <SelectItem value="all">Все статусы</SelectItem>
                            {STATUS_LIST.map((s) => (
                                <SelectItem key={s} value={s}>
                                    {STATUS_LABELS[s]}
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
                            <SelectItem value="all">Все причины</SelectItem>
                            {REASON_LIST.map((r) => (
                                <SelectItem key={r} value={r}>
                                    {RETURN_REASON_LABELS[r]}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <span className="ml-auto self-center text-xs text-muted-foreground">
                        {filtered.length} из {returns.length}
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
                                            {STATUS_LABELS[ret.status]}
                                        </span>
                                        <span className="text-xs rounded-full px-2 py-0.5 bg-muted text-muted-foreground">
                                            {RETURN_REASON_LABELS[ret.reason]}
                                        </span>
                                    </div>
                                    <p className="text-sm text-foreground">
                                        {ret.firstName} {ret.lastName}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        Заказ: <span className="font-mono">{ret.orderId}</span> ·{' '}
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
                                            ? 'товар'
                                            : ret.items.length < 5
                                            ? 'товара'
                                            : 'товаров'}
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
                                            Скопировать ID
                                        </button>
                                        <a
                                            href={`mailto:${ret.email}`}
                                            className="inline-flex items-center rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                                        >
                                            Написать клиенту
                                        </a>
                                        <button
                                            type="button"
                                            disabled={notifySending === ret.id}
                                            onClick={() => void sendNotification(ret)}
                                            className="inline-flex items-center rounded-lg border border-primary/50 dark:border-primary/50 bg-primary/5 dark:bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary dark:text-primary hover:bg-primary/10 dark:hover:bg-primary/40 transition-colors disabled:opacity-50"
                                        >
                                            {notifySending === ret.id
                                                ? 'Отправка...'
                                                : 'Уведомить клиента'}
                                        </button>
                                        {notifyResult[ret.id] === 'ok' && (
                                            <span className="text-xs text-emerald-600 dark:text-emerald-400">
                                                Письмо отправлено
                                            </span>
                                        )}
                                        {notifyResult[ret.id] === 'error' && (
                                            <span className="text-xs text-red-600 dark:text-red-400">
                                                Ошибка отправки
                                            </span>
                                        )}
                                        <Link
                                            href="/admin/orders"
                                            className="inline-flex items-center rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                                        >
                                            Открыть заказы
                                        </Link>
                                    </div>

                                    {/* Info blocks */}
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        {/* Customer */}
                                        <div className="rounded-lg border border-border p-4 space-y-2">
                                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                                Клиент
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
                                                Заказ
                                            </p>
                                            <p className="font-mono text-xs text-foreground break-all">
                                                {ret.orderId}
                                            </p>
                                            <div className="pt-1 border-t border-border">
                                                <p className="text-xs text-muted-foreground">
                                                    Причина возврата
                                                </p>
                                                <p className="text-sm font-medium text-foreground">
                                                    {RETURN_REASON_LABELS[ret.reason]}
                                                </p>
                                            </div>
                                            {ret.comment && (
                                                <div>
                                                    <p className="text-xs text-muted-foreground">
                                                        Комментарий клиента
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
                                                Даты
                                            </p>
                                            <div>
                                                <p className="text-xs text-muted-foreground">
                                                    Подана заявка
                                                </p>
                                                <p className="text-sm text-foreground">
                                                    {formatDate(ret.createdAt, locale)}
                                                </p>
                                            </div>
                                            {ret.resolvedAt && (
                                                <div>
                                                    <p className="text-xs text-muted-foreground">
                                                        Обработана
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
                                                Возвращаемые товары
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
                                                                {item.quantity} шт ×{' '}
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
                                                    К возврату:{' '}
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
                                            Решение администратора
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
                                            placeholder="Добавьте комментарий к решению..."
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
                                                            reportAdminError(new Error(result.error ?? 'return_update_failed'), 'Возвраты');
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
                                                    {STATUS_LABELS[s]}
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
                            ? 'Заявок на возврат пока нет'
                            : 'Нет заявок по выбранным фильтрам'}
                    </div>
                )}
            </div>
        </main>
    );
}
