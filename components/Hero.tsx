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
    <div className="mx-auto w-full max-w-[1440px] px-0 sm:px-4">
      <section id="home" className="hero relative isolate overflow-hidden rounded-none aspect-[4/5] sm:rounded-xl sm:aspect-[16/9] lg:aspect-[3393/1080] lg:max-h-[560px]">
        <Image
          src={heroSrc}
          alt={t('hero.alt')}
          fill
          priority
          // Optimise the LCP image (resize + modern format); only skip for inline data URIs,
          // which the image optimiser cannot process.
          unoptimized={heroSrc.startsWith('data:')}
          quality={90}
          // Mobile crop shows only ~25% of the source width (object-position 90%); request a
          // proportionally wider image so that slice isn't upscaled from an under-sized download.
          sizes="(max-width: 639px) 400vw, 100vw"
          className="hero__bg object-cover object-[90%_center] sm:object-[80%_center] lg:object-center -z-10"
        />
        <div className="hero__overlay absolute inset-0 -z-10 hidden bg-gradient-to-r from-background from-0% via-background/45 via-35% to-transparent to-60% sm:block" />

        <div className="hero__content relative h-full flex max-w-3xl flex-col items-start justify-between pb-1 pt-6 text-left sm:justify-start sm:gap-4 sm:py-12">
          <div className="hero__title-wrap relative w-full py-2 px-4 sm:contents sm:p-0">
            <div className="absolute inset-0 -z-10 bg-gradient-to-r from-background from-0% via-background/45 via-35% to-transparent to-60% [mask-image:linear-gradient(to_bottom,transparent,black_24px,black_calc(100%_-_24px),transparent_100%)] [-webkit-mask-image:linear-gradient(to_bottom,transparent,black_24px,black_calc(100%_-_24px),transparent_100%)] sm:hidden" />
            <h1
              className="hero__title font-extrabold tracking-[0.015em] text-foreground drop-shadow-sm"
              style={{ fontSize: 'clamp(1.375rem, 6.5vw, 3rem)', lineHeight: 1.25 }}
            >
              {t('hero.title')}
            </h1>
          </div>

          <div className="hero__content-bottom relative flex w-full flex-col items-start gap-3 py-3 px-4 sm:contents sm:p-0">
            <div className="absolute inset-0 -z-10 bg-gradient-to-r from-background from-0% via-background/60 via-50% to-background/25 to-100% [mask-image:linear-gradient(to_top,transparent,black_24px,black_calc(100%_-_24px),transparent_100%)] [-webkit-mask-image:linear-gradient(to_top,transparent,black_24px,black_calc(100%_-_24px),transparent_100%)] sm:hidden" />
            <p className="hero__subtitle text-sm sm:text-base text-foreground/80 drop-shadow-sm">
              {t('hero.subtitle')}
            </p>

            <Button asChild size="cta" className="hero__cta group">
              <Link href="/catalog">
                {t('hero.cta')}
                <MoveRight
                  className="!h-3.5 !w-5 translate-y-0.5 transition-transform duration-200 group-hover:translate-x-0.5"
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  )
}
