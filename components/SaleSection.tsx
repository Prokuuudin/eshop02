'use client';
import React from 'react';
import Image from 'next/image';
import type { Product } from '../data/products';
import BestsellersSlider from './BestsellersSlider';
import Newsletter from './Newsletter';
import SaleBanner, { type PromoBanner } from './SaleBanner';
import BannerCarousel from './BannerCarousel';
import Reveal from '@/components/ui/Reveal';
import { useTranslation } from '@/lib/use-translation';
import { splitBannersByPlacement } from '@/lib/banner-placement';
import { useAuthStore } from '@/lib/auth-store';

export default function SaleSection({ products, banners }: { products: Product[]; banners: PromoBanner[] }): React.ReactElement {
    const { t } = useTranslation();
    const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
    const banner = banners.find((item) => item.type === 'sale' && item.placement !== 'carousel') ?? null;
    const restBanners = banners.filter((item) => item !== banner);
    const { listBanners, carouselBanners } = splitBannersByPlacement(restBanners);

    if (!products.length && !banners.length) {
        return (
            <section id="sale" className="sale-section pt-6">
                <div className="mx-auto w-full max-w-[1440px] px-4">
                    <Newsletter compact registration />
                </div>
            </section>
        );
    }

    return (
        <section id="sale" className="sale-section pt-6">
            <div className="mx-auto w-full max-w-[1440px] px-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                    <div>
                        <h2 className="text-2xl font-semibold text-foreground">
                            {t('sale.title')}
                        </h2>
                        <p className="text-sm text-muted-foreground">{t('sale.subtitle')}</p>
                    </div>
                </div>
                <div className="sale-section__feature-wrap relative pt-8 mb-6">
                    {banner && banner.type !== 'image' && (
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
                                <SaleBanner banner={{ ...banner, link: isAuthenticated ? banner.link : '/auth/register' }} contentClassName="md:pl-40" />
                            </div>
                        )}
                        <div className={`sale-section__newsletter h-full [&_.newsletter__inner]:h-full ${banner ? 'border-t-2 border-border lg:border-l-2 lg:border-t-0' : 'lg:col-span-2'}`}>
                            <Newsletter compact embedded registration />
                        </div>
                    </div>
                </div>
                {listBanners.length > 0 && (
                    <div className="space-y-4 mb-6">
                        {listBanners.map((item) => <SaleBanner key={item.id} banner={item} />)}
                    </div>
                )}
                {carouselBanners.length > 0 && (
                    <div className="mb-6">
                        <BannerCarousel banners={carouselBanners} scrollMode={carouselBanners[0]?.scrollMode} />
                    </div>
                )}
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
