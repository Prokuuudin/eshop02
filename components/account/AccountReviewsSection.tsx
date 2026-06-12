'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Star, MessageSquare, ChevronRight } from 'lucide-react';
import { useReviews } from '@/lib/reviews-store';
import { getCurrentUser } from '@/lib/auth';
import { useTranslation } from '@/lib/use-translation';

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
    const allReviews = useReviews((s) => s.reviews);
    const [userName, setUserName] = useState<string | null>(null);

    useEffect(() => {
        const user = getCurrentUser();
        setUserName(user?.name ?? user?.email ?? null);
    }, []);

    const userReviews = useMemo(() => {
        if (!userName) return [];
        return allReviews
            .filter((r) => r.author === userName)
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }, [allReviews, userName]);

    if (userReviews.length === 0) return null;

    const avgRating =
        Math.round((userReviews.reduce((s, r) => s + r.rating, 0) / userReviews.length) * 10) / 10;

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
