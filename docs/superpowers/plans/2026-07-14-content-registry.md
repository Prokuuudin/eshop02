# Content Registry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `/admin/content` a curated, browsable registry of every editable text/image so an admin can change site content without knowing translation keys or file paths.

**Architecture:** A new static typed array (`lib/content-registry.ts`) lists content sections (page/zone) with text entries (translation keys) and image entries (base src paths). The admin page is rewritten to render this registry as accordions with inline editing, calling the EXISTING override API (`useSiteContent()`: `setText`/`setImage`/`removeText`/`removeImage`). The old free-form editors move into a collapsed "expert mode" section. Zero backend changes.

**Tech Stack:** Next.js App Router (client page), existing `lib/use-site-content.ts` hook, existing `POST /api/admin/content/upload`, Vitest.

## Global Constraints

- Backend untouched: `lib/site-content-server-store.ts`, `app/api/admin/content/route.ts`, `app/api/admin/content/upload/route.ts`, `lib/use-site-content.ts`, `lib/use-translation.ts` must not change (spec, «Бэкенд»).
- Registry v1 contains ONLY content already wired through `t()` / `resolveImageSrc` — no DeliveryInfo/PaymentInfo keys, no logo (spec, «Наполнение v1»).
- The old free-form editors (arbitrary key, arbitrary src pair, previews) and the active-override lists are KEPT, moved into a collapsed «Экспертный режим» section — logic unchanged (spec, «Экспертный режим»).
- `COMMON_TEXT_KEYS` / `COMMON_IMAGE_PATHS` are deleted (removes the broken `/hero/hero-main.webp` hint) (spec, «Попутные фиксы»).
- Long texts (`faq.site.a*`, `about.welcome.p*`, `about.storesInfo`, `contact.info`, `contact.faq.a*`) get `multiline: true` → textarea (spec, «Наполнение v1»).
- Registry labels are Russian (the admin UI is Russian-language throughout).
- No component tests for the page (no testing-library in repo); the registry gets a Vitest validity test.

---

### Task 1: Content registry + validity test

**Files:**
- Create: `lib/content-registry.ts`
- Test: `lib/content-registry.test.ts`

**Interfaces:**
- Consumes: `translations` from `@/data/translations` (test only), `fs`/`path` (test only).
- Produces: `ContentEntry` (union: `{ type: 'text'; key: string; label: string; multiline?: boolean }` | `{ type: 'image'; src: string; label: string }`), `ContentSection` (`{ id: string; title: string; entries: ContentEntry[] }`), `CONTENT_REGISTRY: ContentSection[]` — consumed by Task 2.

- [ ] **Step 1: Write the failing test**

Create `lib/content-registry.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { translations } from '@/data/translations'
import { CONTENT_REGISTRY } from './content-registry'

const LANGUAGES = ['ru', 'en', 'lv'] as const

describe('CONTENT_REGISTRY validity', () => {
  it('has at least the 7 sections from the spec', () => {
    expect(CONTENT_REGISTRY.length).toBeGreaterThanOrEqual(7)
  })

  it('every text entry key exists in all three languages', () => {
    for (const section of CONTENT_REGISTRY) {
      for (const entry of section.entries) {
        if (entry.type !== 'text') continue
        for (const lang of LANGUAGES) {
          expect(
            translations[lang][entry.key],
            `key "${entry.key}" (section "${section.id}") missing in "${lang}"`
          ).toBeTruthy()
        }
      }
    }
  })

  it('every image entry src is a local path pointing at an existing file in public/', () => {
    for (const section of CONTENT_REGISTRY) {
      for (const entry of section.entries) {
        if (entry.type !== 'image') continue
        expect(entry.src.startsWith('/'), `src "${entry.src}" must start with /`).toBe(true)
        const filePath = path.join(process.cwd(), 'public', entry.src)
        expect(
          fs.existsSync(filePath),
          `file for src "${entry.src}" (section "${section.id}") not found at ${filePath}`
        ).toBe(true)
      }
    }
  })

  it('section ids, text keys, and image srcs are unique across the registry', () => {
    const ids = CONTENT_REGISTRY.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)

    const keys = CONTENT_REGISTRY.flatMap((s) =>
      s.entries.filter((e) => e.type === 'text').map((e) => (e as { key: string }).key)
    )
    expect(new Set(keys).size).toBe(keys.length)

    const srcs = CONTENT_REGISTRY.flatMap((s) =>
      s.entries.filter((e) => e.type === 'image').map((e) => (e as { src: string }).src)
    )
    expect(new Set(srcs).size).toBe(srcs.length)
  })

  it('every entry has a non-empty Russian label', () => {
    for (const section of CONTENT_REGISTRY) {
      expect(section.title.trim()).not.toBe('')
      for (const entry of section.entries) {
        expect(entry.label.trim(), `entry in "${section.id}"`).not.toBe('')
      }
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/content-registry.test.ts`
Expected: FAIL — `Cannot find module './content-registry'`.

