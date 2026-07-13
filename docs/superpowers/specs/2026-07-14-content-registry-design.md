# Content Registry — discovery-UI для /admin/content

**Дата:** 2026-07-14
**Статус:** approved, готов к implementation plan
**Контекст:** саб-проект 1 из 5 инициативы «админка меняет любой текст/картинку». Остальные: (2) перенос хардкод-текста DeliveryInfo/PaymentInfo/delivery-payment в t(), (3) логотип через resolveImageSrc, (4) персистентность аплоадов на serverless, (5) stores + company.ts. Каждый — отдельный spec.

## Проблема

Механизм оверрайдов уже работает: `lib/site-content-server-store.ts` (KV `site-content` в Neon) + `useSiteContent()` подмешивает text-оверрайды поверх `t()` и image-оверрайды через `resolveImageSrc()`. Но UI (`app/admin/content/page.tsx`) требует вручную знать точный ключ перевода или путь картинки. Подсказки покрывают 8 текстовых ключей и 5 путей, из которых один битый (`/hero/hero-main.webp` — реальный путь `/hero.jpg`). Практически админ ничего не может найти.

## Решение

### Курированный реестр — `lib/content-registry.ts` (новый)

Статичный typed-массив секций. Чистые данные, без 'server-only', без React:

```ts
export type ContentEntry =
  | { type: 'text'; key: string; label: string; multiline?: boolean }
  | { type: 'image'; src: string; label: string }

export type ContentSection = {
  id: string          // 'home-hero'
  title: string       // 'Главная — Hero' (лейблы реестра по-русски; сама админка русскоязычная)
  entries: ContentEntry[]
}

export const CONTENT_REGISTRY: ContentSection[] = [ ... ]
```

Наполнение v1 — только контент, УЖЕ идущий через `t()`/`resolveImageSrc` (точную выборку ключей implementer снимает с самих компонентов):

| Секция | Источник | Записи |
|---|---|---|
| Главная — Hero | `components/Hero.tsx` | text: hero.title, hero.subtitle, hero.alt; image: `/hero.jpg` |
| Главная — Преимущества | `components/Benefits.tsx` | text: benefits.deliveryFree, consultationMain, processingFast, inStock, brands100, bonusPoints; image: `/icons/delivery.svg`, `/icons/support.svg`, `/icons/quality.svg`, `/icons/original.svg` |
| О нас | `components/AboutSection.tsx` | text: about.title, about.welcome.title/p1/p2, about.storesInfo, about.storesButton, about.why.title, about.why.item1–5 |
| FAQ | `components/FAQSection.tsx` | text: faq.site.title, faq.site.subtitle, faq.site.q/a для 1,2,4,5,6,7,8,10,11,12 (нумерация с пропусками — как в компоненте) |
| Рассылка | `components/Newsletter.tsx` | text: newsletter.title, subtitle, placeholder, subscribe, consentPrefix, consentLinkLabel |
| Футер | `components/Footer.tsx` | text: footer.about, footer.privacy, footer.terms (+ те footer.* ключи, что реально в компоненте) |
| Контакты | `app/contact/page.tsx` | text: contact.title + основные contact.* лейблы страницы |

Длинные тексты (faq.site.a*, about.welcome.p*) помечаются `multiline: true` → textarea вместо input.

DeliveryInfo/PaymentInfo в реестр НЕ входят (текст хардкод, не через t() — саб-проект 2 сначала переводит его на t(), потом реестр пополняется). Логотип не входит (не через resolveImageSrc — саб-проект 3).

### UI — переписать `app/admin/content/page.tsx`

- Сверху: переключатель языка ru/en/lv (как сейчас) + кнопки «Баннеры и блоки», «Назад», «Сбросить все» (как сейчас).
- Основная часть: аккордеоны по секциям реестра (паттерн раскрытия как в других админ-страницах; можно `<details>` или state-toggle — на вкус implementer, но единый для всех секций).
- Text-запись в развёрнутой секции: лейбл, текущее значение (`override ?? translations[lang][key]`), поле редактирования (textarea если multiline, иначе input), кнопки «Сохранить» (`setText`) и «Сбросить» (`removeText`, показывается только если override существует). Бейдж «изменено», если override активен.
- Image-запись: лейбл, превью текущей картинки (`resolveImageSrc(src)` — т.е. с учётом override), file-input (существующий `POST /api/admin/content/upload` → путь → сразу `setImage(src, uploadedPath)`), кнопка «Сбросить» (`removeImage`) если override есть. Бейдж «изменено».
- Экспертный режим: текущие свободные формы (произвольный ключ + произвольная пара src) переезжают в свёрнутую секцию «Экспертный режим» внизу страницы — без изменений логики. Списки активных оверрайдов (text по языку, image) тоже остаются, как сейчас.
- Списки COMMON_TEXT_KEYS / COMMON_IMAGE_PATHS удаляются — их заменяет реестр (вместе с ними уходит битый `/hero/hero-main.webp`).

### Бэкенд

Не трогается вообще: `site-content-server-store.ts`, `app/api/admin/content/route.ts`, `app/api/admin/content/upload/route.ts`, `lib/use-site-content.ts`, `lib/use-translation.ts` остаются как есть.

## Обработка ошибок

Как в текущей странице: setText/setImage бросают → показываем сообщение об ошибке в баннере, состояние поля не сбрасываем. Upload fail → сообщение, оверрайд не пишется.

## Тестирование

`lib/content-registry.test.ts` (vitest):
1. Каждый `text`-entry: ключ существует в `translations.ru` И `translations.en` И `translations.lv` (ловит опечатки и удалённые ключи).
2. Каждый `image`-entry: `src` начинается с `/` (локальный путь) и соответствующий файл существует в `public/` (`fs.existsSync(path.join('public', src))`) — ловит повторение hero-бага с несуществующим путём.
3. `id` секций и `key`/`src` записей уникальны по всему реестру.

UI страницы — без компонентных тестов (нет testing-library в репо, ни одна админ-страница их не имеет); ручная верификация: открыть /admin/content, изменить hero.title через секцию, увидеть на главной; сбросить; загрузить картинку для /hero.jpg, увидеть замену.

## Вне рамок

- Хардкод-текст DeliveryInfo/PaymentInfo/app/delivery-payment (саб-проект 2).
- Логотип HeaderLogo (саб-проект 3).
- Персистентность public/uploads на Vercel (саб-проект 4) — существующий upload используется как есть, его надёжность чинится отдельно.
- Stores, company.ts (саб-проект 5).
- Автогенерация реестра из кода, inline-редактирование на самой витрине, история изменений.
- Мёртвые Showcases и нерендерящиеся типы баннеров — отдельная уборка, не здесь.
