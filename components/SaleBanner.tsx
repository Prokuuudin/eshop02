'use client';
import React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/lib/use-translation';
import { resolveLocaleText } from '@/lib/locale-text';

export type PromoBanner = {
    id: string;
    title: string;
    subtitle: string;
    image: string;
    link: string;
    ctaLabel: string;
    ctaStyle: 'primary' | 'secondary' | 'outline';
    bgColor: string;
    textColor: 'light' | 'dark';
};

const CTA_VARIANT = {
    primary: 'default',
    secondary: 'secondary',
    outline: 'outline'
} as const;

export default function SaleBanner({ banner, contentClassName = '' }: { banner: PromoBanner; contentClassName?: string }) {
    const { language } = useTranslation();
    const isLight = banner.textColor === 'light';
    const title = resolveLocaleText(banner.title, language);
    const subtitle = resolveLocaleText(banner.subtitle, language);
    const ctaLabel = resolveLocaleText(banner.ctaLabel, language);

    const card = (
        <div
            className={`sale-banner sale-banner--${banner.textColor} relative overflow-hidden rounded-2xl border border-border shadow-sm`}
            style={{ backgroundColor: banner.bgColor }}
        >
            {banner.image && (
                <>
                    <img
                        src={banner.image}
                        alt=""
                        aria-hidden="true"
                        loading="lazy"
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

    if (banner.link && !banner.ctaLabel) {
        return (
            <Link href={banner.link} className="sale-banner-link block" style={{ textDecoration: 'none' }}>
                {card}
            </Link>
        );
    }

    return card;
}
