import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import girl3Image from '@/public/girl3.png';
import type { Language } from '@/data/translations';
import { getServerContent } from '@/lib/server-translation';
import { Button } from './ui/button';

export default async function AboutSection({ language }: { language: Language }): Promise<React.JSX.Element> {
  const { t } = await getServerContent(language);

  return (
    <section id="about" className="mx-auto w-full max-w-[1200px] px-4 pt-6">
      <h1 className="mb-4 text-center text-xl font-semibold text-foreground sm:mb-5 sm:text-2xl">
        {t('about.welcome.title')}
      </h1>
      <div className="grid grid-cols-1 items-stretch gap-8 md:grid-cols-[minmax(0,1fr)_minmax(220px,300px)_minmax(0,1fr)]">
        <div>
          <h2 className="mb-3 text-2xl font-bold text-foreground">{t('about.title')}</h2>
          <p className="mb-4 text-gray-700 dark:text-gray-300">{t('about.welcome.p1')}</p>
          <p className="mb-4 text-gray-700 dark:text-gray-300">{t('about.welcome.p2')}</p>
          <p className="text-gray-700 dark:text-gray-300">{t('about.welcome.p3')}</p>
        </div>

        <div className="relative mx-auto min-h-[320px] w-full max-w-[300px] self-stretch">
          <Image
            src="/girl4-about.png"
            alt=""
            fill
            sizes="(min-width: 768px) 300px, min(300px, 100vw)"
            className="object-contain object-bottom"
          />
        </div>

        <div className="md:self-start">
          <h2 className="mb-2 text-xl font-semibold text-foreground">{t('about.why.title')}</h2>
          <ul className="space-y-1.5 text-sm leading-snug text-gray-700 dark:text-gray-300 sm:text-base">
            {['about.why.item1', 'about.why.item2', 'about.why.item3', 'about.why.item4', 'about.why.item5'].map((key) => (
              <li key={key} className="flex gap-1.5">
                <span aria-hidden="true">&#10003;</span>
                <span>{t(key)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="relative left-1/2 mt-10 grid w-[calc(100vw-2rem)] max-w-[1408px] -translate-x-1/2 items-center overflow-visible rounded-xl bg-emerald-600 md:h-[112px] md:grid-cols-[minmax(0,1fr)_210px_230px] md:gap-2 dark:bg-emerald-700">
        <div className="flex h-full items-center px-5 py-1 sm:px-8 md:py-0">
          <div className="max-w-5xl text-base leading-tight text-white/90">
            <h2 className="whitespace-nowrap text-center text-2xl font-bold text-amber-300">{t('stores.title')}</h2>
            <p>{t('about.storesInfo')}</p>
            {t('about.storesInfo2') && <p>{t('about.storesInfo2')}</p>}
          </div>
        </div>

        <Link href={language === 'ru' ? '/stores' : `/${language}/stores`} className="mx-5 mb-3 inline-flex justify-self-start md:mx-0 md:mb-0 md:justify-self-center">
          <Button
            variant="outline"
            className="rounded-full border-white bg-transparent px-6 text-base uppercase tracking-wide text-white hover:bg-white/10 hover:text-white"
          >
            {t('about.storesButton')}
          </Button>
        </Link>

        <div className="relative ml-auto h-[216px] w-full max-w-[230px] self-end md:h-[112px]">
          <Image
            src={girl3Image}
            alt=""
            width={216}
            height={194}
            sizes="(min-width: 768px) 216px, min(216px, 100vw)"
            className="absolute -right-12 bottom-0 h-[194px] w-auto max-w-none object-contain object-bottom"
          />
        </div>
      </div>
    </section>
  );
}
