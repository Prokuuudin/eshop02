import React from 'react';
import Image from 'next/image';
import { stores } from '@/data/stores';
import type { Language } from '@/data/translations';
import { getServerContent } from '@/lib/server-translation';

export default async function Stores({ language }: { language: Language }): Promise<React.JSX.Element> {
    const { t } = await getServerContent(language);

    return (
        <section className="stores py-8" id="stores">
            <div className="w-full px-4">
                <div className="mb-4">
                    <h2 className="stores__title text-2xl font-semibold">{t('stores.title')}</h2>
                </div>
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
                    {stores.map((store) => (
                        <article
                            key={store.id}
                            id={store.id}
                            className="store-card p-4 border rounded-lg flex flex-col items-center bg-slate-50 dark:bg-gray-800 shadow overflow-hidden"
                        >
                            <Image
                                src={`/stores/${store.id}.jpg`}
                                alt={t(`stores.${store.id}.name`)}
                                width={320}
                                height={180}
                                className="mb-2 rounded w-full h-40 object-cover"
                            />
                            <h3 className="text-lg font-bold mb-1">{t(`stores.${store.id}.name`)}</h3>
                            <p className="text-sm text-gray-600 mb-1">{store.address.lv}</p>
                            <p className="text-sm text-gray-600 mb-1">
                                {t('stores.phone') ?? 'Телефон'}: {t(`stores.${store.id}.phone`)}
                            </p>
                            <div className="text-sm text-gray-600">
                                {t('stores.hours') ?? 'Время работы'}:
                                <ul className="ml-4 list-disc">
                                    <li>{t(`stores.${store.id}.hours1`)}</li>
                                    <li>{t(`stores.${store.id}.hours2`)}</li>
                                    <li>{t(`stores.${store.id}.hours3`)}</li>
                                </ul>
                            </div>
                        </article>
                    ))}
                </div>
            </div>
        </section>
    );
}
