'use client'
import React, { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import AdminGate from '@/components/admin/AdminGate'
import { useAdminLocale } from '@/lib/use-admin-locale'

type FaqItem = {
  id: number
  question: string
  answer: string
}

const FAQ_ITEMS_RU: FaqItem[] = [
  {
    id: 1,
    question: 'Как изменить цену или остаток товара быстро?',
    answer:
      'Два способа. Для одного товара откройте Каталог → переключитесь на табличный вид → нажмите цену или остаток в строке, введите значение и сохраните изменение. Полная карточка открывается по кнопке редактирования. Для группы товаров используйте «Массовый редактор цен», а для большого набора цен и остатков — CSV-импорт с обязательным предпросмотром.',
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
      'Перейдите в Продвижение → Промокоды → нажмите «Добавить промокод». Заполните поля: код, размер скидки в %. В поле «Действует до» выберите дату окончания. После этой даты промокод перестанет применяться автоматически. Система предупредит, если вы попытаетесь создать промокод с уже существующим кодом.',
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
      'Для изменения по бренду, категории или выбранным товарам откройте Каталог → Массовый редактор цен и обязательно проверьте предпросмотр. Для большого набора цен и остатков откройте Импорт / Экспорт, скачайте актуальный каталог, измените CSV и нажмите «Проверить файл». Запускайте импорт только после проверки строк create/update/skip/error и резервной копии.',
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

const FAQ_ITEMS_EN: FaqItem[] = [
  { id: 1, question: 'How can I quickly change a product price or stock?', answer: 'For one product, open Catalog, switch to table view, click the price or stock value, enter the new value, and save. For multiple products, use Bulk pricing or CSV import with preview.' },
  { id: 2, question: 'How do I add a new product?', answer: 'Open Catalog and expand the new-product form. Fill in the required fields, save, then open the full product card to add translations, images, attributes, and SEO. Check the SKU, category, price, and stock before publishing.' },
  { id: 3, question: 'Is an order stuck in Pending?', answer: 'Find the order by number or email and open its details. Check payment, delivery, and internal notes, then update the status only to match the actual processing stage.' },
  { id: 4, question: 'How do I create a promo code with an expiry date?', answer: 'Go to Marketing → Promo codes and select Add promo code. Enter the code, discount percentage, and expiry date. The code will stop working automatically after that date.' },
  { id: 5, question: 'Did data disappear after refreshing the page?', answer: 'Reset filters and check the selected language and account, then refresh. Do not create a duplicate if a product, order, or customer is missing; record the URL and time, then check system logs or contact the responsible employee.' },
  { id: 6, question: 'How do I add content to the home page?', answer: 'Open Content → Banners and add a banner with its title, caption, image, link, button text, and colors. Mark it active, save it, and check the home page in every required language.' },
  { id: 7, question: 'How do I replace an image everywhere it is used?', answer: 'Open Content → Media library, select the file, and choose Replace file. Uploading a new image to the same path updates every product and banner that references it.' },
  { id: 8, question: 'How do I export orders or customers?', answer: 'Open Orders and use Orders (CSV) or Customers (CSV). The order export respects current filters; the customer export contains unique customers with aggregated spend and order counts.' },
  { id: 9, question: 'What is an RFQ?', answer: 'An RFQ is a request from a B2B customer for special terms such as volume pricing or deferred payment. Process it under Sales → RFQ requests by specifying the final price, terms, and offer validity.' },
  { id: 10, question: 'How do I update prices for many products?', answer: 'Use Catalog → Bulk pricing for a brand, category, or selection. For a large dataset, export the current catalog, edit the CSV, validate it, and import only after reviewing create, update, skip, and error rows.' },
  { id: 11, question: 'How do I create an order for a customer manually?', answer: 'Open Sales → Orders and select Create order. Enter the customer email, add products and quantities, choose delivery and payment, and verify the details before creating the confirmed order.' },
  { id: 12, question: 'How do I quickly find an order, product, or customer?', answer: 'Use Search or Ctrl+K / ⌘K in the top bar. Search by product name, customer details, order number, or section name, then open the result with a click or Enter.' },
  { id: 13, question: 'Where can I see who changed something?', answer: 'Open System → Administrator activity log. It records important actions with the employee, time, affected object, and values before and after the change.' },
  { id: 14, question: 'How do I safely restore a backup?', answer: 'Open System → Backups and first download a fresh copy of the current data. Preview the saved file and restore it only during an agreed maintenance window after verifying the store and backup date.' },
  { id: 15, question: 'Why did text change in only one language?', answer: 'RU, EN, and LV content is edited separately in content, banner, and blog sections. Check the active language tab, complete the other languages, and verify each language version of the website.' },
]

const FAQ_ITEMS_LV: FaqItem[] = [
  { id: 1, question: 'Kā ātri mainīt preces cenu vai atlikumu?', answer: 'Vienai precei atveriet Katalogu, pārslēdzieties uz tabulas skatu, noklikšķiniet uz cenas vai atlikuma, ievadiet vērtību un saglabājiet. Vairākām precēm izmantojiet masveida cenu redaktoru vai CSV importu ar priekšskatījumu.' },
  { id: 2, question: 'Kā pievienot jaunu preci?', answer: 'Atveriet Katalogu un izvēršiet jaunas preces formu. Aizpildiet obligātos laukus, saglabājiet un pilnajā preces kartītē pievienojiet tulkojumus, attēlus, īpašības un SEO.' },
  { id: 3, question: 'Pasūtījums ir iestrēdzis statusā “Gaida”?', answer: 'Atrodiet pasūtījumu pēc numura vai e-pasta un atveriet detaļas. Pārbaudiet apmaksu, piegādi un piezīmes, pēc tam mainiet statusu atbilstoši faktiskajam apstrādes posmam.' },
  { id: 4, question: 'Kā izveidot promokodu ar derīguma termiņu?', answer: 'Atveriet Mārketings → Promokodi un izvēlieties Pievienot promokodu. Norādiet kodu, atlaides procentu un beigu datumu; pēc tā kods automātiski vairs nedarbosies.' },
  { id: 5, question: 'Dati pazuda pēc lapas atjaunošanas?', answer: 'Atiestatiet filtrus, pārbaudiet valodu un kontu, tad atjaunojiet lapu. Ja trūkst preces, pasūtījuma vai klienta, neveidojiet dublikātu — pierakstiet URL un laiku un pārbaudiet sistēmas žurnālus.' },
  { id: 6, question: 'Kā pievienot saturu sākumlapai?', answer: 'Atveriet Saturs → Baneri un pievienojiet baneri ar virsrakstu, attēlu, saiti, pogas tekstu un krāsām. Aktivizējiet to un pārbaudiet sākumlapu visās vajadzīgajās valodās.' },
  { id: 7, question: 'Kā nomainīt attēlu visur, kur tas izmantots?', answer: 'Atveriet Saturs → Mediju bibliotēka, izvēlieties failu un darbību Aizstāt failu. Jaunais attēls tajā pašā ceļā tiks parādīts visās saistītajās precēs un baneros.' },
  { id: 8, question: 'Kā eksportēt pasūtījumus vai klientus?', answer: 'Atveriet Pasūtījumus un izmantojiet Pasūtījumi (CSV) vai Klienti (CSV). Pasūtījumu eksports ņem vērā filtrus, bet klientu fails apkopo tēriņus un pasūtījumu skaitu.' },
  { id: 9, question: 'Kas ir RFQ?', answer: 'RFQ ir B2B klienta cenu piedāvājuma pieprasījums īpašiem nosacījumiem. Apstrādājiet to sadaļā Pārdošana → RFQ pieprasījumi, norādot gala cenu, nosacījumus un piedāvājuma termiņu.' },
  { id: 10, question: 'Kā atjaunināt cenas daudzām precēm?', answer: 'Izmantojiet Katalogs → Masveida cenas zīmolam, kategorijai vai atlasītām precēm. Lielam datu apjomam eksportējiet katalogu, rediģējiet CSV un importējiet tikai pēc visu rindu pārbaudes.' },
  { id: 11, question: 'Kā manuāli izveidot pasūtījumu klientam?', answer: 'Atveriet Pārdošana → Pasūtījumi un izvēlieties Izveidot pasūtījumu. Ievadiet klienta e-pastu, pievienojiet preces, izvēlieties piegādi un apmaksu un pārbaudiet datus.' },
  { id: 12, question: 'Kā ātri atrast pasūtījumu, preci vai klientu?', answer: 'Augšējā joslā izmantojiet Meklēšanu vai Ctrl+K / ⌘K. Meklējiet pēc preces nosaukuma, klienta datiem, pasūtījuma numura vai sadaļas.' },
  { id: 13, question: 'Kur redzēt, kas un ko mainīja sistēmā?', answer: 'Atveriet Sistēma → Administratoru darbību žurnāls. Tajā redzams darbinieks, laiks, mainītais objekts un vērtības pirms un pēc izmaiņām.' },
  { id: 14, question: 'Kā droši atjaunot rezerves kopiju?', answer: 'Atveriet Sistēma → Rezerves kopijas un vispirms lejupielādējiet pašreizējo datu kopiju. Pārbaudiet faila priekšskatījumu un atjaunojiet tikai saskaņotā laikā.' },
  { id: 15, question: 'Kāpēc teksts mainījās tikai vienā valodā?', answer: 'Satura, baneru un bloga sadaļās RU, EN un LV vērtības rediģē atsevišķi. Pārbaudiet aktīvo valodas cilni, aizpildiet pārējās valodas un pārbaudiet katru vietnes versiju.' },
]

export default function AdminFaqPage(): React.ReactElement {
  const { language, l } = useAdminLocale()
  const faqItems = language === 'ru' ? FAQ_ITEMS_RU : language === 'lv' ? FAQ_ITEMS_LV : FAQ_ITEMS_EN
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
            <h1 className="text-3xl font-bold text-foreground">{l('Частые вопросы (FAQ)', 'Frequently asked questions (FAQ)', 'Biežāk uzdotie jautājumi (BUJ)')}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {l('Ответы на типовые вопросы по работе с системой', 'Answers to common questions about using the system', 'Atbildes uz biežākajiem jautājumiem par sistēmas lietošanu')}
            </p>
          </div>
          <Link href="/admin">
            <Button variant="outline">{l('Назад в админку', 'Back to admin', 'Atpakaļ uz administrāciju')}</Button>
          </Link>
        </div>

        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm pointer-events-none select-none">🔍</span>
          <Input
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setOpenId(null) }}
            placeholder={l('Поиск по вопросам...', 'Search questions...', 'Meklēt jautājumus...')}
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
              {l(`Ничего не найдено по запросу «${query}»`, `Nothing found for “${query}”`, `Vaicājumam “${query}” nekas nav atrasts`)}
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
                      <div className="ui-disclosure-in px-5 pb-5">
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
            <p className="text-sm font-medium text-foreground">{l('Не нашли ответ?', 'Did not find an answer?', 'Neatradāt atbildi?')}</p>
            <p className="text-sm text-muted-foreground mt-0.5">{l('Обратитесь в службу поддержки — мы поможем разобраться.', 'Contact support and we will help you.', 'Sazinieties ar atbalsta dienestu — mēs palīdzēsim.')}</p>
          </div>
          <Link href="/contact">
            <Button variant="outline" className="shrink-0">{l('Поддержка', 'Support', 'Atbalsts')} →</Button>
          </Link>
        </div>
      </main>
    </AdminGate>
  )
}
