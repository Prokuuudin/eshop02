'use client'
import React, { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
      'Два способа. Для одного товара откройте Каталог → переключитесь на табличный вид → нажмите цену или остаток в строке, введите значение и сохраните изменение. Полная карточка открывается по кнопке редактирования. Для группы товаров используйте «Редактор цен», а для большого набора цен и остатков — CSV-импорт с обязательным предпросмотром.',
  },
  {
    id: 2,
    question: 'Как добавить новый товар?',
    answer:
      'Откройте Каталог и разверните форму добавления товара. Заполните обязательные поля, сохраните товар, затем откройте его полную карточку для описаний, переводов, изображений, характеристик и SEO. Перед публикацией проверьте SKU, категорию, цену и остаток.',
  },
  {
    id: 3,
    question: 'Заказ завис в статусе «Ожидает»?',
    answer:
      'Найдите заказ по номеру или email и откройте детали. Сверьте статус оплаты, способ доставки и служебные заметки. Меняйте статус только по фактическому этапу обработки; несколько заказов можно обновить через чекбоксы и панель массовых действий. Если данные оплаты или доставки противоречат друг другу, сначала уточните их, а не переводите заказ дальше.',
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
      'Сначала сбросьте фильтры, проверьте выбранный язык и аккаунт, затем обновите страницу. Настройки вида и прогресс онбординга хранятся в браузере и могут исчезнуть после очистки данных сайта; рабочие записи должны сохраняться сервером. Если пропал товар, заказ или клиент, не создавайте дубль: зафиксируйте URL, время и свои действия и проверьте системные логи или обратитесь к ответственному сотруднику.',
  },
  {
    id: 6,
    question: 'Как добавить товар на главную страницу?',
    answer:
      'Откройте Контент → Баннеры и добавьте баннер: заголовок, подпись, изображение, ссылку, текст кнопки и цвета. Отметьте баннер активным, чтобы он показался на главной странице. После сохранения проверьте главную страницу на всех нужных языках.',
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
      'Для изменения по бренду, категории или выбранным товарам откройте Каталог → Редактор цен и обязательно проверьте предпросмотр. Для большого набора цен и остатков откройте Импорт / Экспорт, скачайте актуальный каталог, измените CSV и нажмите «Проверить файл». Запускайте импорт только после проверки строк create/update/skip/error и резервной копии.',
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
      'Используйте кнопку «Поиск» или Ctrl+K / ⌘K в верхней панели. Ищите по названию товара, данным клиента, номеру заказа или названию раздела. Откройте нужный результат кликом или клавишей Enter; если объект не найден, перейдите в профильный раздел и проверьте его локальные фильтры.',
  },
  {
    id: 13,
    question: 'Где смотреть кто и что изменил в системе?',
    answer:
      'Система → Лог действий администраторов. Здесь фиксируются все значимые действия: смена статуса заказа, изменение цены товара, создание/удаление промокода, смена статуса возврата. Для каждого события видно: кто сделал, когда, что именно изменилось (значения «до» и «после»). Лог можно экспортировать в CSV.',
  },
  {
    id: 14,
    question: 'Как безопасно восстановить резервную копию?',
    answer:
      'Откройте Система → Резервные копии и сначала скачайте свежую копию текущих данных. Затем выберите сохранённый файл и проверьте список содержимого в предпросмотре. Восстановление перезаписывает текущие данные: запускайте его только в согласованное окно, убедившись, что файл относится к нужному магазину и дате.',
  },
  {
    id: 15,
    question: 'Почему текст изменился только на одном языке?',
    answer:
      'В разделах контента, баннеров и блога значения RU, EN и LV редактируются отдельно. Перед сохранением проверьте активную языковую вкладку, затем заполните остальные языки и откройте соответствующие версии сайта. Если поле в «Страницах сайта» не показано, значит оно ещё не внесено в реестр редактируемого контента.',
  },
]

export default function AdminFaqPage(): React.ReactElement {
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
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm pointer-events-none select-none">🔍</span>
          <Input
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setOpenId(null) }}
            placeholder="Поиск по вопросам..."
            className="w-full pl-9 pr-4 py-2.5 text-sm"
          />
          {query && (
            <button type="button" onClick={() => { setQuery(''); setOpenId(null) }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-gray-600 dark:hover:text-gray-300 text-xs">
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
            <ul className="divide-y divide-border">
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

        <div className="rounded-xl border border-primary/10 dark:border-primary/20 bg-primary/5 dark:bg-primary/10 px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
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
