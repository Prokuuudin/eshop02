'use client';
import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { useTranslation } from '@/lib/use-translation';
import { resolveLocaleText } from '@/lib/locale-text';
import { resolveBannerLink } from '@/lib/banner-link';
import type { PromoBanner } from './SaleBanner';

const PROMO_LABEL = { ru: 'Акция', en: 'Promotion', lv: 'Akcija' } as const;
const OPEN_LABEL = { ru: 'Подробнее', en: 'Learn more', lv: 'Uzzināt vairāk' } as const;

/** A CMS banner from the 'catalog' zone, sized like a ProductCard grid cell. */
export default function CatalogPromoTile({ banner }: { banner: PromoBanner }): React.ReactElement {
    const { language } = useTranslation();
    const link = resolveBannerLink(banner.link, language);
    const title = resolveLocaleText(banner.title, language);
    const subtitle = resolveLocaleText(banner.subtitle, language);
    const ctaLabel = resolveLocaleText(banner.ctaLabel, language) || OPEN_LABEL[language];
    const isLight = banner.textColor === 'light';
    const isMediaOnly = (banner.type === 'image' || banner.type === 'video') && !!banner.image;

    return (
        <Card
            className={`catalog-promo-tile group relative flex h-full min-h-[340px] sm:min-h-[370px] lg:min-h-[280px] min-w-0 flex-col overflow-hidden border border-border shadow-sm transition-shadow focus-within:ring-2 focus-within:ring-ring lg:hover:shadow-xl ${isMediaOnly ? 'bg-card' : ''}`}
            style={isMediaOnly ? undefined : { backgroundColor: banner.bgColor || undefined }}
        >
            {banner.type === 'video' && banner.image ? (
                <video
                    key={banner.image}
                    src={banner.image}
                    autoPlay
                    muted
                    loop
                    playsInline
                    preload="metadata"
                    aria-label={title || undefined}
                    className="catalog-promo-tile__media absolute inset-0 h-full w-full object-cover"
                />
            ) : banner.image ? (
                <Image
                    unoptimized
                    fill
                    src={banner.image}
                    alt={isMediaOnly ? title : ''}
                    aria-hidden={isMediaOnly ? undefined : true}
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                    className="catalog-promo-tile__media object-cover transition-transform group-hover:scale-105"
                    loading="lazy"
                />
            ) : null}

            {!isMediaOnly && banner.image && (
                <div
                    className={`catalog-promo-tile__overlay absolute inset-0 ${
                        isLight
                            ? 'bg-gradient-to-t from-black/75 via-black/40 to-black/10'
                            : 'bg-gradient-to-t from-white/90 via-white/65 to-white/20'
                    }`}
                />
            )}

            {!isMediaOnly && (
                <div className="catalog-promo-tile__content relative flex flex-1 flex-col gap-2 p-4">
                    <Badge className="catalog-promo-tile__badge w-fit bg-red-600 text-white">{PROMO_LABEL[language]}</Badge>
                    <div className="mt-auto">
                        <h3 className={`catalog-promo-tile__title text-lg font-bold leading-snug ${isLight ? 'text-white' : 'text-gray-900'}`}>
                            {title}
                        </h3>
                        {subtitle && (
                            <p className={`catalog-promo-tile__subtitle mt-1 text-sm ${isLight ? 'text-white/85' : 'text-gray-700'}`}>
                                {subtitle}
                            </p>
                        )}
                    </div>
                    {link && (
                        <span className={`catalog-promo-tile__cta text-sm font-semibold underline-offset-4 group-hover:underline ${isLight ? 'text-white' : 'text-primary'}`}>
                            {ctaLabel} →
                        </span>
                    )}
                </div>
            )}

            {/* Stretched link: the whole tile is one focusable link, like ProductCard. */}
            {link && (
                <Link
                    href={link}
                    aria-label={title || ctaLabel}
                    className="catalog-promo-tile__link absolute inset-0 z-10 focus:outline-none"
                />
            )}
        </Card>
    );
}
