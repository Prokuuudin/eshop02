'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Heart, ChevronRight } from 'lucide-react';
import { useWishlist } from '@/lib/wishlist-store';
import { useTranslation } from '@/lib/use-translation';

export const AccountWishlistWidget: React.FC = () => {
    const { t } = useTranslation();
    const syncWishlistScope = useWishlist((s) => s.syncWishlistScope);
    const items = useWishlist((s) => s.items);
    const hydrated = React.useSyncExternalStore(
        () => () => undefined,
        () => true,
        () => false
    );

    useEffect(() => {
        syncWishlistScope();
    }, [syncWishlistScope]);

    const preview = hydrated ? items.slice(0, 4) : [];
    const total = hydrated ? items.length : 0;

    return (
        <Link
            href="/wishlist"
            className="group flex flex-col rounded-2xl border border-pink-100 bg-pink-50 p-5 shadow-sm hover:shadow-md hover:border-pink-200 dark:border-pink-900 dark:bg-pink-950/30 dark:hover:border-pink-800 transition-all"
        >
            <div className="mb-4 flex items-center justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/80 text-pink-500 shadow-sm dark:bg-gray-950/40 dark:text-pink-400">
                    <Heart className="h-5 w-5" />
                </div>
                <ChevronRight className="h-4 w-4 text-gray-400 group-hover:text-pink-500 dark:group-hover:text-pink-400 transition-colors" />
            </div>

            <p className="text-sm font-semibold text-foreground">
                {t('wishlist.title', 'Список желаний')}
            </p>

            {preview.length > 0 ? (
                <div className="mt-2 flex-1">
                    <div className="flex gap-1.5 flex-wrap">
                        {preview.map((item) => (
                            <div
                                key={item.id}
                                className="h-12 w-12 rounded-lg border border-pink-100 bg-white overflow-hidden dark:border-pink-900 dark:bg-gray-900"
                            >
                                <Image
                                    src={item.images?.[0] ?? item.image ?? '/hero-placeholder.svg'}
                                    alt={item.title}
                                    width={48}
                                    height={48}
                                    className="h-full w-full object-cover"
                                />
                            </div>
                        ))}
                        {total > 4 && (
                            <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-pink-100 bg-white text-xs font-semibold text-pink-500 dark:border-pink-900 dark:bg-gray-900 dark:text-pink-400">
                                +{total - 4}
                            </div>
                        )}
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                        {total} {t('wishlist.itemsCount', 'товаров')}
                    </p>
                </div>
            ) : (
                <p className="mt-2 text-sm text-muted-foreground flex-1">
                    {t('wishlist.emptyHint', 'Добавляйте понравившиеся товары')}
                </p>
            )}

            {total > 0 && (
                <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-pink-600 dark:text-pink-400">
                    {t('wishlist.openList', 'Открыть список')}
                    <ChevronRight className="h-3.5 w-3.5" />
                </span>
            )}
        </Link>
    );
};
