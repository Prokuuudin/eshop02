"use client";

import { Button } from '@/components/ui/button'
import { useTranslation } from '@/lib/use-translation'

const RETAIL_STORE_URL = 'https://hairshop.lv'

export default function HomeRetailBanner() {
  const { t } = useTranslation()

  return (
    <section className="px-4 py-4 sm:py-6">
      <div className="mx-auto w-full max-w-7xl overflow-hidden rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 via-white to-rose-50 p-5 shadow-sm dark:border-amber-900/60 dark:from-amber-950/40 dark:via-gray-900 dark:to-rose-950/30 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-700 dark:text-amber-300">
              {t('home.retailBanner.eyebrow')}
            </p>
            <h2 className="mt-2 text-2xl font-bold text-gray-900 dark:text-gray-100 sm:text-3xl">
              {t('home.retailBanner.title')}
            </h2>
            <p className="mt-3 text-sm leading-6 text-gray-700 dark:text-gray-300 sm:text-base">
              {t('home.retailBanner.description')}
            </p>
          </div>

          <Button asChild size="lg" className="w-full lg:w-auto">
            <a href={RETAIL_STORE_URL} target="_blank" rel="noopener noreferrer">
              {t('home.retailBanner.button')}
            </a>
          </Button>
        </div>
      </div>
    </section>
  )
}