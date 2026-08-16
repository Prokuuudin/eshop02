import Image from 'next/image'
import Link from 'next/link'
import type { JSX } from 'react'
import type { Language } from '@/data/translations'
import { Button } from '@/components/ui/button'
import { getServerContent } from '@/lib/server-translation'
import { MoveRight } from 'lucide-react'

export default async function Hero({ language }: { language: Language }): Promise<JSX.Element> {
  const { t, resolveImageSrc } = await getServerContent(language)
  const heroSrc = resolveImageSrc('/hero.jpg')

  return (
    <div className="mx-auto w-full max-w-[1440px] px-4">
      <section id="home" className="hero relative isolate overflow-hidden rounded-xl aspect-[4/5] sm:aspect-[16/9] lg:aspect-[3393/1080] lg:max-h-[560px]">
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

        <div className="hero__content relative h-full flex max-w-3xl flex-col items-start justify-start gap-4 py-10 text-left sm:py-12">
          <h1
            className="hero__title font-extrabold tracking-[0.015em] text-foreground drop-shadow-sm"
            style={{ fontSize: 'clamp(1.5rem, 7vw, 3rem)', lineHeight: 1.25 }}
          >
            {t('hero.title')}
          </h1>

          <p className="hero__subtitle mt-8 text-sm sm:text-base text-foreground/80 drop-shadow-sm">
            {t('hero.subtitle')}
          </p>

          <Button asChild size="cta" className="hero__cta group mt-8">
            <Link href="/catalog">
              {t('hero.cta')}
              <MoveRight
                className="!h-3.5 !w-5 translate-y-px transition-transform duration-200 group-hover:translate-x-0.5"
                strokeWidth={1.5}
                aria-hidden="true"
              />
            </Link>
          </Button>
        </div>
      </section>
    </div>
  )
}
