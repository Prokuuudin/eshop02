'use client';
import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import type { Product } from '../data/products';
import BestsellersSlider from './BestsellersSlider';
import Newsletter from './Newsletter';
import SaleBanner, { type PromoBanner } from './SaleBanner';
import Reveal from '@/components/ui/Reveal';
import { useTranslation } from '@/lib/use-translation';

export default function SaleSection(): React.ReactElement {
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

    if (!products.length && !banner) {
        return (
            <section id="sale" className="sale-section pt-6">
                <div className="mx-auto w-full max-w-[1440px] px-4">
                    <Newsletter compact />
                </div>
            </section>
        );
    }

    return (
        <section id="sale" className="sale-section pt-6">
            <div className="mx-auto w-full max-w-[1440px] px-4">
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
                </div>
                <div className="sale-section__feature-wrap relative mb-6">
                    {banner && (
                        <Image
                            src="/girl1.png"
                            alt=""
                            aria-hidden="true"
                            width={483}
                            height={176}
                            className="sale-section__girl pointer-events-none absolute bottom-0 -left-36 z-10 hidden h-44 w-auto max-w-none select-none md:block"
                        />
                    )}
                    <div className="sale-section__feature-row grid items-stretch overflow-hidden rounded-2xl border border-border bg-white shadow-sm lg:grid-cols-[minmax(0,3fr)_minmax(360px,2fr)]">
                        {banner && (
                            <div className="sale-section__banner relative h-full [&_.sale-banner]:h-full [&_.sale-banner]:rounded-none [&_.sale-banner]:border-0 [&_.sale-banner]:shadow-none">
                                <SaleBanner banner={banner} contentClassName="md:pl-40" />
                            </div>
                        )}
                        <div className={`sale-section__newsletter h-full [&_.newsletter__inner]:h-full ${banner ? 'border-t-2 border-border lg:border-l-2 lg:border-t-0' : 'lg:col-span-2'}`}>
                            <Newsletter compact embedded />
                        </div>
                    </div>
                </div>
            </div>
            {products.length > 0 && (
                <div className="mx-auto w-full max-w-[1440px] px-4">
                    <h3 className="sale-section__products-title text-xl font-semibold text-foreground mb-4">
                        {t('sale.allProducts')}{' '}
                        <span className="text-muted-foreground font-normal">({products.length})</span>
                    </h3>
                    <Reveal>
                        <BestsellersSlider products={products} />
                    </Reveal>
                </div>
            )}
        </section>
    );
}
