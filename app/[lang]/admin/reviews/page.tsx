'use client';

import React from 'react';
import AdminGate from '@/components/admin/AdminGate';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';

type ReviewStatus = 'approved' | 'hidden' | 'pending';

import { useAdminReviewsPage } from './useAdminReviewsPage';

export default function AdminReviewsPage(): React.ReactElement {
    const pageState = useAdminReviewsPage();
    const {
            language,
            l,
            STATUS_LABELS,
            STATUS_COLORS,
            loading,
            savingId,
            bulkSaving,
            selectedReviewIds,
            search,
            setSearch,
            status,
            setStatus,
            message,
            error,
            replyDrafts,
            setReplyDrafts,
            replyExpanded,
            replySavingId,
            filteredClientSide,
            selectedCount,
            allVisibleSelected,
            toggleReviewSelection,
            toggleSelectAllVisible,
            applyBulkStatus,
            removeSelectedReviews,
            updateStatus,
            removeReview,
            toggleReply,
            saveReply,
            removeReply,
          } = pageState;
    return (
        <AdminGate>
            <main className="w-full space-y-3 text-foreground">
                <div className="rounded-lg border border-border bg-card p-4">
                    <h1 className="text-2xl font-bold">
                        {l('Отзывы: модерация', 'Reviews: moderation', 'Atsauksmes: moderacija')}
                    </h1>
                    <p className="mt-1 text-xs text-muted-foreground">
                        {l(
                            'Просмотр, скрытие, возврат в публикацию и удаление отзывов.',
                            'View, hide, restore publication, and delete reviews.',
                            'Skatisana, slegsana, publicesanas atjaunosana un dzesana.'
                        )}
                    </p>

                    <div className="mt-3 grid gap-2 md:grid-cols-[minmax(260px,420px)_180px_auto] md:items-center">
                        <Input
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            placeholder={l(
                                'Поиск по товару, автору, заголовку и тексту',
                                'Search by product, author, title and text',
                                'Meklet pec produkta, autora, virsraksta un teksta'
                            )}
                            className="h-9"
                        />
                        <Select
                            value={status}
                            onValueChange={(v) => setStatus(v as 'all' | ReviewStatus)}
                        >
                            <SelectTrigger className="h-9 w-full rounded-md border border-border bg-card px-2 py-1 text-sm">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">
                                    {l('Все статусы', 'All statuses', 'Visi statusi')}
                                </SelectItem>
                                <SelectItem value="approved">{STATUS_LABELS.approved}</SelectItem>
                                <SelectItem value="hidden">{STATUS_LABELS.hidden}</SelectItem>
                                <SelectItem value="pending">{STATUS_LABELS.pending}</SelectItem>
                            </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                            {l('Всего', 'Total', 'Kopa')}: {filteredClientSide.length}
                        </p>
                    </div>

                    <div className="mt-3 rounded-md border border-border px-3 py-2">
                        <div className="flex flex-wrap items-center gap-2">
                            <label className="inline-flex items-center gap-2 text-xs text-foreground">
                                <Checkbox
                                    checked={allVisibleSelected}
                                    onCheckedChange={(checked) =>
                                        toggleSelectAllVisible(checked === true)
                                    }
                                />
                                {l(
                                    'Выбрать все видимые',
                                    'Select all visible',
                                    'Atlasit visas redzamas'
                                )}
                            </label>

                            <span className="text-xs text-muted-foreground">
                                {l('Выбрано', 'Selected', 'Atlasits')}: {selectedCount}
                            </span>

                            <div className="ml-auto flex flex-wrap gap-2">
                                <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={bulkSaving || selectedCount === 0}
                                    onClick={() => void applyBulkStatus('approved')}
                                >
                                    {l('Показать выбранные', 'Show selected', 'Radit atlasitas')}
                                </Button>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={bulkSaving || selectedCount === 0}
                                    onClick={() => void applyBulkStatus('pending')}
                                >
                                    {l('На модерацию', 'Send to moderation', 'Uz moderaciju')}
                                </Button>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={bulkSaving || selectedCount === 0}
                                    onClick={() => void applyBulkStatus('hidden')}
                                >
                                    {l('Скрыть выбранные', 'Hide selected', 'Slept atlasitas')}
                                </Button>
                                <Button
                                    size="sm"
                                    variant="destructive"
                                    disabled={bulkSaving || selectedCount === 0}
                                    onClick={() => void removeSelectedReviews()}
                                >
                                    {l('Удалить выбранные', 'Delete selected', 'Dzest atlasitas')}
                                </Button>
                            </div>
                        </div>
                    </div>

                    {message && (
                        <p className="mt-3 rounded-md border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-800 dark:border-green-700 dark:bg-green-900/30 dark:text-green-200">
                            {message}
                        </p>
                    )}
                    {error && (
                        <p className="mt-3 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-700 dark:bg-red-900/30 dark:text-red-200">
                            {error}
                        </p>
                    )}
                </div>

                <div className="space-y-2">
                    {loading && (
                        <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
                            {l('Загрузка отзывов...', 'Loading reviews...', 'Ielade atsauksmes...')}
                        </div>
                    )}

                    {!loading &&
                        filteredClientSide.map((review) => {
                            const isSaving = bulkSaving || savingId === review.id;
                            const isSelected = selectedReviewIds.includes(review.id);

                            return (
                                <article
                                    key={review.id}
                                    className="rounded-lg border border-border bg-card p-3"
                                >
                                    <div className="flex flex-wrap items-start gap-2">
                                        <label
                                            htmlFor={`select-review-${review.id}`}
                                            className="inline-flex items-center"
                                        >
                                            <Checkbox
                                                id={`select-review-${review.id}`}
                                                checked={isSelected}
                                                onCheckedChange={(checked) =>
                                                    toggleReviewSelection(
                                                        review.id,
                                                        checked === true
                                                    )
                                                }
                                            />
                                        </label>
                                        <span className="rounded bg-muted px-2 py-1 text-xs font-medium text-foreground">
                                            {review.id}
                                        </span>
                                        <span className="rounded bg-muted px-2 py-1 text-xs font-medium text-foreground">
                                            {l('Товар', 'Product', 'Produkts')}: {review.productId}
                                        </span>
                                        <span
                                            className={`rounded px-2 py-1 text-xs font-medium ${
                                                STATUS_COLORS[review.status]
                                            }`}
                                        >
                                            {STATUS_LABELS[review.status]}
                                        </span>
                                        <span className="ml-auto text-xs text-muted-foreground">
                                            {new Date(review.createdAt).toLocaleString(
                                                language === 'ru'
                                                    ? 'ru-RU'
                                                    : language === 'lv'
                                                    ? 'lv-LV'
                                                    : 'en-US'
                                            )}
                                        </span>
                                    </div>

                                    <div className="mt-2 space-y-1">
                                        <p className="text-sm font-semibold">{review.title}</p>
                                        <p className="text-xs text-muted-foreground">
                                            {l('Автор', 'Author', 'Autors')}: {review.author} ·{' '}
                                            {l('Оценка', 'Rating', 'Vertejums')}: {review.rating} ·{' '}
                                            {l('Полезно', 'Helpful', 'Noderigi')}: {review.helpful}
                                        </p>
                                        <p className="text-sm text-foreground whitespace-pre-wrap">
                                            {review.text}
                                        </p>
                                    </div>

                                    <div className="mt-3 flex flex-wrap gap-2">
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            disabled={isSaving}
                                            onClick={() => void updateStatus(review.id, 'approved')}
                                        >
                                            {l('Показать', 'Show', 'Radit')}
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            disabled={isSaving}
                                            onClick={() => void updateStatus(review.id, 'pending')}
                                        >
                                            {l(
                                                'На модерацию',
                                                'Send to moderation',
                                                'Uz moderaciju'
                                            )}
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            disabled={isSaving}
                                            onClick={() => void updateStatus(review.id, 'hidden')}
                                        >
                                            {l('Скрыть', 'Hide', 'Slept')}
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="destructive"
                                            disabled={isSaving}
                                            onClick={() => void removeReview(review.id)}
                                        >
                                            {l('Удалить', 'Delete', 'Dzest')}
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            disabled={isSaving}
                                            onClick={() =>
                                                toggleReply(review.id, review.adminReply?.text)
                                            }
                                            className="ml-auto border-primary/50 text-primary hover:bg-primary/5 dark:border-primary/50 dark:text-primary dark:hover:bg-primary/10"
                                        >
                                            {review.adminReply
                                                ? replyExpanded.has(review.id)
                                                    ? l('Закрыть', 'Close', 'Aizvert')
                                                    : l(
                                                          'Изменить ответ',
                                                          'Edit reply',
                                                          'Labot atbildi'
                                                      )
                                                : replyExpanded.has(review.id)
                                                ? l('Закрыть', 'Close', 'Aizvert')
                                                : l('Ответить', 'Reply', 'Atbildet')}
                                        </Button>
                                    </div>

                                    {/* Existing reply preview */}
                                    {review.adminReply && !replyExpanded.has(review.id) && (
                                        <div className="mt-2 ml-2 rounded-lg border-l-[3px] border-primary/70 dark:border-primary bg-primary/5 dark:bg-primary/10 px-3 py-2">
                                            <p className="text-xs font-semibold text-primary dark:text-primary mb-0.5">
                                                {l(
                                                    'Ответ магазина',
                                                    'Store reply',
                                                    'Veikala atbilde'
                                                )}
                                            </p>
                                            <p className="text-xs text-foreground">
                                                {review.adminReply.text}
                                            </p>
                                        </div>
                                    )}

                                    {/* Reply editor */}
                                    {replyExpanded.has(review.id) && (
                                        <div className="mt-3 space-y-2 rounded-lg border border-primary/30 dark:border-primary/40 bg-primary/5 dark:bg-primary/20/10 p-3">
                                            <p className="text-xs font-semibold text-primary dark:text-primary">
                                                {l(
                                                    'Ответ от магазина (публичный)',
                                                    'Store reply (public)',
                                                    'Veikala atbilde (publiska)'
                                                )}
                                            </p>
                                            <Textarea
                                                rows={3}
                                                value={
                                                    replyDrafts[review.id] ??
                                                    review.adminReply?.text ??
                                                    ''
                                                }
                                                onChange={(e) =>
                                                    setReplyDrafts((d) => ({
                                                        ...d,
                                                        [review.id]: e.target.value,
                                                    }))
                                                }
                                                placeholder={l(
                                                    'Напишите ответ покупателю...',
                                                    'Write a reply to the customer...',
                                                    'Rakstiet atbildi klientam...'
                                                )}
                                                className="w-full border-primary/30 dark:border-primary/50 resize-none text-sm"
                                            />
                                            <div className="flex flex-wrap gap-2">
                                                <Button
                                                    size="sm"
                                                    disabled={
                                                        replySavingId === review.id ||
                                                        !(replyDrafts[review.id] ?? '').trim()
                                                    }
                                                    onClick={() => void saveReply(review.id)}
                                                    className="bg-primary hover:bg-primary/90 text-primary-foreground"
                                                >
                                                    {replySavingId === review.id
                                                        ? l(
                                                              'Сохранение...',
                                                              'Saving...',
                                                              'Saglaba...'
                                                          )
                                                        : l(
                                                              'Сохранить ответ',
                                                              'Save reply',
                                                              'Saglabat atbildi'
                                                          )}
                                                </Button>
                                                {review.adminReply && (
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        disabled={replySavingId === review.id}
                                                        onClick={() => void removeReply(review.id)}
                                                        className="text-red-600 border-red-300 hover:bg-red-50 dark:text-red-400 dark:border-red-700"
                                                    >
                                                        {l(
                                                            'Удалить ответ',
                                                            'Delete reply',
                                                            'Dzest atbildi'
                                                        )}
                                                    </Button>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </article>
                            );
                        })}

                    {!loading && filteredClientSide.length === 0 && (
                        <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
                            {l(
                                'Отзывы не найдены.',
                                'No reviews found.',
                                'Atsauksmes nav atrastas.'
                            )}
                        </div>
                    )}
                </div>
            </main>
        </AdminGate>
    );
}
