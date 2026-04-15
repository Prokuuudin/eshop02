"use client";
import React, { useEffect, useState } from 'react'
import { Button } from './ui/button'
import { useTranslation } from '@/lib/use-translation'

function formatTime(seconds: number) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':')
}

export default function Promo() {
  const { t } = useTranslation()
  // mock timer starting from 6 hours
  const [seconds, setSeconds] = useState<number>(6 * 3600)

  useEffect(() => {
    const t = setInterval(() => setSeconds((s) => Math.max(0, s - 1)), 1000)
    return () => clearInterval(t)
  }, [])

  return (
    <section className="promo my-8">
      <div className="w-full px-4">
        <div className="promo__inner rounded-lg overflow-hidden bg-gradient-to-r from-purple-600 to-indigo-600 text-white p-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="promo__content max-w-2xl">
            <h2 className="promo__title text-2xl font-bold">{t('promo.title')}</h2>
            <p className="promo__desc mt-2 text-sm opacity-90">{t('promo.discount')}</p>
          </div>

          <div className="promo__controls flex items-center gap-4">
            <div className="promo__timer text-lg font-mono bg-white/10 px-3 py-2 rounded">{formatTime(seconds)}</div>
            <Button className="promo__cta bg-white text-indigo-700">{t('promo.shopNow')}</Button>
          </div>
        </div>
      </div>
    </section>
  )
}
