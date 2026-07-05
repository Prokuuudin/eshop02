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

2. Copy the env template and fill in values (see [Environment variables](#environment-variables) below):

```bash
cp .env.example .env.local
```

`DATABASE_URL` is read by Prisma from `.env` specifically (not `.env.local`) — copy it there too, or export it in your shell before running `prisma` commands.

3. Start dev server:

```bash
npm run dev
```

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Start the dev server (webpack, not Turbopack) |
| `npm run build` | `prisma migrate deploy && prisma generate && next build` |
| `npm run start` | Start the production server (after `build`) |
| `npm run lint` | ESLint via `eslint .` (`next lint` was removed in Next 16) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run test:unit` | Vitest unit tests |
| `npm run test:unit:watch` | Vitest in watch mode |
| `npm run test:e2e` | Playwright e2e tests |
| `npm run test:e2e:smoke` | A smaller Playwright smoke subset (critical/admin/RBAC/activation/wishlist/invoices flows) |

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes | Postgres connection string (Prisma). Read from `.env`, not `.env.local`. |
| `NEXT_PUBLIC_SITE_URL` | yes | Canonical base URL for OG/JSON-LD/robots/sitemap |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | optional | Cloudflare Turnstile public site key (contact form) |
| `TURNSTILE_SECRET_KEY` | optional | Cloudflare Turnstile secret key — server-side verification |
| `STRIPE_SECRET_KEY` | yes for payments | Stripe secret key (server-side only) |
| `STRIPE_WEBHOOK_SECRET` | yes for payments | Verifies the Stripe webhook signature |
| `NEXT_PUBLIC_FIRST_LOGIN_PASSWORD` | yes | Universal first-login password for newly provisioned B2B accounts (must change on first login) |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | yes for email | Outgoing mail (registration confirmation, notifications) |
| `CONTACT_TO` | optional | Recipient for the contact form (defaults to `SMTP_USER`) |

See `.env.example` for the full template (values left blank/placeholder).

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

-   **Next.js 16** (app router, SSR/ISR, webpack build — not Turbopack)
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

Storybook is not installed in this project (no config, no `storybook` script, no `.stories.tsx` files exist yet). If you want it, run `npx storybook@latest init` and add stories under `components/ui/`.

## Принципы

-   Все UI через компоненты из `ui/`
-   Бизнес-логика через хуки и store
-   Переводы централизованы
-   Архитектура — чистая, масштабируемая, легко поддерживаемая
