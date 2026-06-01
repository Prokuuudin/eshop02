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
      'Добавление товаров, редактирование цен и описаний, управление остатками. В табличном виде — быстрое редактирование цены и остатка прямо в строке (клик на значение). Массовое обновление через CSV-импорт с предпросмотром: система показывает что будет создано, обновлено или пропущено до запуска.',
    href: '/admin/products',
    linkLabel: 'Открыть каталог',
  },
  {
    icon: '🔍',
    title: 'Дубликаты товаров',
    description:
      'Автоматический поиск товаров с одинаковым названием или SKU — помогает навести порядок после нескольких импортов. Результаты сгруппированы, каждый дубликат открывается прямо в редакторе.',
    href: '/admin/products/duplicates',
    linkLabel: 'Найти дубликаты',
  },
  {
    icon: '🛒',
    title: 'Работа с заказами',
    description:
      'Просмотр, фильтрация и смена статусов. Массовые операции: выберите несколько заказов чекбоксами → смените статус сразу у всех. Экспорт в CSV с учётом фильтров. Создание заказа вручную для клиентов, которые заказывают по телефону или email. Редактирование заказа: изменить адрес, добавить или убрать позиции.',
    href: '/admin/orders',
    linkLabel: 'Открыть заказы',
  },
  {
    icon: '👤',
    title: 'Профиль клиента',
    description:
      'Дрилл-даун по каждому покупателю: все заказы, возвраты, топ купленных товаров, сумма и средний чек. Открывается из таблицы сегментов или из результатов глобального поиска.',
    href: '/admin/customers/segments',
    linkLabel: 'Сегменты клиентов',
  },
  {
    icon: '📊',
    title: 'Аналитика: ABC и когорты',
    description:
      'ABC-анализ: товары автоматически делятся на группы A (80% выручки), B и C — помогает понять что держать в запасе. Когортный анализ: retention клиентов по месяцу первой покупки. SEO-отчёт: товары без metaTitle, metaDescription или изображения.',
    href: '/admin/analytics',
    linkLabel: 'Открыть аналитику',
  },
  {
    icon: '📈',
    title: 'Аналитика продаж',
    description:
      'Выручка по дням, заказы по периодам, средний чек. Отдельный раздел: топ-10 товаров по выручке, топ бренды, динамика продаж по категориям в виде stacked bar chart. Переключение между выручкой и количеством.',
    href: '/admin/sales/analytics',
    linkLabel: 'Аналитика продаж',
  },
  {
    icon: '🏷️',
    title: 'Промокоды и скидки',
    description:
      'Создание промокодов: скидка в %, мин. сумма заказа, срок действия, лимит использований. Система предупреждает о дублях кода. Рассылка по сегментам: отправьте письмо со скидкой только VIP-клиентам или тем, кто давно не покупал.',
    href: '/admin/marketing/discounts',
    linkLabel: 'Открыть скидки',
  },
  {
    icon: '📧',
    title: 'Рассылка по сегментам',
    description:
      'Отправьте письмо нужной группе клиентов прямо из раздела сегментов. Переменные {first_name}, {last_name}, {email} подставляются персонально. Вкладка «Превью» покажет как письмо будет выглядеть до отправки.',
    href: '/admin/customers/segments',
    linkLabel: 'Открыть сегменты',
  },
  {
    icon: '⭐',
    title: 'Бонусная программа',
    description:
      'Настройка процента начисления бонусов с каждой покупки и максимального процента оплаты бонусами. Устанавливается минимальная сумма заказа для начисления. Программу можно включить или отключить.',
    href: '/admin/bonus',
    linkLabel: 'Открыть настройки',
  },
  {
    icon: '✍️',
    title: 'Управление блогом',
    description:
      'Создание и редактирование статей с поддержкой блочного формата (заголовки, параграфы, списки, цитаты, изображения). Статьи публикуются на русском, английском и латышском языках.',
    href: '/admin/blog',
    linkLabel: 'Открыть блог',
  },
  {
    icon: '🖼️',
    title: 'Медиа-библиотека',
    description:
      'Загрузка и управление изображениями. Bulk-выбор и массовое удаление. Информация о том, в скольких товарах используется каждый файл. Кнопка «Заменить файл» перезаписывает изображение с тем же путём — все ссылки обновляются автоматически.',
    href: '/admin/content/media',
    linkLabel: 'Открыть медиатеку',
  },
  {
    icon: '🤝',
    title: 'B2B заявки (RFQ)',
    description:
      'Обработка запросов на котировку от корпоративных клиентов. Укажите цену, условия и срок действия предложения. Каждое действие фиксируется в таймлайне заявки — видно когда создана, когда отправлена котировка, когда принята или отклонена.',
    href: '/admin/rfq',
    linkLabel: 'Открыть RFQ',
  },
  {
    icon: '📋',
    title: 'Импорт / Экспорт',
    description:
      'Массовое добавление и обновление товаров через CSV. Перед запуском — предпросмотр: таблица с отметками create/update/skip/error на каждую строку. Экспорт заказов и клиентов в CSV из раздела Заказы.',
    href: '/admin/import',
    linkLabel: 'Открыть импорт',
  },
  {
    icon: '🔎',
    title: 'Глобальный поиск',
    description:
      'Нажмите Ctrl+K (или ⌘K) на любой странице админки — откроется поиск по всем разделам сразу: заказы, товары, клиенты, промокоды. Результаты сгруппированы, навигация клавишами ↑↓ и Enter.',
    href: '/admin',
    linkLabel: 'На главную',
  },
  {
    icon: '🔐',
    title: 'Лог действий администраторов',
    description:
      'Фиксирует кто и когда изменил статус заказа, цену товара, создал промокод, поменял статус возврата. Для каждого события — значения «до» и «после». Экспорт в CSV. Находится в разделе Система.',
    href: '/admin/system/admin-log',
    linkLabel: 'Открыть лог',
  },
  {
    icon: '💾',
    title: 'Резервное копирование',
    description:
      'Создание резервной копии всех данных магазина в JSON-файл. Рекомендуется раз в неделю и перед крупными изменениями. Восстановление — загрузка сохранённого файла.',
    href: '/admin/system/backup',
    linkLabel: 'Открыть Backup',
  },
]

export default function AdminKnowledgePage() {
  return (
    <AdminGate>
      <main className="w-full py-4 space-y-6">
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

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {articles.map((article) => (
            <div
              key={article.href + article.title}
              className="group flex flex-col bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm hover:shadow-md hover:border-gray-300 dark:hover:border-gray-600 transition-all"
            >
              <div className="flex items-center gap-3 mb-3">
                <span className="text-2xl leading-none">{article.icon}</span>
                <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">{article.title}</h2>
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
