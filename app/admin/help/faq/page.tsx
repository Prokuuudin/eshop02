'use client'
import React, { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import AdminGate from '@/components/admin/AdminGate'

type FaqItem = {
  id: number
  question: string
  answer: string
}

const faqItems: FaqItem[] = [
  {
    id: 1,
    question: 'Как изменить цену или остаток товара быстро?',
    answer:
      'Два способа. Быстрый: откройте Каталог → переключитесь на табличный вид (иконка списка) → нажмите на цену или остаток в нужной строке — поле станет редактируемым, введите новое значение и нажмите Enter. Полный: нажмите «Изменить» → откроется карточка товара со всеми полями.',
  },
  {
    id: 2,
    question: 'Как добавить новый товар?',
    answer:
      'Откройте Каталог → нажмите кнопку «+ Добавить товар». Обязательные поля: название, бренд, цена, остаток на складе, категория. Остальные поля (описание, изображения, теги, SKU) — необязательные, но рекомендуются для полноты карточки.',
  },
  {
    id: 3,
    question: 'Заказ завис в статусе «Ожидает»?',
    answer:
      'Откройте раздел Заказы → найдите нужный заказ по номеру или email клиента → нажмите на строку, чтобы развернуть детали → в нижней части появятся кнопки смены статуса. Если клиент уже оплатил — переводите в «Подтверждён», затем «Отправлен». Для массовой смены статуса у нескольких заказов используйте чекбоксы слева от строк.',
  },
  {
    id: 4,
    question: 'Как создать промокод со сроком действия?',
    answer:
      'Перейдите в Продвижение → Скидки и купоны → нажмите «Добавить промокод». Заполните поля: код, размер скидки в %. В поле «Действует до» выберите дату окончания. После этой даты промокод перестанет применяться автоматически. Система предупредит, если вы попытаетесь создать промокод с уже существующим кодом.',
  },
  {
    id: 5,
    question: 'Данные пропали после обновления страницы?',
    answer:
      'Часть данных (корзина, черновики, настройки сессии) хранится в localStorage браузера. Если вы очистили кэш браузера или сменили устройство — эти данные могут быть недоступны. Для защиты критичных данных регулярно делайте резервные копии через Система → Резерв и восстановление. Рекомендуемая частота: раз в неделю.',
  },
  {
    id: 6,
    question: 'Как добавить товар на главную страницу?',
    answer:
      'Создайте подборку в разделе Продвижение → Подборки и витрины: задайте название, добавьте нужные товары по ID или поиску. Подборка автоматически появится в соответствующем блоке на главной. Для баннерного блока используйте Контент → Баннеры и блоки.',
  },
  {
    id: 7,
    question: 'Как заменить изображение везде, где оно используется?',
    answer:
      'Откройте Контент → Медиа-библиотека → найдите нужный файл → нажмите на него → в правой панели появится кнопка «Заменить файл (путь не изменится)». Загрузите новое изображение — оно перезапишет старый файл с тем же именем, и все товары и баннеры, ссылающиеся на этот файл, автоматически покажут новое изображение. В панели также видно, в скольких товарах используется файл.',
  },
  {
    id: 8,
    question: 'Как экспортировать заказы или список клиентов?',
    answer:
      'Откройте раздел Заказы → в правом верхнем углу две кнопки: «Заказы (CSV)» и «Клиенты (CSV)». Экспорт учитывает текущие фильтры — если выбрать статус «Доставлен», в файл попадут только доставленные заказы. Клиентский CSV содержит уникальных покупателей с агрегированной суммой трат и количеством заказов.',
  },
  {
    id: 9,
    question: 'Что такое RFQ?',
    answer:
      'RFQ (Request for Quote, запрос на котировку) — заявки от B2B-клиентов, которым нужны особые условия: крупный объём, специальная цена, отсрочка платежа. Клиент формирует заявку в личном кабинете, а вы обрабатываете её в разделе Продажи → RFQ заявки: указываете итоговую цену, условия и срок действия предложения. Каждое изменение статуса фиксируется в таймлайне заявки.',
  },
  {
    id: 10,
    question: 'Как обновить цены сразу у многих товаров?',
    answer:
      'Используйте массовый импорт: Каталог → Импорт и обновления → скачайте актуальный CSV с текущими товарами. Откройте в Excel, отредактируйте колонку «price». Загрузите обратно в режиме «Обновить существующие». Перед запуском нажмите «Проверить файл» — система покажет таблицу: какие строки будут обновлены, какие созданы, какие пропущены.',
  },
  {
    id: 11,
    question: 'Как создать заказ вручную для клиента, который позвонил?',
    answer:
      'Откройте Продажи → Заказы → кнопка «+ Создать заказ». Введите email клиента — если он уже покупал, данные подставятся автоматически. Найдите товары через поиск, укажите количество и при необходимости скорректируйте цену (для B2B). Выберите доставку и способ оплаты. Заказ создастся со статусом «Подтверждён».',
  },
  {
    id: 12,
    question: 'Как быстро найти заказ, товар или клиента?',
    answer:
      'Используйте глобальный поиск — кнопка «Поиск» (или Ctrl+K / ⌘+K) в верхней панели на любой странице админки. Вводите имя, email, ID заказа, название товара или код промокода — результаты появятся сгруппированные по разделам. Клик по результату сразу переходит к нужному объекту.',
  },
  {
    id: 13,
    question: 'Где смотреть кто и что изменил в системе?',
    answer:
      'Система → Лог действий администраторов. Здесь фиксируются все значимые действия: смена статуса заказа, изменение цены товара, создание/удаление промокода, смена статуса возврата. Для каждого события видно: кто сделал, когда, что именно изменилось (значения «до» и «после»). Лог можно экспортировать в CSV.',
  },
]

export default function AdminFaqPage() {
  const [openId, setOpenId] = useState<number | null>(null)
  const [query, setQuery] = useState('')

  const filtered = query.trim()
    ? faqItems.filter((item) =>
        item.question.toLowerCase().includes(query.toLowerCase()) ||
        item.answer.toLowerCase().includes(query.toLowerCase())
      )
    : faqItems

  const toggle = (id: number) => {
    setOpenId((prev) => (prev === id ? null : id))
  }

  return (
    <AdminGate>
      <main className="w-full py-4 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Частые вопросы (FAQ)</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Ответы на типовые вопросы по работе с системой
            </p>
          </div>
          <Link href="/admin">
            <Button variant="outline">Назад в админку</Button>
          </Link>
        </div>

        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none select-none">🔍</span>
          <input
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setOpenId(null) }}
            placeholder="Поиск по вопросам..."
            className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-border bg-card text-foreground text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
          {query && (
            <button type="button" onClick={() => { setQuery(''); setOpenId(null) }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xs">
              ✕
            </button>
          )}
        </div>

        <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
          {filtered.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-muted-foreground">
              Ничего не найдено по запросу «{query}»
            </div>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-800">
              {filtered.map((item) => {
                const isOpen = openId === item.id
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => toggle(item.id)}
                      aria-expanded={isOpen}
                      className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                    >
                      <span className="text-sm font-medium text-foreground leading-snug">
                        {item.question}
                      </span>
                      <span className={`flex-shrink-0 text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} aria-hidden>
                        <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none">
                          <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </span>
                    </button>
                    {isOpen && (
                      <div className="px-5 pb-5">
                        <p className="text-sm text-muted-foreground leading-relaxed">{item.answer}</p>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-indigo-100 dark:border-indigo-900 bg-indigo-50 dark:bg-indigo-900/20 px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-foreground">Не нашли ответ?</p>
            <p className="text-sm text-muted-foreground mt-0.5">Обратитесь в службу поддержки — мы поможем разобраться.</p>
          </div>
          <Link href="/contact">
            <Button variant="outline" className="shrink-0">Поддержка →</Button>
          </Link>
        </div>
      </main>
    </AdminGate>
  )
}
