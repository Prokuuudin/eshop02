import React from 'react'
import Link from 'next/link'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import type { Language } from '@/data/translations'
import { getServerContent } from '@/lib/server-translation'
import { localizePath } from '@/lib/i18n-routing'

export default async function FAQSection({ language }: { language: Language }): Promise<React.JSX.Element> {
  const { t } = await getServerContent(language)

  const col1 = [
    { id: 'faq-1', question: t('faq.site.q1'), answer: t('faq.site.a1') },
    { id: 'faq-2', question: t('faq.site.q2'), answer: t('faq.site.a2') },
    { id: 'faq-4', question: t('faq.site.q4'), answer: t('faq.site.a4') },
    { id: 'faq-5', question: t('faq.site.q5'), answer: t('faq.site.a5') },
    { id: 'faq-6', question: t('faq.site.q6'), answer: t('faq.site.a6') },
  ]

  const col2 = [
    { id: 'faq-7',  question: t('faq.site.q7'),  answer: t('faq.site.a7')  },
    { id: 'faq-8',  question: t('faq.site.q8'),  answer: t('faq.site.a8')  },
    { id: 'faq-10', question: t('faq.site.q10'), answer: t('faq.site.a10') },
    { id: 'faq-11', question: t('faq.site.q11'), answer: t('faq.site.a11') },
    { id: 'faq-12', question: t('faq.site.q12'), answer: t('faq.site.a12') },
  ]

  return (
    <section className="pb-6 pt-12 md:pt-16" id="faq">
      <div className="max-w-[1200px] mx-auto px-4">
        <div className="text-center">
          <h2 className="text-2xl font-semibold text-foreground mb-2">{t('faq.site.title')}</h2>
          <p className="text-sm text-muted-foreground mb-6">{t('faq.site.subtitle')}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="rounded-lg border bg-card px-4 md:px-6">
            <Accordion type="single" collapsible>
              {col1.map((item) => (
                <AccordionItem key={item.id} value={item.id} className="border-b last:border-b-0">
                  <AccordionTrigger className="text-foreground">{item.question}</AccordionTrigger>
                  <AccordionContent className="text-muted-foreground">{item.answer}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
          <div className="rounded-lg border bg-card px-4 md:px-6">
            <Accordion type="single" collapsible>
              {col2.map((item) => (
                <AccordionItem key={item.id} value={item.id} className="border-b last:border-b-0">
                  <AccordionTrigger className="text-foreground">{item.question}</AccordionTrigger>
                  <AccordionContent className="text-muted-foreground">
                    {item.answer}
                    {item.id === 'faq-8' && (
                      <Link href={localizePath('/return-policy', language)} className="block mt-2 text-primary underline underline-offset-2">
                        {t('faq.site.q8')}
                      </Link>
                    )}
                    {item.id === 'faq-12' && (
                      <Link href={localizePath('/stores', language)} className="block mt-2 text-primary underline underline-offset-2">
                        {t('stores.title')}
                      </Link>
                    )}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </div>
      </div>
    </section>
  )
}
