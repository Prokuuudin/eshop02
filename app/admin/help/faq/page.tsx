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
    question: 'Как изменить цену товара?',
    answer:
      'Перейдите в Каталог → найдите нужный товар в списке → нажмите «Изменить» → отредактируйте поле «Цена». Сохраните изменения кнопкой внизу формы. Новая цена применяется немедленно и отображается для покупателей без перезагрузки страницы.',
  },
  {
    id: 2,
    question: 'Как добавить новый товар?',
    answer:
      'Откройте Каталог → нажмите кнопку «+ Добавить товар» в правом верхнем углу. Обязательные поля: название, бренд, цена, остаток на складе, категория. Остальные поля (описание, изображения, теги, SKU) — необязательные, но рекомендуются для полноты карточки.',
  },
  {
    id: 3,
    question: 'Заказ завис в статусе «Ожидает»?',
    answer:
      'Откройте раздел Заказы → найдите нужный заказ по номеру или email клиента → нажмите на строку, чтобы развернуть детали → в нижней части появятся кнопки смены статуса. Выберите нужный статус вручную. Если клиент уже оплатил — переводите в «Подтверждён», затем «Отправлен».',
  },
  {
    id: 4,
    question: 'Как создать промокод со сроком действия?',
    answer:
      'Перейдите в Продвижение → Скидки и купоны → нажмите «Добавить промокод». Заполните поля: код, тип скидки (процент или фиксированная сумма), размер скидки. В поле «Действует до» выберите дату окончания. После этой даты промокод перестанет применяться автоматически.',
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
    question: 'Как заменить изображение баннера?',
    answer:
      'Шаг 1: Откройте Контент → Медиа-библиотека → загрузите новое изображение кнопкой «Загрузить» → после загрузки скопируйте путь к файлу (отображается под превью). Шаг 2: Откройте Контент → Баннеры и блоки → найдите нужный баннер → нажмите «Изменить» → вставьте скопированный путь в поле «Изображение» → сохраните.',
  },
  {
    id: 8,
    question: 'Как экспортировать заказы?',
    answer:
      'Прямого экспорта заказов в CSV пока нет. Воспользуйтесь разделом Система → Резерв и восстановление: скачайте полный бэкап — в архиве будет файл orders.json со всеми заказами. Его можно открыть в Excel через «Данные → Из JSON» или в любом JSON-редакторе.',
  },
  {
    id: 9,
    question: 'Что такое RFQ?',
    answer:
      'RFQ (Request for Quote, запрос на котировку) — заявки от B2B-клиентов, которым нужны особые условия: крупный объём, специальная цена, отсрочка платежа. Клиент формирует заявку в личном кабинете, а вы обрабатываете её в разделе Продажи → RFQ заявки: указываете итоговую цену, условия и срок действия предложения.',
  },
  {
    id: 10,
    question: 'Как обновить цены сразу у многих товаров?',
    answer:
      'Используйте массовый импорт: Каталог → Импорт и обновления → скачайте актуальный CSV-шаблон с текущими товарами. Откройте файл в Excel или Google Таблицах, отредактируйте колонку «price» (и другие нужные поля). Загрузите файл обратно в режиме «Обновить существующие» — система обновит только изменённые записи.',
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
      <main className="max-w-4xl mx-auto p-4 md:p-6 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Частые вопросы (FAQ)</h1>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              Ответы на типовые вопросы по работе с системой
            </p>
          </div>
          <Link href="/admin">
            <Button variant="outline">Назад в админку</Button>
          </Link>
        </div>

        {/* Search */}
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none select-none">
            🔍
          </span>
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setOpenId(null)
            }}
            placeholder="Поиск по вопросам..."
            className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
          {query && (
            <button
              type="button"
              onClick={() => { setQuery(''); setOpenId(null) }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xs"
            >
              ✕
            </button>
          )}
        </div>

        {/* Accordion */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
          {filtered.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
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
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100 leading-snug">
                        {item.question}
                      </span>
                      <span
                        className={`flex-shrink-0 text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                        aria-hidden
                      >
                        <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none">
                          <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </span>
                    </button>
                    {isOpen && (
                      <div className="px-5 pb-5">
                        <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                          {item.answer}
                        </p>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {/* Contact block */}
        <div className="rounded-xl border border-indigo-100 dark:border-indigo-900 bg-indigo-50 dark:bg-indigo-900/20 px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Не нашли ответ?</p>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">
              Обратитесь в службу поддержки — мы поможем разобраться.
            </p>
          </div>
          <Link href="/contact">
            <Button variant="outline" className="shrink-0">
              Поддержка →
            </Button>
          </Link>
        </div>
      </main>
    </AdminGate>
  )
}
