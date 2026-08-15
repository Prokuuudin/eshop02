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
    <section id="about" className="mx-auto w-full max-w-[1200px] px-4 pt-12 md:pt-16">
      <h1 className="mb-4 text-center text-xl font-semibold text-foreground sm:mb-5 sm:text-2xl">
        {t('about.welcome.title')}
      </h1>
      <div className="grid grid-cols-1 items-stretch gap-5 sm:gap-8 md:grid-cols-[minmax(0,1fr)_minmax(220px,300px)_minmax(0,1fr)]">
        <div>
          <h2 className="mb-3 text-2xl font-bold text-foreground">{t('about.title')}</h2>
          <p className="mb-4 text-gray-700 dark:text-gray-300">{t('about.welcome.p1')}</p>
          <p className="mb-4 text-gray-700 dark:text-gray-300">{t('about.welcome.p2')}</p>
          <p className="text-gray-700 dark:text-gray-300">{t('about.welcome.p3')}</p>
        </div>

        <div className="relative mx-auto min-h-[240px] w-full max-w-[240px] self-stretch sm:min-h-[320px] sm:max-w-[300px]">
          <Image
            src="/girl4-about.png"
            alt=""
            fill
            sizes="(min-width: 640px) 300px, 240px"
            className="object-contain object-bottom"
          />
        </div>

        <div className="md:self-start">
          <h2 className="mb-2 text-xl font-semibold text-foreground">{t('about.why.title')}</h2>
          <ul className="space-y-1.5 text-sm leading-snug text-gray-700 dark:text-gray-300 sm:text-base">
            {['about.why.item1', 'about.why.item2', 'about.why.item3', 'about.why.item4', 'about.why.item5'].map((key) => (
              <li key={key} className="flex gap-1.5">
                <span aria-hidden="true" className="shrink-0 font-black text-brand">&#10003;</span>
                <span>{t(key)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="relative left-1/2 mt-7 grid w-[calc(100vw-2rem)] max-w-[1408px] -translate-x-1/2 items-center overflow-hidden rounded-xl bg-emerald-600 sm:mt-10 lg:h-[112px] lg:grid-cols-[minmax(0,1fr)_210px_230px] lg:gap-2 lg:overflow-visible dark:bg-emerald-700">
        <div className="flex h-full items-center px-5 pb-2 pt-4 sm:px-8 lg:py-0">
          <div className="max-w-5xl text-base leading-tight text-white/90">
            <h2 className="text-center text-xl font-bold text-amber-300 sm:text-2xl lg:whitespace-nowrap">{t('stores.title')}</h2>
            <p>{t('about.storesInfo')}</p>
          </div>
        </div>

        <Link href={language === 'ru' ? '/stores' : `/${language}/stores`} className="mx-5 mb-2 inline-flex justify-self-center lg:mx-0 lg:mb-0">
          <Button
            variant="outline"
            className="rounded-full border-white bg-transparent px-6 text-base uppercase tracking-wide text-white hover:bg-white/10 hover:text-white"
          >
            {t('about.storesButton')}
          </Button>
        </Link>

        <div className="relative ml-auto h-[140px] w-full max-w-[180px] self-end sm:h-[174px] sm:max-w-[216px] lg:h-[112px] lg:max-w-[230px]">
          <Image
            src={girl3Image}
            alt=""
            width={216}
            height={194}
            sizes="(min-width: 1024px) 216px, min(194px, 100vw)"
            className="absolute right-0 bottom-0 h-[140px] w-auto max-w-none object-contain object-bottom sm:h-[174px] lg:-right-12 lg:h-[194px]"
          />
        </div>
      </div>
    </section>
  );
}
