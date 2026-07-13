// Curated registry of admin-editable site content. Each text entry names a
// translation key already rendered through t(); each image entry names a base
// src already passed through resolveImageSrc(). The /admin/content page renders
// this registry so admins can edit content without knowing keys or paths.
// When new t()-wired content is added to the site, add it here too —
// lib/content-registry.test.ts validates every key and file path.

export type ContentEntry =
  | { type: 'text'; key: string; label: string; multiline?: boolean }
  | { type: 'image'; src: string; label: string }

export type ContentSection = {
  id: string
  title: string
  entries: ContentEntry[]
}

export const CONTENT_REGISTRY: ContentSection[] = [
  {
    id: 'home-hero',
    title: 'Главная — Hero',
    entries: [
      { type: 'text', key: 'hero.title', label: 'Заголовок' },
      { type: 'text', key: 'hero.subtitle', label: 'Подзаголовок' },
      { type: 'text', key: 'hero.alt', label: 'Alt-текст фоновой картинки' },
      { type: 'image', src: '/hero.jpg', label: 'Фоновая картинка' },
    ],
  },
  {
    id: 'home-benefits',
    title: 'Главная — Преимущества',
    entries: [
      { type: 'text', key: 'benefits.deliveryFree', label: 'Бесплатная доставка' },
      { type: 'text', key: 'benefits.consultationMain', label: 'Консультации' },
      { type: 'text', key: 'benefits.processingFast', label: 'Быстрая обработка' },
      { type: 'text', key: 'benefits.inStock', label: 'Товары на складе' },
      { type: 'text', key: 'benefits.brands100', label: 'Оригинальные бренды' },
      { type: 'text', key: 'benefits.bonusPoints', label: 'Бонусные баллы' },
      { type: 'image', src: '/icons/delivery.svg', label: 'Иконка «Доставка»' },
      { type: 'image', src: '/icons/support.svg', label: 'Иконка «Поддержка»' },
      { type: 'image', src: '/icons/quality.svg', label: 'Иконка «Качество»' },
      { type: 'image', src: '/icons/original.svg', label: 'Иконка «Оригинал»' },
    ],
  },
  {
    id: 'about',
    title: 'О нас',
    entries: [
      { type: 'text', key: 'about.title', label: 'Заголовок страницы' },
      { type: 'text', key: 'about.welcome.title', label: 'Приветствие — заголовок' },
      { type: 'text', key: 'about.welcome.p1', label: 'Приветствие — абзац 1', multiline: true },
      { type: 'text', key: 'about.welcome.p2', label: 'Приветствие — абзац 2', multiline: true },
      { type: 'text', key: 'about.storesInfo', label: 'Текст о магазинах', multiline: true },
      { type: 'text', key: 'about.storesButton', label: 'Кнопка «Магазины»' },
      { type: 'text', key: 'about.why.title', label: 'Почему мы — заголовок' },
      { type: 'text', key: 'about.why.item1', label: 'Почему мы — пункт 1' },
      { type: 'text', key: 'about.why.item2', label: 'Почему мы — пункт 2' },
      { type: 'text', key: 'about.why.item3', label: 'Почему мы — пункт 3' },
      { type: 'text', key: 'about.why.item4', label: 'Почему мы — пункт 4' },
      { type: 'text', key: 'about.why.item5', label: 'Почему мы — пункт 5' },
    ],
  },
  {
    id: 'faq',
    title: 'FAQ',
    entries: [
      { type: 'text', key: 'faq.site.title', label: 'Заголовок блока' },
      { type: 'text', key: 'faq.site.subtitle', label: 'Подзаголовок блока' },
      // Нумерация с пропусками (нет q3/q9) — ровно как в components/FAQSection.tsx
      { type: 'text', key: 'faq.site.q1', label: 'Вопрос 1' },
      { type: 'text', key: 'faq.site.a1', label: 'Ответ 1', multiline: true },
      { type: 'text', key: 'faq.site.q2', label: 'Вопрос 2' },
      { type: 'text', key: 'faq.site.a2', label: 'Ответ 2', multiline: true },
      { type: 'text', key: 'faq.site.q4', label: 'Вопрос 4' },
      { type: 'text', key: 'faq.site.a4', label: 'Ответ 4', multiline: true },
      { type: 'text', key: 'faq.site.q5', label: 'Вопрос 5' },
      { type: 'text', key: 'faq.site.a5', label: 'Ответ 5', multiline: true },
      { type: 'text', key: 'faq.site.q6', label: 'Вопрос 6' },
      { type: 'text', key: 'faq.site.a6', label: 'Ответ 6', multiline: true },
      { type: 'text', key: 'faq.site.q7', label: 'Вопрос 7' },
      { type: 'text', key: 'faq.site.a7', label: 'Ответ 7', multiline: true },
      { type: 'text', key: 'faq.site.q8', label: 'Вопрос 8' },
      { type: 'text', key: 'faq.site.a8', label: 'Ответ 8', multiline: true },
      { type: 'text', key: 'faq.site.q10', label: 'Вопрос 10' },
      { type: 'text', key: 'faq.site.a10', label: 'Ответ 10', multiline: true },
      { type: 'text', key: 'faq.site.q11', label: 'Вопрос 11' },
      { type: 'text', key: 'faq.site.a11', label: 'Ответ 11', multiline: true },
      { type: 'text', key: 'faq.site.q12', label: 'Вопрос 12' },
      { type: 'text', key: 'faq.site.a12', label: 'Ответ 12', multiline: true },
    ],
  },
  {
    id: 'newsletter',
    title: 'Рассылка',
    entries: [
      { type: 'text', key: 'newsletter.title', label: 'Заголовок' },
      { type: 'text', key: 'newsletter.subtitle', label: 'Подзаголовок' },
      { type: 'text', key: 'newsletter.placeholder', label: 'Плейсхолдер поля email' },
      { type: 'text', key: 'newsletter.subscribe', label: 'Кнопка подписки' },
      { type: 'text', key: 'newsletter.consentPrefix', label: 'Текст согласия' },
      { type: 'text', key: 'newsletter.consentLinkLabel', label: 'Ссылка в согласии' },
    ],
  },
  {
    id: 'footer',
    title: 'Футер',
    entries: [
      { type: 'text', key: 'footer.about', label: 'О компании', multiline: true },
      { type: 'text', key: 'footer.contact', label: 'Заголовок «Контакты»' },
      { type: 'text', key: 'footer.privacy', label: 'Политика конфиденциальности' },
      { type: 'text', key: 'footer.terms', label: 'Условия использования' },
      { type: 'text', key: 'footer.returns', label: 'Возвраты' },
    ],
  },
  {
    id: 'contact',
    title: 'Контакты',
    entries: [
      { type: 'text', key: 'contact.title', label: 'Заголовок страницы' },
      { type: 'text', key: 'contact.info', label: 'Вводный текст', multiline: true },
      { type: 'text', key: 'contact.formTitle', label: 'Заголовок формы' },
      { type: 'text', key: 'contact.faq.q1', label: 'FAQ — вопрос 1' },
      { type: 'text', key: 'contact.faq.a1', label: 'FAQ — ответ 1', multiline: true },
      { type: 'text', key: 'contact.faq.q2', label: 'FAQ — вопрос 2' },
      { type: 'text', key: 'contact.faq.a2', label: 'FAQ — ответ 2', multiline: true },
      { type: 'text', key: 'contact.faq.q3', label: 'FAQ — вопрос 3' },
      { type: 'text', key: 'contact.faq.a3', label: 'FAQ — ответ 3', multiline: true },
    ],
  },
]
