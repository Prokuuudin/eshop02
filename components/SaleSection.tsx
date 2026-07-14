'use client';
import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import type { Product } from '../data/products';
import BestsellersSlider from './BestsellersSlider';
import SaleBanner, { type PromoBanner } from './SaleBanner';
import { useTranslation } from '@/lib/use-translation';

export default function SaleSection() {
    const { t } = useTranslation();
    const [products, setProducts] = useState<Product[]>([]);
    const [banner, setBanner] = useState<PromoBanner | null>(null);

    useEffect(() => {
        fetch('/api/products/sale')
            .then((r) => r.json())
            .then((d) => { if (d.products?.length) setProducts(d.products) })
            .catch(() => {});
        fetch('/api/banners?type=sale')
            .then((r) => r.json())
            .then((d) => { if (d.banners?.length) setBanner(d.banners[0]) })
            .catch(() => {});
    }, []);

    if (!products.length && !banner) return null;

    return (
        <section className="sale-section py-8">
            <div className="w-full px-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                        <div>
                            <h2 className="text-2xl font-semibold text-foreground">
                                {t('sale.title')}
                            </h2>
                            <p className="text-sm text-muted-foreground">{t('sale.subtitle')}</p>
                        </div>
                        <Link
                            href="/catalog"
                            className="inline-flex w-full sm:w-auto justify-center items-center px-3 py-2 min-h-[44px] rounded bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-100 transition-colors"
                            style={{ textDecoration: 'none', fontWeight: 500 }}
                        >
                            {t('cart.goToCatalog')}
                        </Link>
                    </div>
                    <div id="sale-slider-arrows" className="hidden sm:flex gap-2" />
                </div>
                {banner && (
                    <div className="sale-section__banner relative mb-4 md:mt-16">
                        <Image
                            src="/girl1.png"
                            alt=""
                            aria-hidden="true"
                            width={483}
                            height={176}
                            className="sale-section__girl pointer-events-none select-none absolute bottom-0 -left-36 z-10 hidden h-44 w-auto max-w-none md:block"
                        />
                        <SaleBanner banner={banner} contentClassName="md:pl-40" />
                    </div>
                )}
                {products.length > 0 && (
                    <BestsellersSlider arrowsContainerId="sale-slider-arrows" products={products} />
                )}
            </div>
        </section>
    );
}
