# Uploads Persistence (MediaAsset в Neon) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Картинки админки хранятся в новой таблице Neon `MediaAsset` вместо эфемерной файловой системы Vercel; три админ-роута переписываются с fs на Prisma, добавляется публичный serving-роут.

**Architecture:** Одна новая Prisma-модель `MediaAsset` (name PK, bytea). Таблица создаётся идемпотентным скриптом через WebSocket-канал (Prisma CLI требует TCP 5432, который блокирует VPN пользователя). Публичный `GET /api/media/[name]` отдаёт байты с CDN-кэшем на час. Формы запросов/ответов админ-API сохраняются — клиентские админ-страницы не меняются.

**Tech Stack:** Next.js 16 App Router route handlers, Prisma 7 + `@prisma/adapter-neon` (WebSocket 443), vitest (prisma мокается).

**Spec:** `docs/superpowers/specs/2026-07-14-uploads-persistence-design.md`

## Global Constraints

- Существующие таблицы Neon НЕ трогать — только новая таблица `MediaAsset`.
- MIME-whitelist БЕЗ SVG: `image/jpeg`, `image/png`, `image/webp`, `image/gif`, `image/avif` (SVG = stored XSS при same-origin отдаче; комментарий об этом сохранить в коде).
- Лимит файла 10MB (`10 * 1024 * 1024`).
- Формы ответов админ-роутов не меняются (только префикс пути `/uploads/` → `/api/media/`); файлы `app/admin/content/page.tsx`, `app/admin/content/banners/page.tsx`, `app/admin/content/media/page.tsx` НЕ модифицировать.
- Все роуты: `export const runtime = 'nodejs'`.
- Admin-гейт: `const __gate = await requireAdmin(); if (__gate instanceof NextResponse) return __gate`.
- Коды ошибок — прежний словарь: `file_is_required`, `unsupported_file_type`, `file_too_large`, `invalid_filename`, `file_required`, `unsupported_type`, `name_required`, `failed_to_upload_file`, `failed_to_delete`, `replace_failed`.
- Проверка типов: `npx tsc --noEmit -p tsconfig.json`. Тесты: `npx vitest run <файл>`.
- В worktree перед началом: скопировать `.env` и `.env.local` из основного репо, `npm install`, `npx prisma generate` — иначе `@/generated/prisma/client` отсутствует.

---

### Task 1: Модель MediaAsset + скрипт создания таблицы

**Files:**
- Modify: `prisma/schema.prisma` (добавить модель в конец файла)
- Create: `scripts/apply-media-asset-table.ts`

**Interfaces:**
- Produces: Prisma-модель `prisma.mediaAsset` с полями `name: string` (PK), `mimeType: string`, `size: number`, `data: Uint8Array` (Bytes), `createdAt: Date`, `updatedAt: Date` (@updatedAt). Реальная таблица `"MediaAsset"` в Neon. Последующие задачи используют `prisma.mediaAsset.create / findUnique / findMany / deleteMany / update`.

- [ ] **Step 1: Добавить модель в schema.prisma**

В конец `prisma/schema.prisma` добавить:

```prisma
model MediaAsset {
  name      String   @id
  mimeType  String
  size      Int
  data      Bytes
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

- [ ] **Step 2: Перегенерировать клиент**

Run: `npx prisma generate`
Expected: `Generated Prisma Client` без ошибок (БД не нужна).

- [ ] **Step 3: Написать скрипт создания таблицы**

Create `scripts/apply-media-asset-table.ts`:

```ts
/**
 * One-off: создать таблицу MediaAsset в Neon через WebSocket (443).
 * Prisma CLI (migrate/db push) требует TCP 5432, который блокирует VPN —
 * поэтому таблица создаётся через рабочий канал приложения.
 * Идемпотентен: CREATE TABLE IF NOT EXISTS, можно запускать повторно.
 *
 * Usage: npx tsx scripts/apply-media-asset-table.ts
 */
import { config } from 'dotenv'
config({ path: '.env.local' })

async function main() {
  const { prisma } = await import('../lib/prisma')

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "MediaAsset" (
      "name"      TEXT NOT NULL,
      "mimeType"  TEXT NOT NULL,
      "size"      INTEGER NOT NULL,
      "data"      BYTEA NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("name")
    );
  `)

  const columns = await prisma.$queryRawUnsafe<{ column_name: string }[]>(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'MediaAsset' ORDER BY ordinal_position`
  )
  console.log('MediaAsset columns:', columns.map((c) => c.column_name).join(', '))

  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
