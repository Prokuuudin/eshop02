'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from '@/lib/use-translation';
import { useAdminConfirm } from '@/components/admin/AdminConfirmProvider';

type ReviewStatus = 'approved' | 'hidden' | 'pending';

type ReviewRecord = {
    id: string;
    productId: string;
    author: string;
    rating: number;
    title: string;
    text: string;
    createdAt: string;
    helpful: number;
    status: ReviewStatus;
    adminReply?: { text: string; repliedAt: string };
};

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
        hidden: tl('admin.reviews.status.hidden', 'Скрыт', 'Hidden', 'Slepts'),
        pending: tl(
            'admin.reviews.status.pending',
            'На модерации',
            'Pending moderation',
            'Moderacija'
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
            const params = new URLSearchParams();
            if (status !== 'all') params.set('status', status);
            if (search.trim()) params.set('search', search.trim());

            const response = await fetch(`/api/admin/reviews?${params.toString()}`, {
                cache: 'no-store',
            });
            if (!response.ok) throw new Error('reviews-load-failed');

            const payload = (await response.json()) as { data?: { reviews?: ReviewRecord[] } };
            const nextReviews = payload.data?.reviews ?? [];
            setReviews(nextReviews);
            setSelectedReviewIds((prev) =>
                prev.filter((id) => nextReviews.some((review) => review.id === id))
            );
            setError('');
        } catch {
            setReviews([]);
            setSelectedReviewIds([]);
            setError(
                tl(
                    'admin.reviews.msg.loadFailed',
                    'Не удалось загрузить отзывы',
                    'Failed to load reviews',
                    'Neizdevas ieladet atsauksmes'
                )
            );
        } finally {
            setLoading(false);
        }
    }, [search, status, tl]);

    useEffect(() => {
        queueMicrotask(() => void loadReviews());
    }, [loadReviews]);

    const filteredClientSide = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return reviews;
        return reviews.filter((review) =>
            `${review.productId} ${review.author} ${review.title} ${review.text}`
                .toLowerCase()
                .includes(q)
        );
    }, [reviews, search]);

    const selectedCount = selectedReviewIds.length;
    const allVisibleSelected =
        filteredClientSide.length > 0 &&
        filteredClientSide.every((review) => selectedReviewIds.includes(review.id));

    const toggleReviewSelection = (reviewId: string, checked: boolean) => {
        setSelectedReviewIds((prev) => {
            if (checked) return Array.from(new Set([...prev, reviewId]));
            return prev.filter((id) => id !== reviewId);
        });
    };

    const toggleSelectAllVisible = (checked: boolean) => {
        setSelectedReviewIds((prev) => {
            const visibleIds = filteredClientSide.map((review) => review.id);
            if (checked) {
                return Array.from(new Set([...prev, ...visibleIds]));
            }
            return prev.filter((id) => !visibleIds.includes(id));
        });
    };

    const applyBulkStatus = async (nextStatus: ReviewStatus) => {
        if (selectedReviewIds.length === 0) return;

        setBulkSaving(true);
        try {
            const response = await fetch('/api/admin/reviews', {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ ids: selectedReviewIds, status: nextStatus }),
            });

            if (!response.ok) throw new Error('bulk-status-update-failed');

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
                    'Neizdevas veikt masveida statusa atjaunosanu'
                )
            );
        } finally {
            setBulkSaving(false);
        }
    };

    const removeSelectedReviews = async () => {
        if (selectedReviewIds.length === 0) return;

        const decision = await confirmAction({ title: tl(
                'admin.reviews.confirm.deleteSelected',
                'Удалить выбранные отзывы ({count}) без возможности восстановления?',
                'Delete selected reviews ({count}) permanently?',
                'Dzest atlasitas atsauksmes ({count}) neatgriezeniski?',
                { count: selectedReviewIds.length }
            ), description: 'Отзывы будут удалены без возможности восстановления.', affected: selectedReviewIds, confirmText: 'УДАЛИТЬ', requireReason: true, destructive: true });
        if (!decision.confirmed) return;

        setBulkSaving(true);
        try {
            const response = await fetch('/api/admin/reviews', {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ ids: selectedReviewIds }),
            });

            if (!response.ok) throw new Error('bulk-review-delete-failed');

            setMessage(
                tl(
                    'admin.reviews.msg.bulkDeleted',
                    'Удалено отзывов: {count}',
                    'Deleted reviews: {count}',
                    'Dzesu atsauksmju skaits: {count}',
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
                    'Neizdevas dzest atlasitas atsauksmes'
                )
            );
        } finally {
            setBulkSaving(false);
        }
    };

    const updateStatus = async (id: string, nextStatus: ReviewStatus) => {
        setSavingId(id);
        try {
            const response = await fetch('/api/admin/reviews', {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ id, status: nextStatus }),
            });

            if (!response.ok) throw new Error('status-update-failed');

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
                    'Neizdevas atjaunot atsauksmes statusu {id}',
                    { id }
                )
            );
        } finally {
            setSavingId(null);
        }
    };

    const removeReview = async (id: string) => {
        const decision = await confirmAction({ title: tl(
                'admin.reviews.confirm.deleteOne',
                'Удалить отзыв {id} без возможности восстановления?',
                'Delete review {id} permanently?',
                'Dzest atsauksmi {id} neatgriezeniski?',
                { id }
            ), description: 'Отзыв будет удалён без возможности восстановления.', affected: [id], requireReason: true, destructive: true });
        if (!decision.confirmed) return;

        setSavingId(id);
        try {
            const response = await fetch('/api/admin/reviews', {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ id }),
            });

            if (!response.ok) throw new Error('review-delete-failed');

            setMessage(
                tl(
                    'admin.reviews.msg.deletedOne',
                    'Отзыв {id} удален',
                    'Review {id} deleted',
                    'Atsauksme {id} izdzesta',
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
                    'Neizdevas dzest atsauksmi {id}',
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
            const res = await fetch('/api/admin/reviews', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, reply: text }),
            });
            if (!res.ok) throw new Error();
            setReplyExpanded((prev) => {
                const n = new Set(prev);
                n.delete(id);
                return n;
            });
            await loadReviews();
        } catch {
            setError(
                l(
                    'Не удалось сохранить ответ',
                    'Failed to save reply',
                    'Neizdevas saglabat atbildi'
                )
            );
        } finally {
            setReplySavingId(null);
        }
    };

    const removeReply = async (id: string) => {
        setReplySavingId(id);
        try {
            const res = await fetch('/api/admin/reviews', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, reply: null }),
            });
            if (!res.ok) throw new Error();
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
        } catch {
            setError(
                l('Не удалось удалить ответ', 'Failed to delete reply', 'Neizdevas dzest atbildi')
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
  return useAdminReviewsPageState()
}
