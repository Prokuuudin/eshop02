import React from 'react';
import Image from 'next/image';
import { Store } from 'lucide-react';
import { stores } from '@/data/stores';
import type { Language } from '@/data/translations';
import { getServerContent } from '@/lib/server-translation';

export default async function Stores({ language }: { language: Language }): Promise<React.JSX.Element> {
    const { t, resolveImageSrc } = await getServerContent(language);

    return (
        <section className="stores py-10 text-foreground" id="stores">
            <div className="w-full px-4">
                <h1 className="stores__title mb-10 flex items-center justify-center gap-3 text-center text-3xl font-bold text-foreground">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand text-brand-foreground dark:bg-white dark:text-brand">
                        <Store size={26} aria-hidden="true" />
                    </span>
                    {t('stores.title')}
                </h1>
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
                    {stores.map((store) => (
                        <article
                            key={store.id}
                            id={store.id}
                            className="store-card p-4 border rounded-lg flex flex-col items-center bg-slate-50 dark:bg-gray-800 shadow overflow-hidden"
                        >
                            <Image
                                src={resolveImageSrc(`/stores/${store.id}.jpg`)}
                                alt={t(`stores.${store.id}.name`)}
                                width={320}
                                height={180}
                                className="mb-2 rounded w-full h-40 object-cover"
                            />
                            <h3 className="text-lg font-bold mb-1">{t(`stores.${store.id}.name`)}</h3>
                            <p className="mb-1 text-sm text-slate-700 dark:text-gray-300">{t(`stores.${store.id}.address`, store.address[language])}</p>
                            <p className="mb-1 text-sm text-slate-700 dark:text-gray-300">
                                {t('stores.phone') ?? 'Телефон'}: {t(`stores.${store.id}.phone`)}
                            </p>
                            <div className="text-sm text-slate-700 dark:text-gray-300">
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
