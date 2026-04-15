'use client'

import Image from 'next/image'
import { useTranslation } from '@/lib/use-translation'

export default function Hero() {
  const { t } = useTranslation()

  return (
    <section id="home" className="hero relative rounded-xl py-10 sm:py-12 px-4 sm:px-6 lg:px-8 bg-white dark:bg-gray-900 overflow-hidden">
      <div className="hero__bg absolute inset-0 -z-10 bg-gradient-to-r from-pink-50 via-white to-indigo-50 dark:from-gray-900 dark:via-gray-900 dark:to-indigo-950/40" />

      <div className="w-full flex flex-col-reverse lg:flex-row items-center gap-6 sm:gap-8 px-1 sm:px-4">
        <div className="hero__content flex-1 text-center lg:text-left">
          <h1 className="hero__title text-3xl sm:text-4xl md:text-5xl font-extrabold leading-tight text-gray-900 dark:text-gray-100">
            {t('hero.title')}
          </h1>

          <p className="hero__subtitle mt-4 text-sm sm:text-base text-gray-600 dark:text-gray-300 max-w-xl mx-auto lg:mx-0">
            {t('hero.subtitle')}
          </p>

        </div>

        <div className="hero__image w-full lg:w-1/2 flex justify-center lg:justify-end">
          <div className="w-56 h-56 sm:w-80 sm:h-80 md:w-96 md:h-72 relative rounded-lg overflow-hidden shadow-lg">
            <Image src="/hero-placeholder.svg" alt={t('hero.alt')} fill sizes="(max-width: 768px) 50vw, 33vw" className="object-cover" />
          </div>
        </div>
      </div>
    </section>
  )
}
