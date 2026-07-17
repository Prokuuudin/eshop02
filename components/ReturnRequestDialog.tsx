'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/lib/toast-context';
import { useReturnsStore, RETURN_REASON_LABELS, type ReturnReason } from '@/lib/returns-store';
import type { Order } from '@/lib/orders-store';
import { formatEuro } from '@/lib/utils';
import { useTranslation } from '@/lib/use-translation';
import { getLocaleFromLanguage } from '@/lib/utils';

const SERVER_ERROR_LABELS: Record<string, string> = {
    item_not_in_order: 'Один из товаров не найден в заказе. Обновите страницу и попробуйте снова.',
    quantity_exceeds_order: 'Количество превышает купленное в заказе. Обновите страницу и попробуйте снова.',
    invalid_reason: 'Некорректная причина возврата.',
    order_not_found: 'Заказ не найден. Обновите страницу.',
    forbidden: 'Этот заказ принадлежит другому аккаунту.',
    unauthorized: 'Войдите в аккаунт, чтобы оформить возврат.',
};

type DraftLine = {
    selected: boolean;
    quantity: number;
};

export default function ReturnRequestDialog({
    order,
    open,
    onOpenChange,
}: {
    order: Order;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}) {
    const { t, language } = useTranslation();
    const { showToast } = useToast();
    const addReturn = useReturnsStore((s) => s.addReturn);
    const locale = getLocaleFromLanguage(language);

    const [lines, setLines] = useState<Record<string, DraftLine>>({});
    const [reason, setReason] = useState<ReturnReason | ''>('');
    const [comment, setComment] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const toggleLine = (productId: string, checked: boolean) => {
        setLines((prev) => ({
            ...prev,
            [productId]: { selected: checked, quantity: prev[productId]?.quantity ?? 1 },
        }));
    };

    const setQuantity = (productId: string, max: number, next: number) => {
        const clamped = Math.min(max, Math.max(1, next));
        setLines((prev) => ({
            ...prev,
            [productId]: { selected: prev[productId]?.selected ?? true, quantity: clamped },
        }));
    };

    const selectedItems = order.items.filter((item) => lines[item.id]?.selected);
    const canSubmit = selectedItems.length > 0 && reason !== '' && !submitting;

    const refundPreview = selectedItems.reduce(
        (sum, item) => sum + item.price * (lines[item.id]?.quantity ?? 1),
        0
    );

    const handleSubmit = async () => {
        if (!canSubmit || !reason) return;
        setSubmitting(true);
        const result = await addReturn({
            // Temp id: replaced by the server-assigned one on success.
            id: `ret_local_${Date.now()}`,
            orderId: order.id,
            createdAt: new Date(),
            status: 'pending',
            reason,
            comment: comment.trim() || undefined,
            items: selectedItems.map((item) => ({
                productId: item.id,
                title: item.title,
                quantity: lines[item.id]?.quantity ?? 1,
                price: item.price,
                image: item.image,
            })),
            refundAmount: refundPreview,
            firstName: order.firstName,
            lastName: order.lastName,
            email: order.email,
            phone: order.phone,
        });
        setSubmitting(false);

        if (!result.ok) {
            const label = result.error
                ? SERVER_ERROR_LABELS[result.error] ?? `Сервер отклонил заявку (${result.error}).`
                : 'Не удалось отправить заявку. Проверьте соединение и попробуйте ещё раз.';
            showToast(label, 'error');
            return;
        }

        showToast(t('returns.submitted', 'Заявка на возврат отправлена'), 'success');
        setLines({});
        setReason('');
        setComment('');
        onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>{t('returns.dialogTitle', 'Запрос возврата')}</DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                    <div>
                        <p className="mb-2 text-sm font-medium text-foreground">
                            {t('returns.pickItems', 'Выберите товары для возврата')}
                        </p>
                        <div className="space-y-2">
                            {order.items.map((item) => {
                                const line = lines[item.id];
                                return (
                                    <div
                                        key={item.lineKey ?? item.id}
                                        className="flex items-center gap-3 rounded-lg border border-border p-3"
                                    >
                                        <Checkbox
                                            checked={line?.selected ?? false}
                                            onCheckedChange={(checked) => toggleLine(item.id, checked === true)}
                                            aria-label={item.title}
                                        />
                                        {item.image && (
                                            <Image
                                                src={item.image}
                                                alt={item.title}
                                                width={40}
                                                height={40}
                                                className="h-10 w-10 rounded object-cover"
                                            />
                                        )}
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-sm font-medium text-foreground">{item.title}</p>
                                            <p className="text-xs text-muted-foreground">
                                                {formatEuro(item.price, locale)} · {t('returns.bought', 'куплено')}: {item.quantity}
                                            </p>
                                        </div>
                                        {line?.selected && item.quantity > 1 && (
                                            <div className="flex items-center gap-1">
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="icon"
                                                    className="h-8 w-8"
                                                    onClick={() => setQuantity(item.id, item.quantity, (line?.quantity ?? 1) - 1)}
                                                    aria-label={t('common.decrease', 'Уменьшить')}
                                                >
                                                    −
                                                </Button>
                                                <span className="w-6 text-center text-sm tabular-nums">{line?.quantity ?? 1}</span>
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="icon"
                                                    className="h-8 w-8"
                                                    onClick={() => setQuantity(item.id, item.quantity, (line?.quantity ?? 1) + 1)}
                                                    aria-label={t('common.increase', 'Увеличить')}
                                                >
                                                    +
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div>
                        <p className="mb-2 text-sm font-medium text-foreground">
                            {t('returns.reason', 'Причина возврата')}
                        </p>
                        <Select value={reason} onValueChange={(v) => setReason(v as ReturnReason)}>
                            <SelectTrigger className="w-full">
                                <SelectValue placeholder={t('returns.reasonPlaceholder', 'Выберите причину')} />
                            </SelectTrigger>
                            <SelectContent>
                                {(Object.entries(RETURN_REASON_LABELS) as Array<[ReturnReason, string]>).map(
                                    ([value, label]) => (
                                        <SelectItem key={value} value={value}>
                                            {label}
                                        </SelectItem>
                                    )
                                )}
                            </SelectContent>
                        </Select>
                    </div>

                    <div>
                        <p className="mb-2 text-sm font-medium text-foreground">
                            {t('returns.comment', 'Комментарий (необязательно)')}
                        </p>
                        <Textarea
                            value={comment}
                            onChange={(e) => setComment(e.target.value)}
                            placeholder={t('returns.commentPlaceholder', 'Опишите проблему подробнее...')}
                            rows={3}
                        />
                    </div>

                    {selectedItems.length > 0 && (
                        <p className="text-sm text-muted-foreground">
                            {t('returns.refundPreview', 'Ориентировочная сумма возврата')}:{' '}
                            <span className="font-semibold text-foreground">{formatEuro(refundPreview, locale)}</span>
                        </p>
                    )}

                    <div className="flex gap-2 pt-1">
                        <Button className="flex-1" disabled={!canSubmit} onClick={handleSubmit}>
                            {submitting
                                ? t('returns.submitting', 'Отправка...')
                                : t('returns.submit', 'Отправить заявку')}
                        </Button>
                        <Button variant="outline" onClick={() => onOpenChange(false)}>
                            {t('common.cancel', 'Отмена')}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
