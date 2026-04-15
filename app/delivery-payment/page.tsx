"use client";

import React from "react";
import { useTranslation } from "@/lib/use-translation";
import { getSiteUrl } from '@/lib/site-url';

export default function DeliveryPaymentPage() {
  const { t } = useTranslation();
  const siteUrl = getSiteUrl()

  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: t('deliveryPayment.deliveryTitle'),
        acceptedAnswer: {
          '@type': 'Answer',
          text: [
            t('deliveryPayment.courier'),
            t('deliveryPayment.pickup'),
            t('deliveryPayment.regions')
          ].join('. ')
        }
      },
      {
        '@type': 'Question',
        name: t('deliveryPayment.paymentTitle'),
        acceptedAnswer: {
          '@type': 'Answer',
          text: [
            t('deliveryPayment.card'),
            t('deliveryPayment.cash'),
            t('deliveryPayment.online')
          ].join('. ')
        }
      }
    ],
    url: `${siteUrl}/delivery-payment`
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
      <section className="max-w-6xl mx-auto py-10 px-4 text-gray-900 dark:text-gray-100">
        <h1 className="text-3xl font-bold mb-10 text-center text-gray-900 dark:text-gray-100">{t('deliveryPayment.title')}</h1>
        <div className="flex flex-col md:flex-row gap-8">
          {/* Оплата */}
          <div className="flex-1 bg-slate-50 dark:bg-gray-800 rounded-lg p-6 shadow">
            <h2 className="text-2xl font-semibold mb-4 text-gray-900 dark:text-gray-100">{t('deliveryPayment.paymentTitle')}</h2>
            {/* Пошаговая инструкция по оплате */}
            <ol className="list-decimal pl-6 space-y-2 text-gray-700 dark:text-gray-300 mb-4">
              {[1,2,3,4,5].map(i => (
                i === 3 ? (
                  <li key={i}>
                    {t(`deliveryPayment.paymentSteps.${i}`)}
                    <ul className="list-disc pl-8 space-y-1 text-gray-700 dark:text-gray-300 mt-2">
                      <li>{t('deliveryPayment.card')}</li>
                      <li>{t('deliveryPayment.cash')}</li>
                      <li>{t('deliveryPayment.online')}</li>
                    </ul>
                  </li>
                ) : (
                  <li key={i}>{t(`deliveryPayment.paymentSteps.${i}`)}</li>
                )
              ))}
            </ol>
            <h3 className="text-lg font-bold mt-6 mb-2">{t('deliveryPayment.paymentProblemsTitle') || 'Что делать, если возникли проблемы с оплатой?'}</h3>
            <ul className="list-disc pl-6 space-y-1 text-gray-600 dark:text-gray-300 text-sm">
              {[1,2,3].map(i => (
                <li key={i}>{t(`deliveryPayment.paymentHelp.${i}`)}</li>
              ))}
            </ul>
            <div className="mt-4 text-xs text-gray-500">{t('deliveryPayment.paymentNote')}</div>
          </div>

          {/* Доставка */}
          <div className="flex-1 bg-slate-50 dark:bg-gray-800 rounded-lg p-6 shadow">
            <h2 className="text-2xl font-semibold mb-4 text-gray-900 dark:text-gray-100">{t('deliveryPayment.deliveryTitle')}</h2>
            {/* Пошаговая инструкция по доставке */}
            <ol className="list-decimal pl-6 space-y-2 text-gray-700 dark:text-gray-300 mb-4">
              {[1,2,3,4,5].map(i => (
                i === 3 ? (
                  <li key={i}>
                    {t(`deliveryPayment.deliverySteps.${i}`)}
                    <ul className="list-disc pl-8 space-y-1 text-gray-700 dark:text-gray-300 mt-2">
                      <li>{t('deliveryPayment.courier')}</li>
                      <li>{t('deliveryPayment.pickup')}</li>
                      <li>{t('deliveryPayment.regions')}</li>
                    </ul>
                  </li>
                ) : (
                  <li key={i}>{t(`deliveryPayment.deliverySteps.${i}`)}</li>
                )
              ))}
            </ol>
            <h3 className="text-lg font-bold mt-6 mb-2">{t('deliveryPayment.deliveryProblemsTitle') || 'Что делать, если возникли проблемы с доставкой?'}</h3>
            <ul className="list-disc pl-6 space-y-1 text-gray-600 dark:text-gray-300 text-sm">
              {[1,2,3].map(i => (
                <li key={i}>{t(`deliveryPayment.deliveryHelp.${i}`)}</li>
              ))}
            </ul>
            <div className="mt-4 text-xs text-gray-500">{t('deliveryPayment.deliveryNote')}</div>
          </div>
        </div>
        {/* Советы и примечания */}
        <div className="mt-10 text-gray-600 dark:text-gray-400 text-sm border-t pt-4">
          <ul className="list-disc pl-6 space-y-1">
            {[1,2,3].map(i => (
              <li key={i}>{t(`deliveryPayment.tips.${i}`)}</li>
            ))}
            <li>{t('deliveryPayment.note')}</li>
          </ul>
        </div>
      </section>
    </>
  );
}
