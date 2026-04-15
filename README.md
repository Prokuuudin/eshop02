# Eshop02 — Professional Cosmetics (Scaffold)

This repository contains the initial architecture and configuration for an online professional cosmetics store using Next.js (App Router), React, TypeScript, Tailwind CSS and tooling.

Key points:

-   Next.js is the primary framework (app router) — not Vite. See notes below.
-   Strict TypeScript: `strict` + `noImplicitAny` enabled.
-   Mobile-first, SEO-ready layout using Next `app/` and metadata.
-   BEM-style class naming for components even when using Tailwind utilities.

Getting started

1. Install dependencies:

```bash
npm install
```

2. Start dev server:

```bash
npm run dev
```

## Deploy (GitHub + Vercel)

Полная пошаговая инструкция с чеклистом домена и env находится в [docs/deploy-github-vercel.md](docs/deploy-github-vercel.md).

## Production SEO env

Set `NEXT_PUBLIC_SITE_URL` in production (for canonical URLs, OpenGraph URLs, `robots.txt`, `sitemap.xml`, and JSON-LD links).

For local setup, copy `.env.example` to `.env.local` and set your local/preview URL if needed.

Example:

```bash
NEXT_PUBLIC_SITE_URL=https://your-domain.com
```

Notes:

-   Value must include protocol (`https://`).
-   Do not include a trailing slash.
-   Configure this in your hosting environment variables (Vercel/Render/Docker/etc.).

## Contact form anti-spam (Cloudflare Turnstile)

Контактная форма использует серверную антиспам-проверку (rate limit + honeypot + timing check) и опциональную CAPTCHA через Cloudflare Turnstile.

### 1) Получите ключи Turnstile

-   В Cloudflare Turnstile создайте новый widget для вашего домена.
-   Сохраните два ключа:
-   Site key (публичный)
-   Secret key (серверный)

### 2) Добавьте env-переменные

В `.env.local`:

```bash
NEXT_PUBLIC_TURNSTILE_SITE_KEY=your_site_key
TURNSTILE_SECRET_KEY=your_secret_key
```

Поведение:

-   Если задан только `NEXT_PUBLIC_TURNSTILE_SITE_KEY` — виджет отобразится на клиенте.
-   Если задан `TURNSTILE_SECRET_KEY` — сервер будет требовать валидный токен CAPTCHA.
-   Для полноценной защиты в production задавайте обе переменные.

### 3) Локальная проверка

1. Запустите приложение: `npm run dev`
2. Откройте `/contact`
3. Убедитесь, что виджет Turnstile отрисован
4. Отправьте форму:
    - без токена — ожидается ошибка CAPTCHA
    - с валидным токеном — успешная отправка

### 4) Что уже реализовано в API

-   Rate limit по IP (5 запросов / 10 минут)
-   Honeypot поле
-   Проверка минимального времени заполнения
-   Проверка Origin/Host
-   Валидация длины и формата полей
-   Верификация Turnstile токена (если `TURNSTILE_SECRET_KEY` задан)

shadcn/ui

To integrate `shadcn/ui` later (component primitives + Radix + Tailwind):

```bash
npm install tailwindcss postcss autoprefixer
npx shadcn@latest init
```

Vite vs Next.js

-   Next.js uses its own build system and routing (including server components, server-side rendering, and optimizations like image handling). Vite is a fast bundler/dev tool but is not a drop-in replacement for Next's server features.
-   Recommended architecture: Use Next.js as the main application framework. If you need a Vite-based playground or a separate UI-component library for isolated development/test, create a separate package (monorepo) using Vite for that library only.

## Архитектура

-   **Next.js 14** (app router, SSR/ISR)
-   **TypeScript** (строгая типизация)
-   **Tailwind CSS** (utility-first стили)
-   **shadcn/ui** (унифицированные UI-компоненты)
-   **Zustand** (store для корзины, избранного)
-   **i18n** (три языка, централизованные переводы)
-   **data/** (products, brands, categories)
-   **components/** (разделение на UI, layout, бизнес-логику)

## Схема данных

-   `Brand`: { id, name, logo, popular }
-   `Product`: { id, title, brand, price, oldPrice, rating, image, badges, category, stock, purpose }

## Примеры использования UI-компонентов

```tsx
import { Button } from './components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from './components/ui/card';

<Button>Купить</Button>

<Card>
  <CardHeader>
    <CardTitle>Товар</CardTitle>
  </CardHeader>
  <CardContent>Описание товара</CardContent>
</Card>
```

## Storybook

-   Для запуска Storybook:
    1. Установить: `npx storybook@latest init`
    2. Запустить: `npm run storybook`
-   Все UI-компоненты (button, card, dialog, badge, checkbox) имеют отдельные stories.
-   Примеры:
    -   `components/ui/button.stories.tsx`
    -   `components/ui/card.stories.tsx`

## Принципы

-   Все UI через компоненты из `ui/`
-   Бизнес-логика через хуки и store
-   Переводы централизованы
-   Архитектура — чистая, масштабируемая, легко поддерживаемая
