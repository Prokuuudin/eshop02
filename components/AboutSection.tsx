"use client"

import { Button } from './ui/button';

import React from 'react';
import { useTranslation } from '@/lib/use-translation';

export default function AboutSection() {
  const { t } = useTranslation();
  return (
    <section className="max-w-6xl mx-auto w-full px-4 py-10 mb-10">
      <h1 className="text-4xl font-bold mb-6 text-gray-900 dark:text-gray-100">{t('about.title')}</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div>
          <h2 className="text-2xl font-bold mb-3 text-gray-900 dark:text-gray-100">{t('about.welcome.title')}</h2>
          <p className="text-gray-700 dark:text-gray-300 mb-4">
            {t('about.welcome.p1')}
          </p>
          <p className="text-gray-700 dark:text-gray-300 mb-4">
            {t('about.welcome.p2')}
          </p>
          <p className="text-gray-700 dark:text-gray-300 mb-6">
            {t('about.storesInfo')}
          </p>
          <a href="/stores">
            <Button variant="default" size="lg">
              {t('about.storesButton')}
            </Button>
          </a>
        </div>
        <div>
          <h2 className="text-2xl font-bold mb-3 text-gray-900 dark:text-gray-100">{t('about.why.title')}</h2>
          <ul className="space-y-2 text-gray-700 dark:text-gray-300">
            {['about.why.item1','about.why.item2','about.why.item3','about.why.item4','about.why.item5'].map((key) => (
              <li key={key}>✓ {t(key)}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}