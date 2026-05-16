'use client';
import React from 'react';
import Image from 'next/image';
import { useTranslation } from '@/lib/use-translation';
import { useSiteContent } from '@/lib/use-site-content';

export default function Benefits() {
    // Секция бенефитов с фиксированным содержанием на русском
    const { t } = useTranslation();
    const BENEFITS = [
        {
            icon: '/icons/delivery.svg',
            text: t('benefits.deliveryFree', 'Бесплатная доставка от 100 евро'),
        },
        {
            icon: '/icons/support.svg',
            text: t('benefits.consultationMain', 'Профессиональная консультация 7 дней в неделю'),
        },
        {
            icon: '/icons/quality.svg',
            text: t('benefits.processingFast', 'Быстрая обработка заказов — в течение 24 часов'),
        },
        {
            icon: '/icons/quality.svg',
            text: t('benefits.inStock', 'Более 10 000 товаров на складе'),
        },
        {
            icon: '/icons/original.svg',
            text: t('benefits.brands100', '100+ оригинальных мировых брендов'),
        },
    ];
    return (
        <section className="benefits py-8">
            <div className="w-full px-4">
                <div className="benefits__grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 items-stretch">
                    {BENEFITS.map((item, idx) => (
                        <article
                            key={idx}
                            className="benefits__item p-4 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm flex items-center gap-4"
                        >
                            <div className="benefits__icon w-10 h-10 shrink-0">
                                <Image
                                    src={item.icon}
                                    alt=""
                                    width={40}
                                    height={40}
                                    className="object-contain"
                                />
                            </div>
                            <h3 className="benefits__item-title font-medium text-gray-900 dark:text-gray-100 text-base">
                                {item.text}
                            </h3>
                        </article>
                    ))}
                </div>
            </div>
        </section>
    );
}
