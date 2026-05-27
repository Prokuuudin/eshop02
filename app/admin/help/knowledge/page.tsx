'use client'
import React from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import AdminGate from '@/components/admin/AdminGate'

type KnowledgeArticle = {
  icon: string
  title: string
  description: string
  href: string
  linkLabel: string
}

const articles: KnowledgeArticle[] = [
  {
    icon: '📦',
    title: 'Управление каталогом',
    description:
      'Добавление новых товаров, редактирование цен и описаний, управление остатками. Поддерживается массовое обновление через CSV-импорт — удобно при приёмке новой партии или сезонном изменении цен.',
    href: '/admin/products',
    linkLabel: 'Открыть каталог',
  },
  {
    icon: '🛒',
    title: 'Работа с заказами',
    description:
      'Просмотр всех заказов, ручная смена статуса (ожидает → подтверждён → отправлен → доставлен). При изменении статуса клиент получает уведомление. Здесь же отображается история оплаты и способ доставки.',
    href: '/admin/orders',
    linkLabel: 'Открыть заказы',
  },
  {
    icon: '🏷️',
    title: 'Промокоды и скидки',
    description:
      'Создание промокодов с фиксированной скидкой или в процентах, ограничение по минимальной сумме заказа и сроку действия. Можно задать лимит использований — например, для акций "первые 100 покупателей".',
    href: '/admin/marketing/discounts',
    linkLabel: 'Открыть скидки',
  },
  {
    icon: '⭐',
    title: 'Бонусная программа',
    description:
      'Настройка процента начисления бонусов с каждой покупки и максимального процента оплаты бонусами. Устанавливается минимальная сумма заказа, при которой бонусы начисляются. Программу можно включить или отключить.',
    href: '/admin/config/bonus',
    linkLabel: 'Открыть настройки',
  },
  {
    icon: '✍️',
    title: 'Управление блогом',
    description:
      'Создание и редактирование статей с поддержкой блочного формата (заголовки, параграфы, списки, цитаты, изображения). Статьи можно публиковать на русском, английском и латышском языках.',
    href: '/admin/blog',
    linkLabel: 'Открыть блог',
  },
  {
    icon: '🖼️',
    title: 'Медиа-библиотека',
    description:
      'Загрузка и управление изображениями для баннеров, товаров и статей блога. После загрузки скопируйте путь к файлу и вставьте его в нужное поле. Поддерживаются форматы JPG, PNG, WebP.',
    href: '/admin/content/media',
    linkLabel: 'Открыть медиатеку',
  },
  {
    icon: '🎨',
    title: 'Баннеры и блоки',
    description:
      'Управление промо-баннерами и контентными блоками главной страницы. Можно менять изображение, заголовок и ссылку баннера без изменения кода. Порядок блоков настраивается перетаскиванием.',
    href: '/admin/content/banners',
    linkLabel: 'Открыть баннеры',
  },
  {
    icon: '💾',
    title: 'Резервное копирование',
    description:
      'Создание резервной копии всех данных магазина (заказы, товары, настройки) в JSON-файл. Рекомендуется делать backup раз в неделю и перед любыми крупными изменениями. Восстановление — загрузка сохранённого файла.',
    href: '/admin/system/backup',
    linkLabel: 'Открыть Backup',
  },
  {
    icon: '🤝',
    title: 'B2B заявки (RFQ)',
    description:
      'Обработка запросов на котировку от корпоративных клиентов. Вы видите список товаров из заявки, можете указать специальную цену, условия оплаты и срок действия предложения, после чего отправить его клиенту.',
    href: '/admin/rfq',
    linkLabel: 'Открыть RFQ',
  },
  {
    icon: '📊',
    title: 'Импорт / Экспорт',
    description:
      'Массовое добавление и обновление товаров через CSV-файл. Скачайте шаблон, заполните данные в Excel или Google Таблицах, загрузите обратно в режиме "добавить" или "обновить существующие".',
    href: '/admin/import',
    linkLabel: 'Открыть импорт',
  },
]

export default function AdminKnowledgePage() {
  return (
    <AdminGate>
      <main className="max-w-4xl mx-auto p-4 md:p-6 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">База знаний</h1>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              Руководство по работе с административной панелью
            </p>
          </div>
          <Link href="/admin">
            <Button variant="outline">Назад в админку</Button>
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {articles.map((article) => (
            <div
              key={article.href}
              className="group flex flex-col bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm hover:shadow-md hover:border-gray-300 dark:hover:border-gray-600 transition-all"
            >
              <div className="flex items-center gap-3 mb-3">
                <span className="text-2xl leading-none">{article.icon}</span>
                <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                  {article.title}
                </h2>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed mb-4 flex-1">
                {article.description}
              </p>
              <Link href={article.href} className="mt-auto">
                <span className="text-sm font-medium text-indigo-600 dark:text-indigo-400 group-hover:underline">
                  {article.linkLabel} →
                </span>
              </Link>
            </div>
          ))}
        </div>
      </main>
    </AdminGate>
  )
}
