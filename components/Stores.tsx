'use client';
import React from 'react';
import Image from 'next/image';
import { useTranslation } from '@/lib/use-translation';
import { stores } from '@/data/stores';

export default function Stores() {
    const { t, language } = useTranslation();
    // Используем только импортируемый stores

    return (
        <section className="stores py-8" id="stores">
            <div className="w-full px-4">
                <div className="mb-4">
                    <h2 className="stores__title text-2xl font-semibold">{t('stores.title')}</h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {stores.map((store) => (
                        <div
                            key={store.id}
                            className="store-card p-4 border rounded-lg flex flex-col items-center bg-slate-50 dark:bg-gray-800 shadow overflow-hidden"
                        >
                            <Image
                                src={`/stores/${store.id}.jpg`}
                                alt={store.name[language]}
                                width={320}
                                height={180}
                                className="mb-2 rounded w-full h-40 object-cover"
                            />
                            <h3 className="text-lg font-bold mb-1">{store.name[language]}</h3>
                            <p className="text-sm text-gray-600 mb-1">{store.address[language]}</p>
                            <p className="text-sm text-gray-600 mb-1">
                                {t('stores.phone') ?? 'Телефон'}: {store.phone}
                            </p>
                            <div className="text-sm text-gray-600">
                                {t('stores.hours') ?? 'Время работы'}:
                                <ul className="ml-4 list-disc">
                                    {store.hours[language].map((h, i) => (
                                        <li key={i}>{h}</li>
                                    ))}
                                </ul>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}
