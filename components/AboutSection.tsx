import { Button } from './ui/button';
import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import type { Language } from '@/data/translations';
import { getServerContent } from '@/lib/server-translation';

export default async function AboutSection({ language }: { language: Language }): Promise<React.JSX.Element> {
  const { t } = await getServerContent(language);
  return (
    <section id="about" className="mx-auto w-full max-w-[1200px] px-4 pt-6">
      <h1 className="mb-4 text-center text-xl font-semibold text-foreground sm:mb-5 sm:text-2xl">{t('about.title')}</h1>
      <div className="grid grid-cols-1 items-center gap-8 md:grid-cols-[minmax(0,1fr)_minmax(260px,340px)_minmax(0,1fr)]">
        <div>
          <h2 className="text-2xl font-bold mb-3 text-foreground">{t('about.welcome.title')}</h2>
          <p className="text-gray-700 dark:text-gray-300 mb-4">
            {t('about.welcome.p1')}
          </p>
          <p className="text-gray-700 dark:text-gray-300 mb-4">
            {t('about.welcome.p2')}
          </p>
          <p className="text-gray-700 dark:text-gray-300 mb-6">
            {t('about.storesInfo')}
          </p>
          <Link href={language === 'ru' ? '/stores' : `/${language}/stores`}>
            <Button variant="default" size="lg">
              {t('about.storesButton')}
            </Button>
          </Link>
        </div>
        <div className="relative mx-auto h-[440px] w-full max-w-[340px] sm:h-[520px]">
          <Image
            src="/girl3-silhouette.png"
            alt=""
            fill
            sizes="(min-width: 768px) 340px, min(340px, 100vw)"
            className="object-contain object-center"
          />
        </div>
        <div>
          <h2 className="text-2xl font-bold mb-3 text-foreground">{t('about.why.title')}</h2>
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
