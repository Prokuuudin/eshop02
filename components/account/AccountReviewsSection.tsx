'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Star, MessageSquare, ChevronRight } from 'lucide-react';
import { useTranslation } from '@/lib/use-translation';

type ReviewStatus = 'approved' | 'hidden' | 'pending';

type ReviewItem = {
    id: string;
    productId: string;
    author: string;
    rating: number;
    title: string;
    text: string;
    createdAt: string;
    helpful: number;
    status: ReviewStatus;
};

function StarRow({ rating }: { rating: number }) {
    return (
        <span className="inline-flex items-center gap-0.5">
            {[1, 2, 3, 4, 5].map((s) => (
                <Star
                    key={s}
                    className={`h-3 w-3 ${s <= rating ? 'fill-amber-400 text-amber-400' : 'fill-gray-200 text-gray-200 dark:fill-gray-700 dark:text-gray-700'}`}
                />
            ))}
        </span>
    );
}

export const AccountReviewsSection: React.FC = () => {
    const { t } = useTranslation();
    const [userReviews, setUserReviews] = useState<ReviewItem[]>([]);

    useEffect(() => {
        let cancelled = false;
        void (async () => {
            try {
                const response = await fetch('/api/reviews/my', { cache: 'no-store' });
                if (!response.ok) return;
                const payload = (await response.json()) as { data?: { reviews?: ReviewItem[] } };
                if (!cancelled) setUserReviews(payload.data?.reviews ?? []);
            } catch {
                // Секция просто не показывается, если отзывы не загрузились.
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    if (userReviews.length === 0) return null;

    const avgRating =
        Math.round((userReviews.reduce((s, r) => s + r.rating, 0) / userReviews.length) * 10) / 10;

    const statusBadge = (status: ReviewStatus) => {
        if (status === 'pending') {
            return (
                <span className="shrink-0 rounded-full bg-yellow-100 px-2 py-0.5 text-[10px] font-medium text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200">
                    {t('account.reviews.pending', 'На модерации')}
                </span>
            );
        }
        if (status === 'hidden') {
            return (
                <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                    {t('account.reviews.hidden', 'Скрыт')}
                </span>
            );
        }
        return null;
    };

    return (
        <section className="rounded-2xl border border-amber-100 bg-white shadow-sm dark:border-amber-900/50 dark:bg-gray-900">
            <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 px-5 py-4">
                <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-500 dark:bg-amber-950/40 dark:text-amber-400">
                        <MessageSquare className="h-4 w-4" />
                    </div>
                    <div>
                        <h3 className="text-sm font-semibold text-foreground">
                            {t('account.reviews.title', 'Мои отзывы')}
                        </h3>
                        <div className="mt-0.5 flex items-center gap-2">
                            <StarRow rating={Math.round(avgRating)} />
                            <span className="text-xs text-gray-400 dark:text-gray-500">
                                {avgRating} · {userReviews.length} {t('account.reviews.count', 'отзывов')}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {userReviews.slice(0, 3).map((review) => {
                    const date = new Date(review.createdAt);
                    return (
                        <div key={review.id} className="px-5 py-4">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <StarRow rating={review.rating} />
                                        <p className="text-xs font-semibold text-gray-800 dark:text-gray-200 truncate">
                                            {review.title}
                                        </p>
                                        {statusBadge(review.status)}
                                    </div>
                                    <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                                        {review.text}
                                    </p>
                                </div>
                                <Link
                                    href={`/product/${review.productId}`}
                                    className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400 hover:underline"
                                >
                                    {t('account.reviews.goToProduct', 'Товар')}
                                    <ChevronRight className="h-3 w-3" />
                                </Link>
                            </div>
                            <p className="mt-1.5 text-xs text-gray-400 dark:text-gray-500">
                                {date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                            </p>
                        </div>
                    );
                })}
            </div>

            {userReviews.length > 3 && (
                <div className="border-t border-gray-100 dark:border-gray-800 px-5 py-3">
                    <span className="text-xs text-gray-400 dark:text-gray-500">
                        {t('account.reviews.andMore', 'И ещё')} {userReviews.length - 3}{' '}
                        {t('account.reviews.more', 'отзывов')}
                    </span>
                </div>
            )}
        </section>
    );
};
