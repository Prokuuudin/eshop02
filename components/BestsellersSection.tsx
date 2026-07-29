'use client';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import type { Product } from '../data/products';
import { useTranslation } from '@/lib/use-translation';

// Swiper is heavy (~130 KB) and this section renders below the fold after a client
// fetch — defer its bundle out of the initial homepage JS.
const BestsellersSlider = dynamic(() => import('./BestsellersSlider'), { ssr: false });

import Reveal from '@/components/ui/Reveal'

export default function BestsellersSection(): React.ReactElement | null {
    const { t } = useTranslation();
    const [products, setProducts] = useState<Product[]>([]);

    useEffect(() => {
        fetch('/api/products/bestsellers')
            .then((r) => r.json())
            .then((d) => { if (d.products?.length) setProducts(d.products) })
            .catch(() => {});
    }, []);

    if (!products.length) return null;

    return (
        <section className="bestsellers py-8">
            <div className="mx-auto w-full max-w-[1200px] px-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                        <h2 className="text-2xl font-semibold text-foreground">
                            {t('products.bestSellers')}
                        </h2>
                        <Link
                            href="/catalog"
                            className="inline-flex w-full sm:w-auto justify-center items-center px-3 py-2 min-h-[44px] rounded bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-100 transition-colors"
                            style={{ textDecoration: 'none', fontWeight: 500 }}
                        >
                            {t('cart.goToCatalog')}
                        </Link>
                    </div>
                </div>
                <Reveal>
                    <BestsellersSlider products={products} />
                </Reveal>
            </div>
        </section>
    );
}
