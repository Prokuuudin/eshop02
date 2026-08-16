'use client';
import React from 'react';
import Link from 'next/link';
import type { Product } from '../data/products';
import { useTranslation } from '@/lib/use-translation';
import { Button } from '@/components/ui/button';

// Swiper is heavy (~130 KB) and this section renders below the fold after a client
// fetch — defer its bundle out of the initial homepage JS.
import BestsellersSlider from './BestsellersSlider';

import Reveal from '@/components/ui/Reveal'

export default function BestsellersSection({ products }: { products: Product[] }): React.ReactElement | null {
    const { t } = useTranslation();

    if (!products.length) return null;

    return (
        <section className="bestsellers pt-12 md:pt-16">
            <div className="mx-auto w-full max-w-[1440px] px-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                        <h2 className="text-2xl font-semibold text-foreground">
                            {t('products.bestSellers')}
                        </h2>
                        <Button
                            asChild
                            size="cta"
                            variant="secondary"
                            className="bestsellers__catalog-cta w-full sm:w-auto"
                        >
                            <Link href="/catalog">{t('cart.goToCatalog')}</Link>
                        </Button>
                    </div>
                </div>
                <Reveal>
                    <BestsellersSlider products={products} />
                </Reveal>
            </div>
        </section>
    );
}