```

- [ ] **Step 4: Применить скрипт к Neon**

Run: `npx tsx scripts/apply-media-asset-table.ts`
Expected: `MediaAsset columns: name, mimeType, size, data, createdAt, updatedAt`

Повторный запуск для проверки идемпотентности — тот же вывод, без ошибок.

- [ ] **Step 5: Проверка типов**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: без ошибок.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma scripts/apply-media-asset-table.ts
git commit -m "feat(media): MediaAsset model and table-creation script for Neon"
```

---

### Task 2: Публичный serving-роут GET /api/media/[name]

**Files:**
- Create: `app/api/media/[name]/route.ts`
- Test: `app/api/media/[name]/route.test.ts`

**Interfaces:**
- Consumes: `prisma.mediaAsset.findUnique({ where: { name } })` → `{ name, mimeType, size, data, createdAt, updatedAt } | null` (Task 1).
- Produces: публичный URL-формат `/api/media/<name>` — Tasks 3–5 возвращают пути в этом формате.

- [ ] **Step 1: Написать падающие тесты**

Create `app/api/media/[name]/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    mediaAsset: { findUnique: vi.fn() },
  },
}))

import { prisma } from '@/lib/prisma'
import { GET } from './route'

function call(name: string) {
  const req = new NextRequest(`http://localhost/api/media/${encodeURIComponent(name)}`)
  return GET(req, { params: Promise.resolve({ name }) })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/media/[name]', () => {
  it('rejects path-traversal names', async () => {
    const res = await call('../secret.png')
    expect(res.status).toBe(400)
    expect(prisma.mediaAsset.findUnique).not.toHaveBeenCalled()
  })

  it('returns 404 for a missing asset', async () => {
    vi.mocked(prisma.mediaAsset.findUnique as any).mockResolvedValue(null)
    const res = await call('nope.png')
    expect(res.status).toBe(404)
  })

  it('serves bytes with content-type, nosniff and cache headers', async () => {
    vi.mocked(prisma.mediaAsset.findUnique as any).mockResolvedValue({
      name: '123-pic.png',
      mimeType: 'image/png',
      size: 3,
      data: new Uint8Array([1, 2, 3]),
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const res = await call('123-pic.png')

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/png')
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(res.headers.get('Cache-Control')).toBe(
      'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400'
    )
    const body = new Uint8Array(await res.arrayBuffer())
    expect(Array.from(body)).toEqual([1, 2, 3])
  })
})
```

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `npx vitest run app/api/media/[name]/route.test.ts`
Expected: FAIL — `./route` не существует.

- [ ] **Step 3: Реализовать роут**

Create `app/api/media/[name]/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'

function safeName(name: string): boolean {
  return Boolean(name) && !name.includes('/') && !name.includes('..') && !name.includes('\\')
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params

  if (!safeName(name)) {
    return NextResponse.json({ error: 'invalid_filename' }, { status: 400 })
  }

  try {
    const asset = await prisma.mediaAsset.findUnique({ where: { name } })
    if (!asset) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 })
    }

    return new NextResponse(Buffer.from(asset.data), {
      status: 200,
      headers: {
        'Content-Type': asset.mimeType,
        'Content-Length': String(asset.size),
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400',
      },
    })
  } catch {
    return NextResponse.json({ error: 'failed_to_serve' }, { status: 500 })
  }
}
```

- [ ] **Step 4: Убедиться, что тесты проходят**

Run: `npx vitest run app/api/media/[name]/route.test.ts`
Expected: 3 passed.

- [ ] **Step 5: Проверка типов**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: без ошибок.

- [ ] **Step 6: Commit**

```bash
git add "app/api/media/[name]/route.ts" "app/api/media/[name]/route.test.ts"
git commit -m "feat(media): public serving route for DB-stored media"
```

---

### Task 3: Переписать upload-роут на Prisma

**Files:**
- Modify: `app/api/admin/content/upload/route.ts` (полная замена содержимого)
- Test: `app/api/admin/content/upload/route.test.ts` (новый)

**Interfaces:**
- Consumes: `prisma.mediaAsset.create({ data: { name, mimeType, size, data } })` (Task 1); URL-формат `/api/media/<name>` (Task 2).
- Produces: ответ `{ path: '/api/media/<name>', originalName, size, mimeType }` — потребители (админ-страницы) используют `path` как есть.

- [ ] **Step 1: Написать падающие тесты**

Create `app/api/admin/content/upload/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    mediaAsset: { create: vi.fn() },
  },
}))
vi.mock('@/lib/server-auth', () => ({
  requireAdmin: vi.fn(),
}))

