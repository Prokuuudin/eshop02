'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from '@/lib/use-translation';
import { useAdminConfirm } from '@/components/admin/AdminConfirmProvider';
import {
    areAllReviewsSelected,
    filterReviews,
    reconcileReviewSelection,
    toggleReviewInSelection,
    toggleVisibleReviews,
    type ReviewRecord,
    type ReviewStatus,
} from './reviews-model';
import { deleteAdminReviews, loadAdminReviews, updateAdminReviews } from './reviews-api';

function useAdminReviewsPageState() {
    const confirmAction = useAdminConfirm();
    const { t, language } = useTranslation();
    const l = useCallback(
        (ru: string, en: string, lv: string) =>
            language === 'ru' ? ru : language === 'lv' ? lv : en,
        [language]
    );
    const tl = useCallback(
        (
            key: string,
            ru: string,
            en: string,
            lv: string,
            params?: Record<string, string | number>
        ) => t(key, l(ru, en, lv), params),
        [l, t]
    );
    const STATUS_LABELS: Record<ReviewStatus, string> = {
        approved: tl('admin.reviews.status.approved', 'Показывается', 'Visible', 'Redzams'),
        hidden: tl('admin.reviews.status.hidden', 'Скрыт', 'Hidden', 'Slēpts'),
        pending: tl(
            'admin.reviews.status.pending',
            'На модерации',
            'Pending moderation',
            'Moderācijā'
        ),
    };

    const STATUS_COLORS: Record<ReviewStatus, string> = {
        approved: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-200',
        hidden: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-200',
        pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200',
    };

    const [reviews, setReviews] = useState<ReviewRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [savingId, setSavingId] = useState<string | null>(null);
    const [bulkSaving, setBulkSaving] = useState(false);
    const [selectedReviewIds, setSelectedReviewIds] = useState<string[]>([]);
    const [search, setSearch] = useState('');
    const [status, setStatus] = useState<'all' | ReviewStatus>('all');
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
    const [replyExpanded, setReplyExpanded] = useState<Set<string>>(new Set());
    const [replySavingId, setReplySavingId] = useState<string | null>(null);

    const loadReviews = useCallback(async () => {
        setLoading(true);
        try {
            const nextReviews = await loadAdminReviews({ status, search });
            setReviews(nextReviews);
            setSelectedReviewIds((prev) => reconcileReviewSelection(prev, nextReviews));
            setError('');
        } catch {
            setReviews([]);
            setSelectedReviewIds([]);
            setError(
                tl(
                    'admin.reviews.msg.loadFailed',
                    'Не удалось загрузить отзывы',
                    'Failed to load reviews',
                    'Neizdevās ielādēt atsauksmes'
                )
            );
        } finally {
            setLoading(false);
        }
    }, [search, status, tl]);

    useEffect(() => {
        queueMicrotask(() => void loadReviews());
    }, [loadReviews]);

    const filteredClientSide = useMemo(() => filterReviews(reviews, search), [reviews, search]);

    const selectedCount = selectedReviewIds.length;
    const allVisibleSelected = areAllReviewsSelected(filteredClientSide, selectedReviewIds);

    const toggleReviewSelection = (reviewId: string, checked: boolean) => {
        setSelectedReviewIds((prev) => toggleReviewInSelection(prev, reviewId, checked));
    };

    const toggleSelectAllVisible = (checked: boolean) => {
        setSelectedReviewIds((prev) => toggleVisibleReviews(prev, filteredClientSide, checked));
    };

    const applyBulkStatus = async (nextStatus: ReviewStatus) => {
        if (selectedReviewIds.length === 0) return;

        setBulkSaving(true);
        try {
            await updateAdminReviews({ ids: selectedReviewIds, status: nextStatus });

            setMessage(
                tl(
                    'admin.reviews.msg.bulkStatusUpdated',
                    'Массовое обновление: {count} отзыв(ов) -> {status}',
                    'Bulk update: {count} review(s) -> {status}',
                    'Masveida atjaunojums: {count} atsauksme(s) -> {status}',
                    { count: selectedReviewIds.length, status: STATUS_LABELS[nextStatus] }
                )
            );
            setError('');
            setSelectedReviewIds([]);
            await loadReviews();
        } catch {
            setMessage('');
            setError(
                tl(
                    'admin.reviews.msg.bulkStatusFailed',
                    'Не удалось выполнить массовое обновление статуса',
                    'Failed to perform bulk status update',
                    'Neizdevās veikt masveida statusa atjaunināšanu'
                )
            );
        } finally {
            setBulkSaving(false);
        }
    };

    const removeSelectedReviews = async () => {
        if (selectedReviewIds.length === 0) return;

        const decision = await confirmAction({
            title: tl(
                'admin.reviews.confirm.deleteSelected',
                'Удалить выбранные отзывы ({count}) без возможности восстановления?',
                'Delete selected reviews ({count}) permanently?',
                'Vai neatgriezeniski dzēst atlasītās atsauksmes ({count})?',
                { count: selectedReviewIds.length }
            ),
            description: l(
                'Отзывы будут удалены без возможности восстановления.',
                'The reviews will be deleted permanently.',
                'Atsauksmes tiks neatgriezeniski izdzēstas.'
            ),
            affected: selectedReviewIds,
            confirmText: l('УДАЛИТЬ', 'DELETE', 'DZĒST'),
            requireReason: true,
            destructive: true,
        });
        if (!decision.confirmed) return;

        setBulkSaving(true);
        try {
            await deleteAdminReviews({ ids: selectedReviewIds });

            setMessage(
                tl(
                    'admin.reviews.msg.bulkDeleted',
                    'Удалено отзывов: {count}',
                    'Deleted reviews: {count}',
                    'Dzēsto atsauksmju skaits: {count}',
                    { count: selectedReviewIds.length }
                )
            );
            setError('');
            setSelectedReviewIds([]);
            await loadReviews();
        } catch {
            setMessage('');
            setError(
                tl(
                    'admin.reviews.msg.bulkDeleteFailed',
                    'Не удалось удалить выбранные отзывы',
                    'Failed to delete selected reviews',
                    'Neizdevās dzēst atlasītās atsauksmes'
                )
            );
        } finally {
            setBulkSaving(false);
        }
    };

    const updateStatus = async (id: string, nextStatus: ReviewStatus) => {
        setSavingId(id);
        try {
            await updateAdminReviews({ id, status: nextStatus });

            setMessage(
                tl(
                    'admin.reviews.msg.statusUpdated',
                    'Статус отзыва {id} обновлен: {status}',
                    'Review {id} status updated: {status}',
                    'Atsauksmes {id} statuss atjaunots: {status}',
                    { id, status: STATUS_LABELS[nextStatus] }
                )
            );
            setError('');
            await loadReviews();
        } catch {
            setMessage('');
            setError(
                tl(
                    'admin.reviews.msg.statusUpdateFailed',
                    'Не удалось обновить статус отзыва {id}',
                    'Failed to update review status {id}',
                    'Neizdevās atjaunināt atsauksmes {id} statusu',
                    { id }
                )
            );
        } finally {
            setSavingId(null);
        }
    };

    const removeReview = async (id: string) => {
        const decision = await confirmAction({
            title: tl(
                'admin.reviews.confirm.deleteOne',
                'Удалить отзыв {id} без возможности восстановления?',
                'Delete review {id} permanently?',
                'Vai neatgriezeniski dzēst atsauksmi {id}?',
                { id }
            ),
            description: l(
                'Отзыв будет удалён без возможности восстановления.',
                'The review will be deleted permanently.',
                'Atsauksme tiks neatgriezeniski izdzēsta.'
            ),
            affected: [id],
            confirmText: l('УДАЛИТЬ', 'DELETE', 'DZĒST'),
            requireReason: true,
            destructive: true,
        });
        if (!decision.confirmed) return;

        setSavingId(id);
        try {
            await deleteAdminReviews({ id });

            setMessage(
                tl(
                    'admin.reviews.msg.deletedOne',
                    'Отзыв {id} удален',
                    'Review {id} deleted',
                    'Atsauksme {id} izdzēsta',
                    { id }
                )
            );
            setError('');
            await loadReviews();
        } catch {
            setMessage('');
            setError(
                tl(
                    'admin.reviews.msg.deleteOneFailed',
                    'Не удалось удалить отзыв {id}',
                    'Failed to delete review {id}',
                    'Neizdevās dzēst atsauksmi {id}',
                    { id }
                )
            );
        } finally {
            setSavingId(null);
        }
    };

    const toggleReply = (id: string, existingReply?: string) => {
        setReplyExpanded((prev) => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
                if (!replyDrafts[id] && existingReply) {
                    setReplyDrafts((d) => ({ ...d, [id]: existingReply }));
                }
            }
            return next;
        });
    };

    const saveReply = async (id: string) => {
        const text = (replyDrafts[id] ?? '').trim();
        if (!text) return;
        setReplySavingId(id);
        try {
            await updateAdminReviews({ id, reply: text });
            setReplyExpanded((prev) => {
                const n = new Set(prev);
                n.delete(id);
                return n;
            });
            await loadReviews();
            setMessage(l('Ответ сохранён', 'Reply saved', 'Atbilde saglabāta'));
            setError('');
        } catch {
            setError(
                l(
                    'Не удалось сохранить ответ',
                    'Failed to save reply',
                    'Neizdevās saglabāt atbildi'
                )
            );
        } finally {
            setReplySavingId(null);
        }
    };

    const removeReply = async (id: string) => {
        setReplySavingId(id);
        try {
            await updateAdminReviews({ id, reply: null });
            setReplyDrafts((d) => {
                const n = { ...d };
                delete n[id];
                return n;
            });
            setReplyExpanded((prev) => {
                const n = new Set(prev);
                n.delete(id);
                return n;
            });
            await loadReviews();
            setMessage(l('Ответ удалён', 'Reply deleted', 'Atbilde izdzēsta'));
            setError('');
        } catch {
            setError(
                l('Не удалось удалить ответ', 'Failed to delete reply', 'Neizdevās dzēst atbildi')
            );
        } finally {
            setReplySavingId(null);
        }
    };

    return {
        t,
        language,
        l,
        tl,
        STATUS_LABELS,
        STATUS_COLORS,
        reviews,
        setReviews,
        loading,
        setLoading,
        savingId,
        setSavingId,
        bulkSaving,
        setBulkSaving,
        selectedReviewIds,
        setSelectedReviewIds,
        search,
        setSearch,
        status,
        setStatus,
        message,
        setMessage,
        error,
        setError,
        replyDrafts,
        setReplyDrafts,
        replyExpanded,
        setReplyExpanded,
        replySavingId,
        setReplySavingId,
        loadReviews,
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
    };
}

export function useAdminReviewsPage(): ReturnType<typeof useAdminReviewsPageState> {
    return useAdminReviewsPageState();
}
