"use client"

import React from 'react'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { useTranslation } from '@/lib/use-translation'

export default function AboutPage() {
  const { t } = useTranslation()

  const reasons = [
    t('about.why.item1'),
    t('about.why.item2'),
    t('about.why.item3'),
    t('about.why.item4'),
    t('about.why.item5')
  ]

  return (
    <main className="w-full px-4 py-12">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-4xl font-bold mb-6 text-gray-900 dark:text-gray-100">{t('about.title')}</h1>

        <section className="mb-8">
          <h2 className="text-2xl font-bold mb-3 text-gray-900 dark:text-gray-100">{t('about.welcome.title')}</h2>
          <p className="text-gray-700 dark:text-gray-300 mb-4">
            {t('about.welcome.p1')}
          </p>
          <p className="text-gray-700 dark:text-gray-300">
            {t('about.welcome.p2')}
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-bold mb-3 text-gray-900 dark:text-gray-100">{t('about.why.title')}</h2>
          <ul className="space-y-2 text-gray-700 dark:text-gray-300">
            {reasons.map((reason, index) => (
              <li key={`about-reason-${index}`}>✓ {reason}</li>
            ))}
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-bold mb-3 text-gray-900 dark:text-gray-100">{t('about.contacts.title')}</h2>
          <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
            <p className="mb-2 text-gray-900 dark:text-gray-100">📧 <strong>{t('about.contacts.email')}:</strong> support@beautyshop.ru</p>
            <p className="mb-2 text-gray-900 dark:text-gray-100">📱 <strong>{t('about.contacts.phone')}:</strong> +7 (999) 888-77-66</p>
            <p className="mb-2 text-gray-900 dark:text-gray-100">💬 <strong>Telegram:</strong> @beautyshop_support</p>
            <p className="text-gray-900 dark:text-gray-100">🕐 <strong>{t('about.contacts.hours')}:</strong> {t('about.contacts.hoursValue')}</p>
          </div>
        </section>

        <div className="text-center">
          <Link href="/catalog">
            <Button>{t('about.backToCatalog')}</Button>
          </Link>
        </div>
      </div>
    </main>
  )
}