import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/server-auth'
import { POST } from './route'

const ADMIN_USER = { id: 'admin-1', email: 'admin@test.com', platformRole: 'admin' }

function makeRequest(file: File | null): NextRequest {
  const fd = new FormData()
  if (file) fd.set('file', file)
  return new NextRequest('http://localhost/api/admin/content/upload', {
    method: 'POST',
    body: fd,
    // undici требует duplex при теле-стриме
    duplex: 'half',
  } as RequestInit)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(requireAdmin as any).mockResolvedValue(ADMIN_USER)
})

describe('POST /api/admin/content/upload', () => {
  it('rejects non-admins', async () => {
    vi.mocked(requireAdmin as any).mockResolvedValue(
      NextResponse.json({ error: 'forbidden' }, { status: 403 })
    )
    const res = await POST(makeRequest(new File([new Uint8Array(4)], 'a.png', { type: 'image/png' })))
    expect(res.status).toBe(403)
    expect(prisma.mediaAsset.create).not.toHaveBeenCalled()
  })

  it('requires a file', async () => {
    const res = await POST(makeRequest(null))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('file_is_required')
  })

  it('rejects SVG (stored XSS)', async () => {
    const svg = new File(['<svg/>'], 'evil.svg', { type: 'image/svg+xml' })
    const res = await POST(makeRequest(svg))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('unsupported_file_type')
  })

  it('rejects files over 10MB', async () => {
    const big = new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'big.png', { type: 'image/png' })
    const res = await POST(makeRequest(big))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('file_too_large')
  })

  it('stores the file in the DB and returns /api/media path', async () => {
    vi.mocked(prisma.mediaAsset.create as any).mockResolvedValue({})
    const file = new File([new Uint8Array([1, 2, 3, 4])], 'My Photo.PNG', { type: 'image/png' })

    const res = await POST(makeRequest(file))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.path).toMatch(/^\/api\/media\/\d+-my-photo\.png$/)
    expect(body.originalName).toBe('My Photo.PNG')
    expect(body.size).toBe(4)
    expect(body.mimeType).toBe('image/png')

    const createArg = vi.mocked(prisma.mediaAsset.create as any).mock.calls[0][0]
    expect(createArg.data.name).toMatch(/^\d+-my-photo\.png$/)
    expect(createArg.data.mimeType).toBe('image/png')
    expect(createArg.data.size).toBe(4)
    expect(Array.from(createArg.data.data)).toEqual([1, 2, 3, 4])
  })
})
```

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `npx vitest run app/api/admin/content/upload/route.test.ts`
Expected: FAIL — минимум тест `stores the file in the DB` (текущий код пишет в fs и возвращает `/uploads/...`).

- [ ] **Step 3: Переписать роут**

Заменить всё содержимое `app/api/admin/content/upload/route.ts` на:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/server-auth'
import { prisma } from '@/lib/prisma'
import path from 'path'

export const runtime = 'nodejs'

// SVG intentionally excluded: it can carry inline <script>, enabling stored XSS when served same-origin.
const ALLOWED_IMAGE_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif'
])

function normalizeFileBaseName(name: string): string {
  const ext = path.extname(name).toLowerCase()
  const base = path.basename(name, ext)
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

  const safeBase = base || 'image'
  const safeExt = ext && ext.length <= 10 ? ext : '.bin'
  return `${safeBase}${safeExt}`
}

export async function POST(request: NextRequest) {
  const __gate = await requireAdmin()
  if (__gate instanceof NextResponse) return __gate

  try {
    const formData = await request.formData()
    const file = formData.get('file')

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'file_is_required' }, { status: 400 })
    }

    if (!ALLOWED_IMAGE_MIME.has(file.type)) {
      return NextResponse.json({ error: 'unsupported_file_type' }, { status: 400 })
    }

    const maxBytes = 10 * 1024 * 1024
    if (file.size > maxBytes) {
      return NextResponse.json({ error: 'file_too_large' }, { status: 400 })
    }

    const fileName = normalizeFileBaseName(file.name)
    const finalName = `${Date.now()}-${fileName}`
    const bytes = new Uint8Array(await file.arrayBuffer())

    await prisma.mediaAsset.create({
      data: {
        name: finalName,
        mimeType: file.type,
        size: file.size,
        data: bytes
      }
    })

    return NextResponse.json({
      path: `/api/media/${finalName}`,
      originalName: file.name,
      size: file.size,
      mimeType: file.type
    })
  } catch {
    return NextResponse.json({ error: 'failed_to_upload_file' }, { status: 500 })
  }
}
```

