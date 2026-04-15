"use client";
import React from 'react';
import Image from 'next/image';
import { useTranslation } from '@/lib/use-translation';

export default function Benefits() {
  const { t } = useTranslation();
  const ITEMS = [
    { id: 'b1', title: t('benefits.original'), desc: t('benefits.certified'), icon: '/icons/original.svg' },
    { id: 'b2', title: t('benefits.delivery'), desc: t('benefits.fast'), icon: '/icons/delivery.svg' },
    { id: 'b3', title: t('benefits.quality'), desc: t('benefits.return'), icon: '/icons/quality.svg' },
    { id: 'b4', title: t('benefits.support'), desc: t('benefits.consult'), icon: '/icons/support.svg' }
  ];
  return (
    <section className="benefits py-8">
      <div className="w-full px-4">
        <h2 className="benefits__title text-2xl font-semibold mb-6 text-gray-900 dark:text-gray-100">{t('benefits.title')}</h2>
        <div className="benefits__grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {ITEMS.map((it) => (
            <article key={it.id} className="benefits__item p-4 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm">
              <div className="benefits__icon mb-3 w-12 h-12">
                <Image src={it.icon} alt="" width={48} height={48} className="object-contain" />
              </div>
              <h3 className="benefits__item-title font-medium text-gray-900 dark:text-gray-100">{it.title}</h3>
              <p className="benefits__item-desc text-sm text-gray-600 dark:text-gray-300 mt-1">{it.desc}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
