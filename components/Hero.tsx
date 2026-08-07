import Image from 'next/image'
import type { JSX } from 'react'
import type { Language } from '@/data/translations'
import { getServerContent } from '@/lib/server-translation'

export default async function Hero({ language }: { language: Language }): Promise<JSX.Element> {
  const { t, resolveImageSrc } = await getServerContent(language)
  const heroSrc = resolveImageSrc('/hero.jpg')

  return (
    <section id="home" className="hero relative isolate rounded-xl overflow-hidden aspect-[4/5] sm:aspect-[16/9] lg:aspect-[3393/1080] lg:max-h-[560px] max-w-[1440px] mx-auto">
      <Image
        src={heroSrc}
        alt={t('hero.alt')}
        fill
        priority
        // Optimise the LCP image (resize + modern format); only skip for inline data URIs,
        // which the image optimiser cannot process.
        unoptimized={heroSrc.startsWith('data:')}
        sizes="100vw"
        className="hero__bg object-cover object-[80%_center] lg:object-center -z-10"
      />
      <div className="hero__overlay absolute inset-0 -z-10 bg-gradient-to-r from-background from-0% via-background/45 via-35% to-transparent to-60%" />

      <div className="hero__content relative h-full flex max-w-3xl flex-col items-start justify-start gap-4 px-4 py-10 text-left sm:px-6 sm:py-12 lg:px-8">
        <h1
          className="hero__title text-3xl font-extrabold tracking-[0.015em] text-foreground drop-shadow-sm sm:text-4xl md:text-5xl"
          style={{ lineHeight: 1.25 }}
        >
          {t('hero.title')}
        </h1>

        <p className="hero__subtitle text-sm sm:text-base text-foreground/80 drop-shadow-sm">
          {t('hero.subtitle')}
        </p>
      </div>
    </section>
  )
}