- [ ] **Step 4: Убедиться, что тесты проходят**

Run: `npx vitest run app/api/admin/content/upload/route.test.ts`
Expected: 5 passed.

- [ ] **Step 5: Проверка типов**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: без ошибок.

- [ ] **Step 6: Commit**

```bash
git add app/api/admin/content/upload/route.ts app/api/admin/content/upload/route.test.ts
git commit -m "feat(media): store uploads in MediaAsset table instead of ephemeral fs"
```

---

### Task 4: Переписать медиатеку (GET-список и DELETE) на Prisma

**Files:**
- Modify: `app/api/admin/media/route.ts` (полная замена содержимого)
- Test: `app/api/admin/media/route.test.ts` (новый)

**Interfaces:**
- Consumes: `prisma.mediaAsset.findMany`, `prisma.mediaAsset.deleteMany` (Task 1); URL-формат `/api/media/<name>` (Task 2).
- Produces: GET → `{ files: [{ name, path, size, isImage, ext, createdAt, modifiedAt }] }` (прежняя форма, сортировка по modifiedAt desc); DELETE → `{ ok, deleted, errors }`.

- [ ] **Step 1: Написать падающие тесты**

Create `app/api/admin/media/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    mediaAsset: { findMany: vi.fn(), deleteMany: vi.fn() },
  },
}))
vi.mock('@/lib/server-auth', () => ({
  requireAdmin: vi.fn(),
}))

import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/server-auth'
import { GET, DELETE } from './route'

const ADMIN_USER = { id: 'admin-1', email: 'admin@test.com', platformRole: 'admin' }

function makeDeleteRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/admin/media', {
    method: 'DELETE',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(requireAdmin as any).mockResolvedValue(ADMIN_USER)
})

describe('GET /api/admin/media', () => {
  it('rejects non-admins', async () => {
    vi.mocked(requireAdmin as any).mockResolvedValue(
      NextResponse.json({ error: 'forbidden' }, { status: 403 })
    )
    const res = await GET()
    expect(res.status).toBe(403)
  })

  it('lists assets in the legacy shape without fetching bytes', async () => {
    const created = new Date('2026-07-01T10:00:00Z')
    const updated = new Date('2026-07-02T10:00:00Z')
    vi.mocked(prisma.mediaAsset.findMany as any).mockResolvedValue([
      { name: '111-pic.png', size: 4, createdAt: created, updatedAt: updated },
    ])

    const res = await GET()
    const body = await res.json()

    expect(body.files).toEqual([
      {
        name: '111-pic.png',
        path: '/api/media/111-pic.png',
        size: 4,
        isImage: true,
        ext: 'png',
        createdAt: created.toISOString(),
        modifiedAt: updated.toISOString(),
      },
    ])

    const arg = vi.mocked(prisma.mediaAsset.findMany as any).mock.calls[0][0]
    expect(arg.select).not.toHaveProperty('data')
    expect(arg.orderBy).toEqual({ updatedAt: 'desc' })
  })
})

describe('DELETE /api/admin/media', () => {
  it('requires at least one name', async () => {
    const res = await DELETE(makeDeleteRequest({}))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('name_required')
  })

  it('deletes existing names, reports invalid and missing ones as errors', async () => {
    vi.mocked(prisma.mediaAsset.findMany as any).mockResolvedValue([{ name: 'a.png' }])
    vi.mocked(prisma.mediaAsset.deleteMany as any).mockResolvedValue({ count: 1 })

    const res = await DELETE(
      makeDeleteRequest({ names: ['a.png', '../evil.png', 'missing.png'] })
    )
    const body = await res.json()

    expect(body.ok).toBe(true)
    expect(body.deleted).toBe(1)
    expect(body.errors).toEqual(expect.arrayContaining(['../evil.png', 'missing.png']))
    expect(prisma.mediaAsset.deleteMany).toHaveBeenCalledWith({
      where: { name: { in: ['a.png'] } },
    })
  })

  it('supports single-name form', async () => {
    vi.mocked(prisma.mediaAsset.findMany as any).mockResolvedValue([{ name: 'a.png' }])
    vi.mocked(prisma.mediaAsset.deleteMany as any).mockResolvedValue({ count: 1 })

    const res = await DELETE(makeDeleteRequest({ name: 'a.png' }))
    const body = await res.json()

    expect(body.deleted).toBe(1)
    expect(body.errors).toEqual([])
  })
})
```

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `npx vitest run app/api/admin/media/route.test.ts`
Expected: FAIL (текущий код читает fs, prisma-моки не вызываются).

