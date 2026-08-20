'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Eye, ChevronRight } from 'lucide-react';
import { useViewedProducts } from '@/lib/viewed-products-store';
import { useTranslation } from '@/lib/use-translation';
import type { Product } from '@/data/products';

export const AccountViewedProductsWidget: React.FC = () => {
    const { t } = useTranslation();
    const getRecentViews = useViewedProducts((s) => s.getRecentViews);
    const [products] = useState<Product[]>(() => getRecentViews(4));

    return (
        <div className="flex flex-col rounded-2xl border border-sky-100 bg-sky-50 p-5 shadow-sm dark:border-sky-900 dark:bg-sky-950/30">
            <div className="mb-4 flex items-center justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/80 text-sky-500 shadow-sm dark:bg-gray-950/40 dark:text-sky-400">
                    <Eye className="h-5 w-5" />
                </div>
            </div>

            <p className="text-sm font-semibold text-foreground">
                {t('account.recentlyViewed', 'Недавно просматривали')}
            </p>

            {products.length > 0 ? (
                <div className="mt-3 flex-1 space-y-2">
                    {products.map((product) => (
                        <Link
                            key={product.id}
                            href={`/product/${product.id}`}
                            className="flex items-center gap-3 rounded-xl border border-transparent p-1.5 hover:border-sky-200 hover:bg-white/60 dark:hover:border-sky-800 dark:hover:bg-gray-900/50 transition-all group"
                        >
                            <div className="product-image-surface flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-sky-100 p-1.5 dark:border-sky-900">
                                <Image
                                    src={product.images?.[0] ?? product.image ?? '/hero-placeholder.svg'}
                                    alt={product.title}
                                    width={56}
                                    height={56}
                                    sizes="56px"
                                    className="h-full w-full object-contain"
                                />
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-xs font-medium text-gray-800 dark:text-gray-200 group-hover:text-sky-700 dark:group-hover:text-sky-300 transition-colors">
                                    {product.title}
                                </p>
                                {typeof product.price === 'number' && Number.isFinite(product.price) && (
                                    <p className="text-xs text-sky-600 dark:text-sky-400 font-semibold mt-0.5">
                                        {product.price.toFixed(2)} €
                                    </p>
                                )}
                            </div>
                            <ChevronRight className="h-3.5 w-3.5 text-gray-400 group-hover:text-sky-500 transition-colors shrink-0" />
                        </Link>
                    ))}
                </div>
            ) : (
                <p className="mt-2 text-sm text-muted-foreground flex-1">
                    {t('account.recentlyViewedEmpty', 'Здесь появятся просмотренные товары')}
                </p>
            )}

            {products.length > 0 && (
                <Link
                    href="/catalog"
                    className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-sky-600 dark:text-sky-400"
                >
                    {t('account.browseCatalog', 'В каталог')}
                    <ChevronRight className="h-3.5 w-3.5" />
                </Link>
            )}
        </div>
    );
};
