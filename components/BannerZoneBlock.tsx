'use client';
import React from 'react';
import SaleBanner, { type PromoBanner } from './SaleBanner';
import BannerCarousel from './BannerCarousel';
import { splitBannersByPlacement } from '@/lib/banner-placement';

export default function BannerZoneBlock({ banners }: { banners: PromoBanner[] }): React.ReactElement | null {
    if (!banners.length) return null;
    const { listBanners, carouselBanners } = splitBannersByPlacement(banners);

    return (
        <div className="mx-auto w-full max-w-[1440px] px-4 py-6 space-y-4">
            {listBanners.length > 0 && (
                <div className="space-y-4">
                    {listBanners.map((item) => <SaleBanner key={item.id} banner={item} />)}
                </div>
            )}
            {carouselBanners.length > 0 && <BannerCarousel banners={carouselBanners} />}
        </div>
    );
}