- [ ] **Step 3: Implement `lib/content-registry.ts`**

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/content-registry.test.ts`
Expected: PASS (5 tests). If a key/path assertion fails, fix the registry entry (check the actual key in `data/translations.ts` / the actual file in `public/`) — do not weaken the test.

- [ ] **Step 5: Run tsc**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add lib/content-registry.ts lib/content-registry.test.ts
git commit -m "feat(admin): curated content registry with validity test"
```

---

### Task 2: Rewrite /admin/content around the registry

**Files:**
- Modify: `app/admin/content/page.tsx` (full replacement)

**Interfaces:**
- Consumes: `CONTENT_REGISTRY`, `ContentEntry`, `ContentSection` (Task 1); `useSiteContent()` from `@/lib/use-site-content` (`overrides: SiteContentOverrides`, `resolveImageSrc(src): string`, `setText(lang, key, value): Promise<void>`, `setImage(src, target): Promise<void>`, `removeText(lang, key): Promise<void>`, `removeImage(src): Promise<void>`, `clearAll(): Promise<void>`); `translations` from `@/data/translations`; `POST /api/admin/content/upload` (FormData `file` → `{ path }`).
- Produces: nothing consumed by later tasks (final task).

- [ ] **Step 1: Replace the full content of `app/admin/content/page.tsx`**

