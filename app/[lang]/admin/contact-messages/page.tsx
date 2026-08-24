'use client'

import { useCallback, useEffect, useState } from 'react'
import { Check, Mail, MessageSquareText, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/lib/use-translation'
import { reportAdminPartial } from '@/lib/admin-ui-errors'

type Filter = 'unanswered' | 'answered' | 'all'
type ContactMessage = {
  id: string
  name: string
  email: string
  subject: string
  message: string
  createdAt: string
  answeredAt: string | null
}

export default function ContactMessagesPage(): React.ReactElement {
  const { language } = useTranslation()
  const [filter, setFilter] = useState<Filter>('unanswered')
  const [messages, setMessages] = useState<ContactMessage[] | null>(null)
  const [total, setTotal] = useState(0)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const l = useCallback((ru: string, en: string, lv: string) => language === 'ru' ? ru : language === 'lv' ? lv : en, [language])
  const locale = language === 'ru' ? 'ru-RU' : language === 'lv' ? 'lv-LV' : 'en-US'

  const loadMessages = useCallback(async () => {
    try {
      const response = await fetch(`/api/admin/contact-messages?status=${filter}&limit=100`, { cache: 'no-store' })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const data = await response.json() as { messages?: ContactMessage[]; total?: number }
      setMessages(data.messages ?? [])
      setTotal(data.total ?? 0)
    } catch {
      setMessages([])
      reportAdminPartial(l('Не удалось загрузить обращения.', 'Could not load requests.', 'Neizdevas ieladet pieprasijumus.'), 'Contact messages')
    }
  }, [filter, l])

  useEffect(() => {
    // The state updates happen only after the asynchronous request resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadMessages()
  }, [loadMessages])

  const setAnswered = async (id: string, answered: boolean) => {
    setUpdatingId(id)
    try {
      const response = await fetch('/api/admin/contact-messages', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, answered }),
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      await loadMessages()
    } catch {
      reportAdminPartial(l('Не удалось изменить статус.', 'Could not update status.', 'Neizdevas mainit statusu.'), 'Contact messages')
    } finally {
      setUpdatingId(null)
    }
  }

  const labels: Record<Filter, string> = {
    unanswered: l('Без ответа', 'Unanswered', 'Neatbildeti'),
    answered: l('Отвеченные', 'Answered', 'Atbildeti'),
    all: l('Все', 'All', 'Visi'),
  }

  return (
    <main className="py-4 text-foreground">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold"><MessageSquareText className="h-7 w-7 text-rose-600" />{l('Запросы покупателей', 'Customer requests', 'Klientu pieprasijumi')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{l('Обращения из контактной формы сайта', 'Messages from the website contact form', 'Zinojumi no vietnes kontaktformas')}</p>
        </div>
        <span className="text-sm text-muted-foreground">{l('Найдено', 'Found', 'Atrasti')}: {total}</span>
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        {(Object.keys(labels) as Filter[]).map((value) => (
          <Button key={value} type="button" size="sm" variant={filter === value ? 'default' : 'outline'} onClick={() => { setMessages(null); setFilter(value) }}>{labels[value]}</Button>
        ))}
      </div>

      {messages === null ? (
        <div className="rounded-xl border border-border bg-card py-16 text-center text-muted-foreground">{l('Загрузка…', 'Loading…', 'Ielade…')}</div>
      ) : messages.length === 0 ? (
        <div className="rounded-xl border border-border bg-card py-16 text-center text-muted-foreground">{l('Обращений в этой категории нет', 'No requests in this category', 'Saja kategorija nav pieprasijumu')}</div>
      ) : (
        <div className="space-y-3">
          {messages.map((item) => (
            <article key={item.id} className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-semibold">{item.subject}</h2>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${item.answeredAt ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'}`}>{item.answeredAt ? labels.answered : labels.unanswered}</span>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{item.name} · <a className="hover:underline" href={`mailto:${item.email}`}>{item.email}</a> · {new Date(item.createdAt).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' })}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button asChild size="sm"><a href={`mailto:${item.email}?subject=${encodeURIComponent(`Re: ${item.subject}`)}`}><Mail className="mr-1.5 h-4 w-4" />{l('Ответить', 'Reply', 'Atbildet')}</a></Button>
                  <Button type="button" size="sm" variant="outline" disabled={updatingId === item.id} onClick={() => void setAnswered(item.id, !item.answeredAt)}>
                    {item.answeredAt ? <RotateCcw className="mr-1.5 h-4 w-4" /> : <Check className="mr-1.5 h-4 w-4" />}
                    {item.answeredAt ? l('Вернуть без ответа', 'Mark unanswered', 'Atzimet ka neatbildetu') : l('Отметить отвеченным', 'Mark answered', 'Atzimet ka atbildetu')}
                  </Button>
                </div>
              </div>
              <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-foreground/85">{item.message}</p>
            </article>
          ))}
        </div>
      )}
    </main>
  )
}
