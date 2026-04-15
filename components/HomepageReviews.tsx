"use client";
import React from 'react'
import { useTranslation } from '@/lib/use-translation'

type Review = {
  id: string
  name: string
  rating: number
  text: string
}

const HOMEPAGE_REVIEWS: Review[] = [
  { id: 'r1', name: 'Екатерина', rating: 5, text: 'Отличная косметика, быстро доставили. Результат видно спустя неделю.' },
  { id: 'r2', name: 'Иван', rating: 4, text: 'Хорошее качество, консультанты помогли с выбором.' },
  { id: 'r3', name: 'Мария', rating: 5, text: 'Профессиональный уход дома — рекомендую.' },
  { id: 'r4', name: 'Алексей', rating: 4, text: 'Фены и оборудование отличного качества.' }
]

export default function HomepageReviews() {
  const { t } = useTranslation()

  return (
    <section className="reviews py-8">
      <div className="w-full px-4">
        <h2 className="reviews__title text-2xl font-semibold mb-4">{t('reviews.title')}</h2>

        <div className="reviews__grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {HOMEPAGE_REVIEWS.map((r) => (
            <article key={r.id} className="reviews__item p-4 bg-white rounded-lg border">
              <div className="reviews__name font-medium text-gray-900">{r.name}</div>
              <div className="reviews__rating text-yellow-500 mt-2">{r.rating} ★</div>
              <p className="reviews__text text-sm text-gray-600 mt-2">{r.text}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