```tsx
'use client'

import React from 'react'
import Link from 'next/link'
import { ChevronDown } from 'lucide-react'
import { useSiteContent } from '@/lib/use-site-content'
import { translations } from '@/data/translations'
import { CONTENT_REGISTRY, type ContentEntry } from '@/lib/content-registry'
import AdminGate from '@/components/admin/AdminGate'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

type Language = 'ru' | 'en' | 'lv'

async function uploadImageFile(file: File): Promise<string> {
  const formData = new FormData()
  formData.append('file', file)
  const response = await fetch('/api/admin/content/upload', { method: 'POST', body: formData })
  if (!response.ok) throw new Error('failed_to_upload_image')
  const data = (await response.json()) as { path?: string }
  if (!data.path) throw new Error('invalid_upload_response')
  return data.path
}

function ChangedBadge() {
  return (
    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
      изменено
    </span>
  )
}

function TextEntryRow({
  entry,
  language,
  overrideValue,
  baseValue,
  onSave,
  onReset,
}: {
  entry: Extract<ContentEntry, { type: 'text' }>
  language: Language
  overrideValue: string | undefined
  baseValue: string | undefined
  onSave: (value: string) => Promise<void>
  onReset: () => Promise<void>
}) {
  const currentValue = overrideValue ?? baseValue ?? ''
  const [value, setValue] = React.useState(currentValue)
  const [busy, setBusy] = React.useState(false)
  const dirty = value !== currentValue

  // Language switches remount rows via key={...} in the parent, so no resync effect is needed.

  const save = async () => {
    setBusy(true)
    try {
      await onSave(value)
    } finally {
      setBusy(false)
    }
  }

  const reset = async () => {
    setBusy(true)
    try {
      await onReset()
      setValue(baseValue ?? '')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-md border border-border p-3 space-y-2">
      <div className="flex items-center gap-2">
        <p className="text-sm font-medium text-foreground">{entry.label}</p>
        {overrideValue !== undefined && <ChangedBadge />}
        <code className="ml-auto text-[10px] text-muted-foreground">{entry.key}</code>
      </div>
      {entry.multiline ? (
        <Textarea value={value} onChange={(e) => setValue(e.target.value)} className="min-h-[96px]" />
      ) : (
        <Input value={value} onChange={(e) => setValue(e.target.value)} />
      )}
      <div className="flex gap-2">
        <Button size="sm" onClick={() => void save()} disabled={busy || !dirty}>
          Сохранить
        </Button>
        {overrideValue !== undefined && (
          <Button size="sm" variant="outline" onClick={() => void reset()} disabled={busy}>
            Сбросить к базовому
          </Button>
        )}
      </div>
    </div>
  )
}

function ImageEntryRow({
  entry,
  overridden,
  resolvedSrc,
  onUploadAndSet,
  onReset,
}: {
  entry: Extract<ContentEntry, { type: 'image' }>
  overridden: boolean
  resolvedSrc: string
  onUploadAndSet: (file: File) => Promise<void>
  onReset: () => Promise<void>
}) {
  const [busy, setBusy] = React.useState(false)

  const onFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    setBusy(true)
    try {
      await onUploadAndSet(file)
    } finally {
      setBusy(false)
      event.target.value = ''
    }
  }

  return (
    <div className="rounded-md border border-border p-3 space-y-2">
      <div className="flex items-center gap-2">
        <p className="text-sm font-medium text-foreground">{entry.label}</p>
        {overridden && <ChangedBadge />}
        <code className="ml-auto text-[10px] text-muted-foreground">{entry.src}</code>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={resolvedSrc}
        alt={entry.label}
        className="h-28 w-full rounded-md border border-border object-contain bg-muted"
      />
      <div className="flex flex-wrap items-center gap-2">
        <Input type="file" accept="image/*" disabled={busy} onChange={(e) => void onFileChange(e)} className="max-w-xs" />
        {overridden && (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => { setBusy(true); void onReset().finally(() => setBusy(false)) }}>
            Сбросить
          </Button>
        )}
      </div>
    </div>
  )
}

export default function AdminContentPage() {
  const { overrides, resolveImageSrc, setText, setImage, removeText, removeImage, clearAll } = useSiteContent()

  const [language, setLanguage] = React.useState<Language>('ru')
  const [openSectionId, setOpenSectionId] = React.useState<string | null>(CONTENT_REGISTRY[0]?.id ?? null)
  const [message, setMessage] = React.useState('')
  const [saving, setSaving] = React.useState(false)

  // Expert mode state (free-form editors, unchanged logic from the previous page version)
  const [textKey, setTextKey] = React.useState('')
  const [textValue, setTextValue] = React.useState('')
  const [imageFrom, setImageFrom] = React.useState('')
  const [imageTo, setImageTo] = React.useState('')
  const [uploadingImage, setUploadingImage] = React.useState(false)
  const [sourcePreviewFailed, setSourcePreviewFailed] = React.useState(false)
  const [targetPreviewFailed, setTargetPreviewFailed] = React.useState(false)

  const normalizedTextKey = textKey.trim()
  const baseTranslation = normalizedTextKey ? translations[language][normalizedTextKey] : undefined
  const existingOverride = normalizedTextKey ? overrides.text[language]?.[normalizedTextKey] : undefined
  const currentText = existingOverride ?? baseTranslation
  const nextText = textValue.trim() ? textValue : baseTranslation

  React.useEffect(() => { setSourcePreviewFailed(false) }, [imageFrom])
  React.useEffect(() => { setTargetPreviewFailed(false) }, [imageTo])

  const run = async (action: () => Promise<void>, ok: string, fail: string) => {
    setSaving(true)
    try {
      await action()
      setMessage(ok)
    } catch {
      setMessage(fail)
    } finally {
      setSaving(false)
    }
  }

  const onUploadImage = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    setUploadingImage(true)
    try {
      const path = await uploadImageFile(file)
      setImageTo(path)
      setMessage('Файл загружен. Новый путь подставлен в поле "Новый src".')
    } catch {
      setMessage('Не удалось загрузить файл.')
    } finally {
      setUploadingImage(false)
      event.target.value = ''
    }
  }

  return (
    <AdminGate>
      <main className="w-full py-4 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">Управление контентом сайта</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Тексты и картинки сайта по разделам. Изменения применяются сразу, без деплоя.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/admin/content/banners">
              <Button variant="outline">Баннеры и блоки</Button>
            </Link>
            <Link href="/admin">
              <Button variant="outline">Назад в админку</Button>
            </Link>
            <Button
              variant="destructive"
              disabled={saving}
              onClick={() => void run(clearAll, 'Все override очищены.', 'Не удалось очистить override.')}
            >
              Сбросить все
            </Button>
          </div>
        </div>

        {message && (
          <div className="rounded-md border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-900/20 dark:text-green-300">
            {message}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {(['ru', 'en', 'lv'] as Language[]).map((lang) => (
            <Button key={lang} variant={language === lang ? 'default' : 'outline'} size="sm" onClick={() => setLanguage(lang)}>
              {lang.toUpperCase()}
            </Button>
          ))}
        </div>

        {/* Registry sections */}
        <section className="space-y-3">
          {CONTENT_REGISTRY.map((section) => {
            const isOpen = openSectionId === section.id
            const changedCount = section.entries.filter((entry) =>
              entry.type === 'text'
                ? overrides.text[language]?.[entry.key] !== undefined
                : overrides.images[entry.src] !== undefined
            ).length

            return (
              <div key={section.id} className="rounded-lg border border-border bg-card">
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-4 py-3 text-left"
                  aria-expanded={isOpen}
                  onClick={() => setOpenSectionId(isOpen ? null : section.id)}
                >
                  <span className="font-semibold text-foreground">{section.title}</span>
                  {changedCount > 0 && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                      {changedCount} изм.
                    </span>
                  )}
                  <ChevronDown className={`ml-auto h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>

                {isOpen && (
                  <div className="grid grid-cols-1 gap-3 border-t border-border p-4 lg:grid-cols-2">
                    {section.entries.map((entry) =>
                      entry.type === 'text' ? (
                        <TextEntryRow
                          key={`${language}-${entry.key}`}
                          entry={entry}
                          language={language}
                          overrideValue={overrides.text[language]?.[entry.key]}
                          baseValue={translations[language][entry.key]}
                          onSave={(value) =>
                            run(() => setText(language, entry.key, value), 'Текст сохранен.', 'Не удалось сохранить текст.')
                          }
                          onReset={() =>
                            run(() => removeText(language, entry.key), 'Override удален.', 'Не удалось удалить override.')
                          }
                        />
                      ) : (
                        <ImageEntryRow
                          key={entry.src}
                          entry={entry}
                          overridden={overrides.images[entry.src] !== undefined}
                          resolvedSrc={resolveImageSrc(entry.src)}
                          onUploadAndSet={async (file) => {
                            await run(
                              async () => {
                                const path = await uploadImageFile(file)
                                await setImage(entry.src, path)
                              },
                              'Картинка заменена.',
                              'Не удалось заменить картинку.'
                            )
                          }}
                          onReset={() =>
                            run(() => removeImage(entry.src), 'Override удален.', 'Не удалось удалить override.')
                          }
                        />
                      )
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </section>

        {/* Expert mode: free-form editors + active override lists (logic unchanged) */}
        <details className="rounded-lg border border-border bg-card">
          <summary className="cursor-pointer px-4 py-3 font-semibold text-foreground">
            Экспертный режим (произвольные ключи и пути)
          </summary>
          <div className="space-y-4 border-t border-border p-4">
            <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="rounded-lg border border-border bg-card p-4 space-y-3">
                <h2 className="text-lg font-semibold text-foreground">Тексты</h2>
                <p className="text-sm text-muted-foreground">
                  Редактируйте тексты по ключам переводов (например: hero.title, newsletter.title).
                </p>

                <Input value={textKey} onChange={(e) => setTextKey(e.target.value)} placeholder="Ключ текста, например hero.title" />
                <Textarea value={textValue} onChange={(e) => setTextValue(e.target.value)} placeholder="Новое значение текста" className="min-h-[120px]" />

                {(normalizedTextKey || textValue.trim()) && (
                  <div className="space-y-2 rounded-md border border-border p-3">
                    <p className="text-xs text-muted-foreground">Сравнение текста до сохранения:</p>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-gray-700 dark:text-gray-200">Было (Текущее на сайте)</p>
                        <div className="min-h-[96px] rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 whitespace-pre-wrap">
                          {currentText || 'Значение для этого ключа пока не найдено.'}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <p className="text-xs font-medium text-gray-700 dark:text-gray-200">Стало (После сохранения)</p>
                        <div className="min-h-[96px] rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 whitespace-pre-wrap">
                          {nextText || 'Пусто. Если сохранить, override будет удален.'}
                        </div>
                      </div>
                    </div>

                    {normalizedTextKey && !baseTranslation && (
                      <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
                        В базовом словаре переводов ключ не найден. Будет создан только override.
                      </div>
                    )}
                  </div>
                )}

                <Button
                  onClick={() => {
                    if (!textKey.trim()) return
                    void run(() => setText(language, textKey, textValue), 'Текст сохранен.', 'Не удалось сохранить текст.')
                  }}
                  disabled={saving}
                >
                  Сохранить текст
                </Button>
              </div>

              <div className="rounded-lg border border-border bg-card p-4 space-y-3">
                <h2 className="text-lg font-semibold text-foreground">Картинки</h2>
                <p className="text-sm text-muted-foreground">
                  Заменяйте изображения, подменяя исходный src на новый путь или URL.
                </p>

                <Input value={imageFrom} onChange={(e) => setImageFrom(e.target.value)} placeholder="Исходный src, например /icons/original.svg" />
                <Input value={imageTo} onChange={(e) => setImageTo(e.target.value)} placeholder="Новый src, например /uploads/new-icon.svg" />

                {(imageFrom.trim() || imageTo.trim()) && (
                  <div className="space-y-2 rounded-md border border-border p-3">
                    <p className="text-xs text-muted-foreground">Сравнение изображений до сохранения:</p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-gray-700 dark:text-gray-200">Было (Исходный src)</p>
                        {imageFrom.trim() ? (
                          !sourcePreviewFailed ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={imageFrom}
                              alt="Исходное изображение"
                              className="h-36 w-full rounded-md border border-border object-contain bg-muted"
                              onLoad={() => setSourcePreviewFailed(false)}
                              onError={() => setSourcePreviewFailed(true)}
                            />
                          ) : (
                            <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
                              Не удалось загрузить исходное изображение.
                            </div>
                          )
                        ) : (
                          <div className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
                            Укажите исходный src для превью.
                          </div>
                        )}
                      </div>

                      <div className="space-y-2">
                        <p className="text-xs font-medium text-gray-700 dark:text-gray-200">Стало (Новый src)</p>
                        {imageTo.trim() ? (
                          !targetPreviewFailed ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={imageTo}
                              alt="Новое изображение"
                              className="h-36 w-full rounded-md border border-border object-contain bg-muted"
                              onLoad={() => setTargetPreviewFailed(false)}
                              onError={() => setTargetPreviewFailed(true)}
                            />
                          ) : (
                            <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
                              Не удалось загрузить новое изображение.
                            </div>
                          )
                        ) : (
                          <div className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
                            Укажите новый src для превью.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                <div className="space-y-2 rounded-md border border-dashed border-border p-3">
                  <p className="text-xs text-muted-foreground">Или загрузите новый файл изображения (до 10MB):</p>
                  <Input type="file" accept="image/*" disabled={uploadingImage || saving} onChange={(e) => void onUploadImage(e)} />
                </div>
                <Button
                  onClick={() => {
                    if (!imageFrom.trim()) return
                    void run(() => setImage(imageFrom, imageTo), 'Переопределение картинки сохранено.', 'Не удалось сохранить переопределение картинки.')
                  }}
                  disabled={saving}
                >
                  Сохранить картинку
                </Button>
              </div>
            </section>

            <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="rounded-lg border border-border bg-card p-4">
                <h3 className="font-semibold mb-3 text-foreground">Текущие text override ({language.toUpperCase()})</h3>
                <div className="space-y-2 max-h-[380px] overflow-auto pr-1">
                  {Object.entries(overrides.text[language] ?? {}).map(([key, value]) => (
                    <div key={key} className="rounded border border-border p-2">
                      <p className="text-xs text-muted-foreground">{key}</p>
                      <p className="text-sm text-foreground whitespace-pre-wrap">{value}</p>
                      <div className="mt-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={saving}
                          onClick={() => void run(() => removeText(language, key), 'Текстовый override удален.', 'Не удалось удалить text override.')}
                        >
                          Удалить
                        </Button>
                      </div>
                    </div>
                  ))}
                  {Object.keys(overrides.text[language] ?? {}).length === 0 && (
                    <p className="text-sm text-muted-foreground">Пока нет override для этого языка.</p>
                  )}
                </div>
              </div>

              <div className="rounded-lg border border-border bg-card p-4">
                <h3 className="font-semibold mb-3 text-foreground">Текущие image override</h3>
                <div className="space-y-2 max-h-[380px] overflow-auto pr-1">
                  {Object.entries(overrides.images).map(([from, to]) => (
                    <div key={from} className="rounded border border-border p-2">
                      <p className="text-xs text-muted-foreground">{from}</p>
                      <p className="text-sm text-foreground break-all">{to}</p>
                      <div className="mt-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={saving}
                          onClick={() => void run(() => removeImage(from), 'Переопределение картинки удалено.', 'Не удалось удалить image override.')}
                        >
                          Удалить
                        </Button>
                      </div>
                    </div>
                  ))}
                  {Object.keys(overrides.images).length === 0 && (
                    <p className="text-sm text-muted-foreground">Пока нет image override.</p>
                  )}
                </div>
              </div>
            </section>
          </div>
        </details>
      </main>
    </AdminGate>
  )
}
```

- [ ] **Step 2: Run tsc and the full test suite**

Run: `npx tsc --noEmit -p tsconfig.json && npx vitest run`
Expected: no type errors; all test files pass (47 files after Task 1).

- [ ] **Step 3: Manual verification**

Run: `npm run dev`. Log in as admin, open `/admin/content`. Confirm:
- Accordion sections render («Главная — Hero» open by default); no `COMMON_TEXT_KEYS`/`COMMON_IMAGE_PATHS` chips anywhere; the string `/hero/hero-main.webp` does not appear on the page.
- In «Главная — Hero», edit «Заголовок», save → open `/` in another tab → new title shows. Press «Сбросить к базовому» → title reverts.
- In «Главная — Hero», upload an image file for «Фоновая картинка» → preview updates, badge «изменено» appears, homepage hero shows the new image. «Сбросить» reverts.
- Switch language to EN → text fields show English base values; RU override badge no longer shows (overrides are per-language).
- Expand «Экспертный режим» → free-form text/image editors and both override lists work as before.

- [ ] **Step 4: Commit**

```bash
git add app/admin/content/page.tsx
git commit -m "feat(admin): registry-driven content editor with inline editing and expert mode"
```
