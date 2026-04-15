'use client'

import React from 'react'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { useTranslation } from '@/lib/use-translation'

export default function FAQSection() {
  const { t } = useTranslation()

  const faqItems = [
    { id: 'faq-1', question: t('faq.site.q1'), answer: t('faq.site.a1') },
    { id: 'faq-2', question: t('faq.site.q2'), answer: t('faq.site.a2') },
    { id: 'faq-3', question: t('faq.site.q3'), answer: t('faq.site.a3') },
    { id: 'faq-4', question: t('faq.site.q4'), answer: t('faq.site.a4') },
    { id: 'faq-5', question: t('faq.site.q5'), answer: t('faq.site.a5') },
    { id: 'faq-6', question: t('faq.site.q6'), answer: t('faq.site.a6') }
  ]

  return (
    <section className="py-10" id="faq">
      <div className="max-w-3xl mx-auto">
        <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-2">{t('faq.site.title')}</h2>
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-6">{t('faq.site.subtitle')}</p>

        <div className="rounded-lg border bg-white dark:bg-gray-900 px-4 md:px-6">
          <Accordion type="single" collapsible>
            {faqItems.map((item) => (
              <AccordionItem key={item.id} value={item.id}>
                <AccordionTrigger className="text-gray-900 dark:text-gray-100">{item.question}</AccordionTrigger>
                <AccordionContent className="text-gray-600 dark:text-gray-300">{item.answer}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </section>
  )
}