- [ ] **Step 3: Переписать роут**

Заменить всё содержимое `app/api/admin/media/route.ts` на:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/server-auth'
import { prisma } from '@/lib/prisma'
import path from 'path'

export const runtime = 'nodejs'

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg', '.avif'])

export async function GET() {
  const __gate = await requireAdmin()
  if (__gate instanceof NextResponse) return __gate

  const rows = await prisma.mediaAsset.findMany({
    select: { name: true, size: true, createdAt: true, updatedAt: true },
    orderBy: { updatedAt: 'desc' }
  })

  const files = rows.map((row) => {
    const ext = path.extname(row.name).toLowerCase()
    return {
      name: row.name,
      path: `/api/media/${row.name}`,
      size: row.size,
      isImage: IMAGE_EXTS.has(ext),
      ext: ext.replace('.', ''),
      createdAt: row.createdAt.toISOString(),
      modifiedAt: row.updatedAt.toISOString()
    }
  })

  return NextResponse.json({ files })
}

function safeName(name: string): boolean {
  return Boolean(name) && !name.includes('/') && !name.includes('..') && !name.includes('\\')
}

export async function DELETE(request: NextRequest) {
  const __gate = await requireAdmin()
  if (__gate instanceof NextResponse) return __gate

  try {
    const body = (await request.json()) as { name?: string; names?: string[] }
    const targets = body.names?.length ? body.names : body.name ? [body.name] : []

    if (!targets.length) return NextResponse.json({ error: 'name_required' }, { status: 400 })

    const valid = targets.filter(safeName)
    const invalid = targets.filter((name) => !safeName(name))

    const existing = valid.length
      ? await prisma.mediaAsset.findMany({
          where: { name: { in: valid } },
          select: { name: true }
        })
      : []
    const existingNames = existing.map((row) => row.name)
    const missing = valid.filter((name) => !existingNames.includes(name))

    const result = existingNames.length
      ? await prisma.mediaAsset.deleteMany({ where: { name: { in: existingNames } } })
      : { count: 0 }

    return NextResponse.json({ ok: true, deleted: result.count, errors: [...invalid, ...missing] })
  } catch {
    return NextResponse.json({ error: 'failed_to_delete' }, { status: 500 })
  }
}
```

- [ ] **Step 4: Убедиться, что тесты проходят**

Run: `npx vitest run app/api/admin/media/route.test.ts`
Expected: 5 passed.

- [ ] **Step 5: Проверка типов**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: без ошибок.

- [ ] **Step 6: Commit**

```bash
git add app/api/admin/media/route.ts app/api/admin/media/route.test.ts
git commit -m "feat(media): media library lists and deletes DB-stored assets"
```

---

### Task 5: Переписать replace-роут на Prisma + финальная проверка

**Files:**
- Modify: `app/api/admin/media/replace/route.ts` (полная замена содержимого)
- Test: `app/api/admin/media/replace/route.test.ts` (новый)

**Interfaces:**
- Consumes: `prisma.mediaAsset.update({ where: { name }, data: { data, mimeType, size } })` (Task 1) — Prisma бросает ошибку с `code: 'P2025'`, если строки нет; URL-формат `/api/media/<name>` (Task 2).
- Produces: ответ `{ ok: true, path: '/api/media/<name>' }` — имя сохраняется, все ссылки на картинку остаются валидными.

- [ ] **Step 1: Написать падающие тесты**

Create `app/api/admin/media/replace/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    mediaAsset: { update: vi.fn() },
  },
}))
vi.mock('@/lib/server-auth', () => ({
  requireAdmin: vi.fn(),
}))

import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/server-auth'
import { POST } from './route'

const ADMIN_USER = { id: 'admin-1', email: 'admin@test.com', platformRole: 'admin' }

function makeRequest(name: string | null, file: File | null): NextRequest {
  const fd = new FormData()
  if (name !== null) fd.set('name', name)
  if (file) fd.set('file', file)
  return new NextRequest('http://localhost/api/admin/media/replace', {
    method: 'POST',
    body: fd,
    // undici требует duplex при теле-стриме
    duplex: 'half',
  } as RequestInit)
}

const PNG = () => new File([new Uint8Array([9, 8, 7])], 'new.png', { type: 'image/png' })

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(requireAdmin as any).mockResolvedValue(ADMIN_USER)
})

