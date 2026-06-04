'use client'

import React from 'react'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { useTranslation } from '@/lib/use-translation'

export default function FAQSection() {
  const { t } = useTranslation()

  const col1 = [
    { id: 'faq-1', question: t('faq.site.q1'), answer: t('faq.site.a1') },
    { id: 'faq-2', question: t('faq.site.q2'), answer: t('faq.site.a2') },
    { id: 'faq-3', question: t('faq.site.q3'), answer: t('faq.site.a3') },
    { id: 'faq-4', question: t('faq.site.q4'), answer: t('faq.site.a4') },
    { id: 'faq-5', question: t('faq.site.q5'), answer: t('faq.site.a5') },
    { id: 'faq-6', question: t('faq.site.q6'), answer: t('faq.site.a6') },
  ]

  const col2 = [
    { id: 'faq-7',  question: t('faq.site.q7'),  answer: t('faq.site.a7')  },
    { id: 'faq-8',  question: t('faq.site.q8'),  answer: t('faq.site.a8')  },
    { id: 'faq-9',  question: t('faq.site.q9'),  answer: t('faq.site.a9')  },
    { id: 'faq-10', question: t('faq.site.q10'), answer: t('faq.site.a10') },
    { id: 'faq-11', question: t('faq.site.q11'), answer: t('faq.site.a11') },
    { id: 'faq-12', question: t('faq.site.q12'), answer: t('faq.site.a12') },
  ]

  return (
    <section className="py-10" id="faq">
      <div className="max-w-6xl mx-auto px-4">
        <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-2">{t('faq.site.title')}</h2>
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-6">{t('faq.site.subtitle')}</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="rounded-lg border bg-white dark:bg-gray-900 px-4 md:px-6">
            <Accordion type="single" collapsible>
              {col1.map((item) => (
                <AccordionItem key={item.id} value={item.id}>
                  <AccordionTrigger className="text-gray-900 dark:text-gray-100">{item.question}</AccordionTrigger>
                  <AccordionContent className="text-gray-600 dark:text-gray-300">{item.answer}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
          <div className="rounded-lg border bg-white dark:bg-gray-900 px-4 md:px-6">
            <Accordion type="single" collapsible>
              {col2.map((item) => (
                <AccordionItem key={item.id} value={item.id}>
                  <AccordionTrigger className="text-gray-900 dark:text-gray-100">{item.question}</AccordionTrigger>
                  <AccordionContent className="text-gray-600 dark:text-gray-300">{item.answer}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </div>
      </div>
    </section>
  )
}
