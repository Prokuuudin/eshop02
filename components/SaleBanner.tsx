'use client';
import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/lib/use-translation';
import { resolveLocaleText } from '@/lib/locale-text';

export type PromoBanner = {
    id: string;
    type?: 'sale' | 'image' | 'video';
    title: string;
    subtitle: string;
    image: string;
    link: string;
    ctaLabel: string;
    ctaStyle: 'primary' | 'secondary' | 'outline';
    bgColor: string;
    textColor: 'light' | 'dark';
    placement?: 'list' | 'carousel';
};

const CTA_VARIANT = {
    primary: 'default',
    secondary: 'secondary',
    outline: 'outline'
} as const;

export default function SaleBanner({ banner, contentClassName = '' }: { banner: PromoBanner; contentClassName?: string }): React.ReactElement {
    const { language } = useTranslation();
    const isLight = banner.textColor === 'light';
    const title = resolveLocaleText(banner.title, language);
    const subtitle = resolveLocaleText(banner.subtitle, language);
    const ctaLabel = resolveLocaleText(banner.ctaLabel, language);

    if (banner.type === 'video' && banner.image) {
        return (
            <div className="sale-banner overflow-hidden rounded-2xl border border-border bg-black">
                <video key={banner.image} src={banner.image} controls muted playsInline preload="metadata"
                    aria-label={title || undefined} className="block h-auto w-full">
                    <track kind="captions" />
                </video>
                {banner.link && <div className="bg-card p-3">
                    <Button asChild variant={CTA_VARIANT[banner.ctaStyle] ?? 'default'}>
                        <Link href={banner.link}>{ctaLabel || ({ ru: 'Перейти', en: 'Open link', lv: 'Atvērt saiti' }[language])}</Link>
                    </Button>
                </div>}
            </div>
        );
    }

    if (banner.type === 'image' && banner.image) {
        const image = (
            <div className="sale-banner overflow-hidden rounded-2xl border border-border">
                <Image src={banner.image} alt={title} width={1440} height={480} unoptimized
                    className="block h-auto w-full" style={{ width: '100%', height: 'auto' }} />
            </div>
        );
        return banner.link ? <Link href={banner.link} aria-label={title || undefined} className="sale-banner-link block">{image}</Link> : image;
    }

    const card = (
        <div
            className={`sale-banner sale-banner--${banner.textColor} relative overflow-hidden rounded-2xl border border-border shadow-sm`}
            style={{ backgroundColor: banner.bgColor }}
        >
            {banner.image && (
                <>
                    <Image
                        unoptimized
                        fill
                        src={banner.image}
                        alt=""
                        aria-hidden="true"
                        className="sale-banner__image absolute inset-0 h-full w-full object-cover"
                    />
                    <div
                        className={`sale-banner__overlay absolute inset-0 ${
                            isLight
                                ? 'bg-gradient-to-r from-black/60 via-black/40 to-black/10'
                                : 'bg-gradient-to-r from-white/85 via-white/60 to-white/20'
                        }`}
                    />
                </>
            )}

            <div className={`sale-banner__content relative flex flex-col gap-4 p-5 sm:p-7 lg:flex-row lg:items-center lg:justify-between ${contentClassName}`}>
                <div className="sale-banner__text max-w-3xl">
                    <h3
                        className={`sale-banner__title text-xl font-bold sm:text-2xl ${
                            isLight ? 'text-white' : 'text-gray-900'
                        }`}
                    >
                        {title}
                    </h3>
                    {subtitle && (
                        <p
                            className={`sale-banner__subtitle mt-1 text-sm sm:text-base ${
                                isLight ? 'text-white/85' : 'text-gray-700'
                            }`}
                        >
                            {subtitle}
                        </p>
                    )}
                </div>

                {ctaLabel && banner.link && (
                    <Button
                        asChild
                        size="lg"
                        variant={CTA_VARIANT[banner.ctaStyle] ?? 'default'}
                        className="sale-banner__cta w-full lg:w-auto"
                    >
                        <Link href={banner.link}>{ctaLabel}</Link>
                    </Button>
                )}
            </div>
        </div>
    );

    if (banner.link && !ctaLabel) {
        return (
            <Link href={banner.link} className="sale-banner-link block" style={{ textDecoration: 'none' }}>
                {card}
            </Link>
        );
    }

    return card;
}