describe('POST /api/admin/media/replace', () => {
  it('rejects non-admins', async () => {
    vi.mocked(requireAdmin as any).mockResolvedValue(
      NextResponse.json({ error: 'forbidden' }, { status: 403 })
    )
    const res = await POST(makeRequest('a.png', PNG()))
    expect(res.status).toBe(403)
  })

  it('rejects invalid names', async () => {
    const res = await POST(makeRequest('../evil.png', PNG()))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('invalid_filename')
  })

  it('requires a file', async () => {
    const res = await POST(makeRequest('a.png', null))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('file_required')
  })

  it('rejects SVG', async () => {
    const svg = new File(['<svg/>'], 'evil.svg', { type: 'image/svg+xml' })
    const res = await POST(makeRequest('a.png', svg))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('unsupported_type')
  })

  it('returns 404 when the asset does not exist', async () => {
    vi.mocked(prisma.mediaAsset.update as any).mockRejectedValue(
      Object.assign(new Error('not found'), { code: 'P2025' })
    )
    const res = await POST(makeRequest('missing.png', PNG()))
    expect(res.status).toBe(404)
    expect((await res.json()).error).toBe('not_found')
  })

  it('updates bytes in place keeping the same name and path', async () => {
    vi.mocked(prisma.mediaAsset.update as any).mockResolvedValue({})

    const res = await POST(makeRequest('123-pic.png', PNG()))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ ok: true, path: '/api/media/123-pic.png' })

    const arg = vi.mocked(prisma.mediaAsset.update as any).mock.calls[0][0]
    expect(arg.where).toEqual({ name: '123-pic.png' })
    expect(arg.data.mimeType).toBe('image/png')
    expect(arg.data.size).toBe(3)
    expect(Array.from(arg.data.data)).toEqual([9, 8, 7])
  })
})
```

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `npx vitest run app/api/admin/media/replace/route.test.ts`
Expected: FAIL (текущий код пишет в fs, prisma-моки не вызываются).

- [ ] **Step 3: Переписать роут**

Заменить всё содержимое `app/api/admin/media/replace/route.ts` на:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/server-auth'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'

// SVG intentionally excluded: it can carry inline <script>, enabling stored XSS when served same-origin.
const ALLOWED_MIME = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif',
])

export async function POST(request: NextRequest) {
  const __gate = await requireAdmin()
  if (__gate instanceof NextResponse) return __gate

  try {
    const formData = await request.formData()
    const name = (formData.get('name') as string | null)?.trim()
    const file = formData.get('file')

    if (!name || name.includes('/') || name.includes('..') || name.includes('\\')) {
      return NextResponse.json({ error: 'invalid_filename' }, { status: 400 })
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'file_required' }, { status: 400 })
    }
    if (!ALLOWED_MIME.has(file.type)) {
      return NextResponse.json({ error: 'unsupported_type' }, { status: 400 })
    }
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'file_too_large' }, { status: 400 })
    }

    const bytes = new Uint8Array(await file.arrayBuffer())

    try {
      // Update in place — keeping the same name so all references stay valid
      await prisma.mediaAsset.update({
        where: { name },
        data: { data: bytes, mimeType: file.type, size: file.size }
      })
    } catch (e) {
      if ((e as { code?: string })?.code === 'P2025') {
        return NextResponse.json({ error: 'not_found' }, { status: 404 })
      }
      throw e
    }

    return NextResponse.json({ ok: true, path: `/api/media/${name}` })
  } catch {
    return NextResponse.json({ error: 'replace_failed' }, { status: 500 })
  }
}
```

- [ ] **Step 4: Убедиться, что тесты проходят**

Run: `npx vitest run app/api/admin/media/replace/route.test.ts`
Expected: 6 passed.

- [ ] **Step 5: Полная проверка**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: без ошибок.

Run: `npx vitest run`
Expected: все тесты проходят (e2e checkout-тесты с продуктом p1 падают и на чистом main — известный testdata-дрейф, не относится к этой ветке).

Убедиться, что в трёх переписанных роутах не осталось импортов `fs`:

Run: `grep -rn "from 'fs'" app/api/admin/content/upload app/api/admin/media`
Expected: пусто.

- [ ] **Step 6: Commit**

```bash
git add app/api/admin/media/replace/route.ts app/api/admin/media/replace/route.test.ts
git commit -m "feat(media): replace-in-place updates DB-stored asset bytes"
```
