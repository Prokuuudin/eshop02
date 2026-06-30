'use client'

import Image from 'next/image'
import { useTranslation } from '@/lib/use-translation'
import { useSiteContent } from '@/lib/use-site-content'

export default function Hero() {
  const { t } = useTranslation()
  const { resolveImageSrc } = useSiteContent()

  return (
    <section id="home" className="hero relative rounded-xl py-10 sm:py-12 px-4 sm:px-6 lg:px-8 bg-card overflow-hidden">
      <div className="hero__bg absolute inset-0 -z-10 bg-gradient-to-r from-pink-50 via-white to-primary/5 dark:from-gray-900 dark:via-gray-900 dark:to-primary/10" />

      <div className="w-full flex flex-col-reverse lg:flex-row lg:items-stretch gap-6 sm:gap-8 px-1 sm:px-4">
        <div className="hero__content flex-1 text-center lg:text-left lg:flex lg:flex-col lg:justify-center">
          <h1 className="hero__title text-3xl sm:text-4xl md:text-5xl font-extrabold leading-tight text-foreground">
            {t('hero.title')}
          </h1>

          <p className="hero__subtitle mt-4 text-sm sm:text-base text-muted-foreground max-w-xl mx-auto lg:mx-0">
            {t('hero.subtitle')}
          </p>

        </div>

        <div className="hero__image w-full lg:w-1/2 relative h-[50vh] min-h-[320px] lg:h-auto overflow-hidden">
          <Image src={resolveImageSrc('/hero.jpg')} alt={t('hero.alt')} fill sizes="(max-width: 1024px) 100vw, 50vw" className="object-cover" />
        </div>
      </div>
    </section>
  )
}
