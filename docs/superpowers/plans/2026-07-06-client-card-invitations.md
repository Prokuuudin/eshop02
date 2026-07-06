# Client-Card Invitations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Админ-инструмент: email-приглашения держателям карты клиента (активация спящего аккаунта по токену) + массовая рассылка «правила получения карты» остальным клиентам.

**Architecture:** Никаких изменений схемы Prisma. Статусы приглашений и прогресс кампании — JSON в `KeyValueSetting` (паттерн `pending-registrations`). Новые API-роуты под `requireAdmin`, публичный токен-роут `/api/auth/invite`, две новые страницы (`/admin/invitations`, `/auth/invite`). Письма через существующий `sendEmail` + DB-шаблоны с hardcode-фолбэками ru/en/lv.

**Tech Stack:** Next.js 16 App Router, Prisma 7 (adapter-neon), zustand-клиент, vitest, shadcn/ui.

**Spec:** `docs/superpowers/specs/2026-07-06-client-card-invitations-design.md`

## Global Constraints

- **Схему Neon НЕ менять** — ни одной строчки в `prisma/schema.prisma`.
- KV-ключи: `pro-invitations`, `card-rules-campaign` (точные имена).
- Все admin-endpoints начинаются с `requireAdmin()`-гейта (паттерн `app/api/admin/card-request/route.ts:75-76`).
- Батч кампании = **50** писем за запрос. Срок инвайта = **7 дней**.
- Сегмент B фильтр: `cardNumber == null`, `platformRole != 'admin'`, email содержит `@`, не заканчивается на `@client.local`.
- UI-тексты трилингвальные через локальный хелпер `l(ru, en, lv)` (паттерн `app/admin/client-barcodes/page.tsx:40-41`).
- После каждого коммита — `git push origin main` (предпочтение пользователя).
- Тесты: `npx vitest run <file>` (globals включены — `describe/it/expect/vi` без импортов).
- Коммиты заканчивать: `Co-Authored-By: Claude <noreply@anthropic.com>` (либо модель-исполнитель).

---

### Task 1: `lib/invitations.ts` — типы, KV-хелперы, чистые функции

**Files:**
- Create: `lib/invitations.ts`
- Test: `lib/invitations.test.ts`

**Interfaces:**
- Produces:
  - `type ProInvitation = { userId: string; email: string; cardNumber: string; token: string; sentAt: string; expiresAt: string; acceptedAt: string | null; status: 'sent' | 'accepted' | 'expired' | 'error'; language: 'ru' | 'en' | 'lv' }`
  - `type CampaignState = { sentCount: number; errorCount: number; cursor: string | null; lastRunAt: string | null; finished: boolean; runningSince: string | null }`
  - `INVITES_KV_KEY = 'pro-invitations'`, `CAMPAIGN_KV_KEY = 'card-rules-campaign'`, `INVITE_TTL_DAYS = 7`, `CAMPAIGN_BATCH_SIZE = 50`, `CAMPAIGN_LOCK_MS = 120_000`
  - `readInvitations(db): Promise<ProInvitation[]>`, `writeInvitations(db, list): Promise<void>`
  - `readCampaign(db): Promise<CampaignState>`, `writeCampaign(db, state): Promise<void>`
  - `deriveStatus(inv: ProInvitation, now?: Date): ProInvitation['status']`
  - `isEligibleRulesRecipient(u: { email: string; platformRole: string; cardNumber: string | null }): boolean`
  - `newInviteToken(): string` (hex 64 символа)

- [ ] **Step 1: Написать падающий тест**

`lib/invitations.test.ts`:

```typescript
import {
  deriveStatus,
  isEligibleRulesRecipient,
  newInviteToken,
  readCampaign,
  type ProInvitation,
} from './invitations'
import type { PrismaClient } from '@/generated/prisma/client'

const baseInv: ProInvitation = {
  userId: 'u1',
  email: 'a@b.lv',
  cardNumber: '1001',
  token: 'tok',
  sentAt: '2026-07-01T00:00:00.000Z',
  expiresAt: '2026-07-08T00:00:00.000Z',
  acceptedAt: null,
  status: 'sent',
  language: 'ru',
}

describe('deriveStatus', () => {
  it('accepted остаётся accepted даже после истечения срока', () => {
    const inv = { ...baseInv, acceptedAt: '2026-07-02T00:00:00.000Z', status: 'accepted' as const }
    expect(deriveStatus(inv, new Date('2026-08-01'))).toBe('accepted')
  })

  it('sent становится expired после expiresAt', () => {
    expect(deriveStatus(baseInv, new Date('2026-07-09'))).toBe('expired')
  })

  it('sent до истечения срока остаётся sent', () => {
    expect(deriveStatus(baseInv, new Date('2026-07-05'))).toBe('sent')
  })

  it('error не переписывается в expired', () => {
    const inv = { ...baseInv, status: 'error' as const }
    expect(deriveStatus(inv, new Date('2026-08-01'))).toBe('error')
  })
})

describe('isEligibleRulesRecipient', () => {
  const u = { email: 'x@inbox.lv', platformRole: 'customer', cardNumber: null }
  it('обычный клиент без карты — да', () => {
    expect(isEligibleRulesRecipient(u)).toBe(true)
  })
  it('с картой — нет', () => {
    expect(isEligibleRulesRecipient({ ...u, cardNumber: '1001' })).toBe(false)
  })
  it('админ — нет', () => {
    expect(isEligibleRulesRecipient({ ...u, platformRole: 'admin' })).toBe(false)
  })
  it('@client.local — нет', () => {
    expect(isEligibleRulesRecipient({ ...u, email: 'p16@client.local' })).toBe(false)
  })
  it('email без @ — нет', () => {
    expect(isEligibleRulesRecipient({ ...u, email: 'not-an-email' })).toBe(false)
  })
})

describe('newInviteToken', () => {
  it('64 hex-символа, уникальные', () => {
    const t1 = newInviteToken()
    expect(t1).toMatch(/^[0-9a-f]{64}$/)
    expect(newInviteToken()).not.toBe(t1)
  })
})

describe('readCampaign', () => {
  it('возвращает дефолтное состояние если KV пуст', async () => {
    const db = {
      keyValueSetting: { findUnique: vi.fn().mockResolvedValue(null) },
    } as unknown as PrismaClient
    const state = await readCampaign(db)
    expect(state).toEqual({
      sentCount: 0, errorCount: 0, cursor: null,
      lastRunAt: null, finished: false, runningSince: null,
    })
  })
})
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `npx vitest run lib/invitations.test.ts`
Expected: FAIL — `Cannot find module './invitations'`

- [ ] **Step 3: Реализация**

`lib/invitations.ts`:

```typescript
import crypto from 'crypto'
import type { PrismaClient } from '@/generated/prisma/client'
import { Prisma } from '@/generated/prisma/client'

export const INVITES_KV_KEY = 'pro-invitations'
export const CAMPAIGN_KV_KEY = 'card-rules-campaign'
export const INVITE_TTL_DAYS = 7
export const CAMPAIGN_BATCH_SIZE = 50
export const CAMPAIGN_LOCK_MS = 120_000

export type InviteLang = 'ru' | 'en' | 'lv'

export type ProInvitation = {
  userId: string
  email: string
  cardNumber: string
  token: string
  sentAt: string
  expiresAt: string
  acceptedAt: string | null
  status: 'sent' | 'accepted' | 'expired' | 'error'
  language: InviteLang
}

export type CampaignState = {
  sentCount: number
  errorCount: number
  cursor: string | null
  lastRunAt: string | null
  finished: boolean
  runningSince: string | null
}

const DEFAULT_CAMPAIGN: CampaignState = {
  sentCount: 0,
  errorCount: 0,
  cursor: null,
  lastRunAt: null,
  finished: false,
  runningSince: null,
}

export async function readInvitations(db: PrismaClient): Promise<ProInvitation[]> {
  const row = await db.keyValueSetting.findUnique({ where: { key: INVITES_KV_KEY } })
  if (!row) return []
  return ((row.value as { invitations?: ProInvitation[] })?.invitations) ?? []
}

export async function writeInvitations(db: PrismaClient, invitations: ProInvitation[]): Promise<void> {
  const value = { invitations } as unknown as Prisma.InputJsonValue
  await db.keyValueSetting.upsert({
    where: { key: INVITES_KV_KEY },
    create: { key: INVITES_KV_KEY, value },
    update: { value },
  })
}

export async function readCampaign(db: PrismaClient): Promise<CampaignState> {
  const row = await db.keyValueSetting.findUnique({ where: { key: CAMPAIGN_KV_KEY } })
  if (!row) return { ...DEFAULT_CAMPAIGN }
  return { ...DEFAULT_CAMPAIGN, ...(row.value as Partial<CampaignState>) }
}

export async function writeCampaign(db: PrismaClient, state: CampaignState): Promise<void> {
  const value = state as unknown as Prisma.InputJsonValue
  await db.keyValueSetting.upsert({
    where: { key: CAMPAIGN_KV_KEY },
    create: { key: CAMPAIGN_KV_KEY, value },
    update: { value },
  })
}

/** Статус с учётом протухания: accepted/error финальны, sent может стать expired. */
export function deriveStatus(inv: ProInvitation, now: Date = new Date()): ProInvitation['status'] {
  if (inv.status === 'accepted' || inv.status === 'error') return inv.status
  if (inv.acceptedAt) return 'accepted'
  if (new Date(inv.expiresAt) < now) return 'expired'
  return inv.status
}

/** Сегмент B: клиент без карты, не админ, с настоящим email. */
export function isEligibleRulesRecipient(u: {
  email: string
  platformRole: string
  cardNumber: string | null
}): boolean {
  if (u.cardNumber) return false
  if (u.platformRole === 'admin') return false
  if (!u.email || !u.email.includes('@')) return false
  if (u.email.toLowerCase().endsWith('@client.local')) return false
  return true
}

export function newInviteToken(): string {
  return crypto.randomBytes(32).toString('hex')
}
```

- [ ] **Step 4: Тесты зелёные**

Run: `npx vitest run lib/invitations.test.ts`
Expected: PASS (11 tests)

- [ ] **Step 5: Commit + push**

```bash
git add lib/invitations.ts lib/invitations.test.ts
git commit -m "feat(invitations): invitation/campaign KV helpers and pure functions"
git push origin main
```

---

### Task 2: `lib/invitation-emails.ts` — тексты писем ru/en/lv

**Files:**
- Create: `lib/invitation-emails.ts`
- Test: `lib/invitation-emails.test.ts`

**Interfaces:**
- Consumes: `InviteLang` из `lib/invitations.ts`.
- Produces:
  - `interpolate(template: string, vars: Record<string, string>): string`
  - `buildInviteEmail(lang, vars: { name: string; cardNumber: string; inviteUrl: string }, tpl?: { subject: string; body: string }): { subject: string; html: string }`
  - `buildRulesEmail(lang, vars: { name: string; siteUrl: string }, tpl?: { subject: string; body: string }): { subject: string; html: string }`
- DB-шаблоны (если созданы админом в email-templates): id `pro-invite-{lang}` и `card-rules-{lang}`; роуты ищут их через `getTemplates()` и передают сюда как `tpl`. Нет шаблона — используется фолбэк.

- [ ] **Step 1: Написать падающий тест**

`lib/invitation-emails.test.ts`:

```typescript
import { buildInviteEmail, buildRulesEmail, interpolate } from './invitation-emails'

describe('interpolate', () => {
  it('заменяет все вхождения переменной', () => {
    expect(interpolate('{{a}} и {{a}}', { a: 'x' })).toBe('x и x')
  })
})

describe('buildInviteEmail', () => {
  it('фолбэк ru содержит карту и ссылку', () => {
    const { subject, html } = buildInviteEmail('ru', {
      name: 'Anna', cardNumber: '1001', inviteUrl: 'https://x.lv/auth/invite?token=t',
    })
    expect(subject.length).toBeGreaterThan(0)
    expect(html).toContain('1001')
    expect(html).toContain('https://x.lv/auth/invite?token=t')
    expect(html).toContain('Anna')
  })

  it('DB-шаблон имеет приоритет', () => {
    const { subject, html } = buildInviteEmail(
      'ru',
      { name: 'Anna', cardNumber: '1001', inviteUrl: 'https://x' },
      { subject: 'S {{card_number}}', body: 'B {{invite_link}} {{name}}' }
    )
    expect(subject).toBe('S 1001')
    expect(html).toBe('B https://x Anna')
  })

  it('экранирует HTML в имени', () => {
    const { html } = buildInviteEmail('en', {
      name: '<img>', cardNumber: '1', inviteUrl: 'https://x',
    })
    expect(html).not.toContain('<img>')
    expect(html).toContain('&lt;img&gt;')
  })
})

describe('buildRulesEmail', () => {
  it('фолбэк lv содержит ссылку на сайт', () => {
    const { html } = buildRulesEmail('lv', { name: 'Ilze', siteUrl: 'https://site.lv' })
    expect(html).toContain('https://site.lv')
  })
})
```

- [ ] **Step 2: Запустить — падает**

Run: `npx vitest run lib/invitation-emails.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Реализация**

`lib/invitation-emails.ts`:

```typescript
import type { InviteLang } from './invitations'

export function interpolate(template: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce(
    (html, [key, value]) => html.replaceAll(`{{${key}}}`, value),
    template
  )
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

type Tpl = { subject: string; body: string }

const INVITE_CONTENT: Record<InviteLang, { subject: string; title: string; body1: string; body2: string; button: string; expiry: string }> = {
  ru: {
    subject: 'Приглашение на новый сайт для профессионалов',
    title: 'Добро пожаловать!',
    body1: 'Вы — держатель карты клиента №{{card_number}}. Мы открыли новый сайт для профессионалов и приглашаем вас.',
    body2: 'Ваш аккаунт уже создан. Нажмите кнопку, задайте пароль — и все возможности сайта будут доступны.',
    button: 'Активировать аккаунт',
    expiry: 'Ссылка действительна 7 дней.',
  },
  en: {
    subject: 'Invitation to our new professional store',
    title: 'Welcome!',
    body1: 'You hold client card No. {{card_number}}. We have launched a new site for professionals and invite you to join.',
    body2: 'Your account is already created. Click the button, set a password — and everything is ready.',
    button: 'Activate account',
    expiry: 'The link is valid for 7 days.',
  },
  lv: {
    subject: 'Ielūgums uz jauno profesionāļu veikalu',
    title: 'Laipni lūdzam!',
    body1: 'Jums ir klienta karte Nr. {{card_number}}. Esam atvēruši jaunu vietni profesionāļiem un aicinām jūs pievienoties.',
    body2: 'Jūsu konts jau ir izveidots. Nospiediet pogu, iestatiet paroli — un viss ir gatavs.',
    button: 'Aktivizēt kontu',
    expiry: 'Saite ir derīga 7 dienas.',
  },
}

const RULES_CONTENT: Record<InviteLang, { subject: string; title: string; body1: string; body2: string; button: string }> = {
  ru: {
    subject: 'Как получить карту клиента',
    title: 'Карта клиента — доступ к сайту для профессионалов',
    body1: 'Мы открыли новый сайт для профессионалов индустрии красоты. Полный доступ к ценам и заказам даёт карта клиента.',
    body2: 'Получить карту просто: подайте заявку на сайте, приложив сертификат специалиста или данные салона. Мы рассмотрим заявку и вышлем номер карты.',
    button: 'Подать заявку',
  },
  en: {
    subject: 'How to get a client card',
    title: 'Client card — access to the professional store',
    body1: 'We have launched a new site for beauty industry professionals. A client card gives full access to prices and ordering.',
    body2: 'Getting a card is simple: submit a request on the site with your professional certificate or salon details. We will review it and send you a card number.',
    button: 'Submit a request',
  },
  lv: {
    subject: 'Kā saņemt klienta karti',
    title: 'Klienta karte — pieeja profesionāļu veikalam',
    body1: 'Esam atvēruši jaunu vietni skaistumkopšanas profesionāļiem. Klienta karte dod pilnu pieeju cenām un pasūtījumiem.',
    body2: 'Saņemt karti ir vienkārši: iesniedziet pieteikumu vietnē, pievienojot speciālista sertifikātu vai salona datus. Mēs izskatīsim pieteikumu un nosūtīsim kartes numuru.',
    button: 'Iesniegt pieteikumu',
  },
}

function wrap(title: string, paragraphs: string[], buttonText: string, buttonUrl: string, footer: string): string {
  return `<div style="font-family:sans-serif;max-width:480px;margin:0 auto">
    <h2 style="color:#4f46e5">${title}</h2>
    ${paragraphs.map((p) => `<p>${p}</p>`).join('\n    ')}
    <p>
      <a href="${buttonUrl}" style="display:inline-block;padding:12px 24px;background:#4f46e5;color:#fff;border-radius:6px;text-decoration:none;font-weight:600">
        ${buttonText}
      </a>
    </p>
    ${footer ? `<p style="color:#6b7280;font-size:13px">${footer}</p>` : ''}
  </div>`
}

export function buildInviteEmail(
  lang: InviteLang,
  vars: { name: string; cardNumber: string; inviteUrl: string },
  tpl?: Tpl
): { subject: string; html: string } {
  const safe = {
    name: escapeHtml(vars.name),
    card_number: escapeHtml(vars.cardNumber),
    invite_link: vars.inviteUrl,
  }
  if (tpl) {
    return { subject: interpolate(tpl.subject, safe), html: interpolate(tpl.body, safe) }
  }
  const c = INVITE_CONTENT[lang]
  const greeting = safe.name ? `${safe.name}, ` : ''
  const html = wrap(
    c.title,
    [greeting + interpolate(c.body1, safe), c.body2],
    c.button,
    vars.inviteUrl,
    c.expiry
  )
  return { subject: c.subject, html }
}

export function buildRulesEmail(
  lang: InviteLang,
  vars: { name: string; siteUrl: string },
  tpl?: Tpl
): { subject: string; html: string } {
  const safe = { name: escapeHtml(vars.name), site_url: vars.siteUrl }
  if (tpl) {
    return { subject: interpolate(tpl.subject, safe), html: interpolate(tpl.body, safe) }
  }
  const c = RULES_CONTENT[lang]
  const greeting = safe.name ? `${safe.name}, ` : ''
  const html = wrap(
    c.title,
    [greeting + c.body1, c.body2],
    c.button,
    `${vars.siteUrl}/auth/register`,
    ''
  )
  return { subject: c.subject, html }
}
```

- [ ] **Step 4: Тесты зелёные**

Run: `npx vitest run lib/invitation-emails.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit + push**

```bash
git add lib/invitation-emails.ts lib/invitation-emails.test.ts
git commit -m "feat(invitations): trilingual invite and card-rules email builders"
git push origin main
```

---

### Task 3: API `/api/admin/invitations` — список + отправка

**Files:**
- Create: `app/api/admin/invitations/route.ts`

**Interfaces:**
- Consumes: Task 1 (`readInvitations`, `writeInvitations`, `deriveStatus`, `newInviteToken`, `INVITE_TTL_DAYS`, `ProInvitation`, `InviteLang`), Task 2 (`buildInviteEmail`), `requireAdmin` из `@/lib/server-auth`, `sendEmail` из `@/lib/mailer`, `getTemplates` из `@/lib/email-templates-server-store`.
- Produces:
  - `GET` → `{ holders: Array<{ userId, name, email, cardNumber, status: 'none'|'sent'|'accepted'|'expired'|'error', sentAt: string|null, inviteUrl: string|null }> }`
  - `POST { userIds: string[], language?: 'ru'|'en'|'lv' }` → `{ results: Array<{ userId, email, status: 'sent'|'error', inviteUrl: string }> }`

- [ ] **Step 1: Реализация**

`app/api/admin/invitations/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/server-auth'
import { sendEmail } from '@/lib/mailer'
import { getTemplates } from '@/lib/email-templates-server-store'
import {
  readInvitations,
  writeInvitations,
  deriveStatus,
  newInviteToken,
  INVITE_TTL_DAYS,
  type ProInvitation,
  type InviteLang,
} from '@/lib/invitations'
import { buildInviteEmail } from '@/lib/invitation-emails'

export const runtime = 'nodejs'

function baseUrl(req: NextRequest): string {
  const host = req.headers.get('host') ?? 'localhost:3000'
  const proto = host.startsWith('localhost') ? 'http' : 'https'
  return process.env.NEXT_PUBLIC_SITE_URL ?? `${proto}://${host}`
}

const inviteUrlFor = (base: string, token: string) => `${base}/auth/invite?token=${token}`

// GET: держатели карт + статусы приглашений
export async function GET(req: NextRequest) {
  const gate = await requireAdmin()
  if (gate instanceof NextResponse) return gate

  try {
    const [holders, invitations] = await Promise.all([
      prisma.user.findMany({
        where: { cardNumber: { not: null } },
        select: { id: true, name: true, email: true, cardNumber: true },
        orderBy: { email: 'asc' },
      }),
      readInvitations(prisma),
    ])
    const byEmail = new Map(invitations.map((i) => [i.email, i]))
    const base = baseUrl(req)

    return NextResponse.json({
      holders: holders.map((u) => {
        const inv = byEmail.get(u.email.toLowerCase())
        const status = inv ? deriveStatus(inv) : 'none'
        return {
          userId: u.id,
          name: u.name,
          email: u.email,
          cardNumber: u.cardNumber,
          status,
          sentAt: inv?.sentAt ?? null,
          // Ссылку показываем только пока инвайт живой — админ может скопировать вручную
          inviteUrl: inv && status === 'sent' ? inviteUrlFor(base, inv.token) : null,
        }
      }),
    })
  } catch (e) {
    console.error('[admin/invitations GET]', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}

// POST: отправить приглашения выбранным держателям карт
export async function POST(req: NextRequest) {
  const gate = await requireAdmin()
  if (gate instanceof NextResponse) return gate

  try {
    const body = (await req.json()) as { userIds?: string[]; language?: InviteLang }
    const userIds = body.userIds ?? []
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return NextResponse.json({ error: 'no_user_ids' }, { status: 400 })
    }
    const language: InviteLang = (['ru', 'en', 'lv'] as const).includes(body.language as InviteLang)
      ? (body.language as InviteLang)
      : 'ru'

    const users = await prisma.user.findMany({
      where: { id: { in: userIds }, cardNumber: { not: null } },
      select: { id: true, name: true, email: true, cardNumber: true },
    })

    const templates = await getTemplates()
    const tpl = templates.find((t) => t.id === `pro-invite-${language}`)
    const base = baseUrl(req)
    const invitations = await readInvitations(prisma)
    const results: Array<{ userId: string; email: string; status: 'sent' | 'error'; inviteUrl: string }> = []

    for (const u of users) {
      const token = newInviteToken()
      const now = new Date()
      const inviteUrl = inviteUrlFor(base, token)
      const { subject, html } = buildInviteEmail(
        language,
        { name: u.name ?? '', cardNumber: u.cardNumber!, inviteUrl },
        tpl ? { subject: tpl.subject, body: tpl.body } : undefined
      )

      let status: 'sent' | 'error' = 'sent'
      try {
        await sendEmail(u.email, subject, html)
      } catch (err) {
        console.error('[admin/invitations POST] sendEmail failed for', u.email, err)
        status = 'error'
      }

      const record: ProInvitation = {
        userId: u.id,
        email: u.email.toLowerCase(),
        cardNumber: u.cardNumber!,
        token,
        sentAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString(),
        acceptedAt: null,
        status,
        language,
      }
      // Повторная отправка заменяет старую запись по email
      const idx = invitations.findIndex((i) => i.email === record.email)
      if (idx >= 0) invitations[idx] = record
      else invitations.push(record)

      results.push({ userId: u.id, email: u.email, status, inviteUrl })
    }

    await writeInvitations(prisma, invitations)
    return NextResponse.json({ results })
  } catch (e) {
    console.error('[admin/invitations POST]', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Типы и линт**

Run: `npm run typecheck && npx eslint app/api/admin/invitations/route.ts`
Expected: без ошибок

- [ ] **Step 3: Ручная проверка (dev, SMTP не настроен — письмо в консоль)**

```bash
# dev-сервер уже должен бежать: npm run dev
# логин админом (admin@test.com), взять cookie eshop_session из браузера
curl -s http://localhost:3000/api/admin/invitations -H "Cookie: eshop_session=<TOKEN>"
```
Expected: `{"holders":[]}` (карт пока нет) — 200, не 401.

- [ ] **Step 4: Commit + push**

```bash
git add app/api/admin/invitations/route.ts
git commit -m "feat(invitations): admin API to list card holders and send invites"
git push origin main
```

---

### Task 4: API `/api/admin/invitations/card` — назначить карту клиенту

**Files:**
- Create: `app/api/admin/invitations/card/route.ts`

**Interfaces:**
- Consumes: `requireAdmin`, `prisma`.
- Produces: `POST { email: string, cardNumber: string }` → `200 { ok: true, userId }` | `404 user_not_found` | `409 card_taken` | `400 missing_fields/invalid_card`.

- [ ] **Step 1: Реализация**

`app/api/admin/invitations/card/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/server-auth'

export const runtime = 'nodejs'

// POST: вручную назначить номер карты существующему клиенту (замена ERP-импорта)
export async function POST(req: NextRequest) {
  const gate = await requireAdmin()
  if (gate instanceof NextResponse) return gate

  try {
    const body = (await req.json()) as { email?: string; cardNumber?: string }
    const email = body.email?.trim().toLowerCase()
    const cardNumber = body.cardNumber?.trim()
    if (!email || !cardNumber) {
      return NextResponse.json({ error: 'missing_fields' }, { status: 400 })
    }
    if (!/^\d{4,10}$/.test(cardNumber)) {
      return NextResponse.json({ error: 'invalid_card' }, { status: 400 })
    }

    const user = await prisma.user.findUnique({ where: { email }, select: { id: true } })
    if (!user) return NextResponse.json({ error: 'user_not_found' }, { status: 404 })

    try {
      await prisma.user.update({ where: { id: user.id }, data: { cardNumber } })
    } catch (e) {
      if ((e as { code?: string })?.code === 'P2002') {
        return NextResponse.json({ error: 'card_taken' }, { status: 409 })
      }
      throw e
    }

    return NextResponse.json({ ok: true, userId: user.id })
  } catch (e) {
    console.error('[admin/invitations/card POST]', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Типы и линт**

Run: `npm run typecheck && npx eslint app/api/admin/invitations/card/route.ts`
Expected: без ошибок

- [ ] **Step 3: Ручная проверка**

```bash
curl -s -X POST http://localhost:3000/api/admin/invitations/card \
  -H "Cookie: eshop_session=<TOKEN>" -H "Content-Type: application/json" \
  -d '{"email":"user@test.com","cardNumber":"1001"}'
```
Expected: `{"ok":true,"userId":"..."}`; повтор с тем же номером на другой email → `{"error":"card_taken"}` 409.
После проверки вернуть как было: `-d '{"email":"user@test.com","cardNumber":""}'` вернёт 400 — снятие карты не поддерживаем, вместо этого проверочную карту оставить (используется в Task 8 ручной проверке) или снять напрямую SQL-ом не нужно — тестовая БД.

- [ ] **Step 4: Commit + push**

```bash
git add app/api/admin/invitations/card/route.ts
git commit -m "feat(invitations): admin API to assign client card by email"
git push origin main
```

---

### Task 5: API `/api/auth/invite` — валидация токена + активация

**Files:**
- Create: `app/api/auth/invite/route.ts`

**Interfaces:**
- Consumes: Task 1 (`readInvitations`, `writeInvitations`, `deriveStatus`), `hashPassword`, `createSession`, `SESSION_COOKIE` из `@/lib/server-auth`, `prisma`.
- Produces:
  - `GET ?token=` → `200 { ok: true, email, name, cardNumber }` | `404 invalid_token` | `410 token_expired` | `409 already_used`
  - `POST { token, password }` → `200 { ok: true, email }` + cookie сессии | те же ошибки | `400 weak_password`
- Токен НЕ одноразовый на GET (форма сначала читает, потом отправляет) — потребляется на POST.

- [ ] **Step 1: Реализация**

`app/api/auth/invite/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { hashPassword, createSession, SESSION_COOKIE } from '@/lib/server-auth'
import { readInvitations, writeInvitations, deriveStatus } from '@/lib/invitations'

export const runtime = 'nodejs'

type Found =
  | { ok: true; index: number }
  | { ok: false; res: NextResponse }

async function findValid(token: string | null): Promise<Found & { invitations: Awaited<ReturnType<typeof readInvitations>> }> {
  const invitations = await readInvitations(prisma)
  if (!token) {
    return { ok: false, res: NextResponse.json({ ok: false, error: 'missing_token' }, { status: 400 }), invitations }
  }
  const index = invitations.findIndex((i) => i.token === token)
  if (index < 0) {
    return { ok: false, res: NextResponse.json({ ok: false, error: 'invalid_token' }, { status: 404 }), invitations }
  }
  const status = deriveStatus(invitations[index])
  if (status === 'accepted') {
    return { ok: false, res: NextResponse.json({ ok: false, error: 'already_used' }, { status: 409 }), invitations }
  }
  if (status === 'expired') {
    return { ok: false, res: NextResponse.json({ ok: false, error: 'token_expired' }, { status: 410 }), invitations }
  }
  return { ok: true, index, invitations }
}

// GET: данные для формы активации
export async function GET(req: NextRequest) {
  try {
    const found = await findValid(req.nextUrl.searchParams.get('token'))
    if (!found.ok) return found.res
    const inv = found.invitations[found.index]
    const user = await prisma.user.findUnique({
      where: { email: inv.email },
      select: { name: true },
    })
    return NextResponse.json({ ok: true, email: inv.email, name: user?.name ?? '', cardNumber: inv.cardNumber })
  } catch (e) {
    console.error('[auth/invite GET]', e)
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 })
  }
}

// POST: активация спящего аккаунта
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { token?: string; password?: string }
    if (!body.password || body.password.length < 8) {
      return NextResponse.json({ ok: false, error: 'weak_password' }, { status: 400 })
    }

    const found = await findValid(body.token ?? null)
    if (!found.ok) return found.res
    const inv = found.invitations[found.index]

    const user = await prisma.user.findUnique({ where: { email: inv.email } })
    if (!user) {
      return NextResponse.json({ ok: false, error: 'user_not_found' }, { status: 404 })
    }

    const passwordHash = await hashPassword(body.password)
    const companyId = `company_master_${randomUUID()}`
    const companyName = user.name || inv.email

    // Персональная компания мастера (паттерн approveNoCardRequest).
    // Карта компании может конфликтовать по @unique — тогда компания без карты.
    try {
      await prisma.company.create({
        data: { id: companyId, companyName, cardNumber: inv.cardNumber },
      })
    } catch (e) {
      if ((e as { code?: string })?.code !== 'P2002') throw e
      await prisma.company.create({
        data: { id: companyId, companyName, cardNumber: null },
      })
    }
    await prisma.companyMember.create({
      data: {
        id: randomUUID(),
        companyId,
        userId: user.id,
        email: inv.email,
        name: user.name ?? inv.email,
        role: 'admin',
        addedBy: 'invitation',
      },
    })
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        mustChangePassword: false,
        cardNumber: inv.cardNumber,
        companyId,
        companyName,
        teamRole: 'admin',
      },
    })

    found.invitations[found.index] = {
      ...inv,
      acceptedAt: new Date().toISOString(),
      status: 'accepted',
    }
    await writeInvitations(prisma, found.invitations)

    const token = await createSession(user.id)
    const res = NextResponse.json({ ok: true, email: inv.email })
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    })
    return res
  } catch (e) {
    console.error('[auth/invite POST]', e)
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Типы и линт**

Run: `npm run typecheck && npx eslint app/api/auth/invite/route.ts`
Expected: без ошибок

- [ ] **Step 3: Ручная проверка цикла**

```bash
# 1. назначить карту (Task 4) user@test.com → 1001
# 2. отправить инвайт (Task 3):
curl -s -X POST http://localhost:3000/api/admin/invitations \
  -H "Cookie: eshop_session=<TOKEN>" -H "Content-Type: application/json" \
  -d '{"userIds":["<userId из шага 1>"],"language":"ru"}'
# → скопировать inviteUrl из ответа, взять token
curl -s "http://localhost:3000/api/auth/invite?token=<t>"
# → {"ok":true,"email":"user@test.com","cardNumber":"1001",...}
curl -s -X POST http://localhost:3000/api/auth/invite \
  -H "Content-Type: application/json" -d '{"token":"<t>","password":"NewPass123"}'
# → {"ok":true,...} + Set-Cookie: eshop_session
# повторно тот же POST → {"ok":false,"error":"already_used"} 409
```

- [ ] **Step 4: Commit + push**

```bash
git add app/api/auth/invite/route.ts
git commit -m "feat(invitations): public invite token validation and account activation"
git push origin main
```

---

### Task 6: API `/api/admin/card-rules-campaign` — кампания сегмента B

**Files:**
- Create: `app/api/admin/card-rules-campaign/route.ts`

**Interfaces:**
- Consumes: Task 1 (`readCampaign`, `writeCampaign`, `isEligibleRulesRecipient`, `CAMPAIGN_BATCH_SIZE`, `CAMPAIGN_LOCK_MS`), Task 2 (`buildRulesEmail`), `requireAdmin`, `sendEmail`, `getTemplates`.
- Produces:
  - `GET` → `{ state: CampaignState, totalEligible: number }`
  - `POST {}` → `{ state: CampaignState, processed: number }` | `409 busy` | `409 finished`
  - `POST { reset: true }` → сброс состояния (новая кампания) → `{ state }`

- [ ] **Step 1: Реализация**

`app/api/admin/card-rules-campaign/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/server-auth'
import { sendEmail } from '@/lib/mailer'
import { getTemplates } from '@/lib/email-templates-server-store'
import {
  readCampaign,
  writeCampaign,
  isEligibleRulesRecipient,
  CAMPAIGN_BATCH_SIZE,
  CAMPAIGN_LOCK_MS,
} from '@/lib/invitations'
import { buildRulesEmail } from '@/lib/invitation-emails'

export const runtime = 'nodejs'
export const maxDuration = 60

// Фильтр сегмента B на уровне SQL; isEligibleRulesRecipient дублирует его в памяти
// как страховка + для юнит-тестов.
const ELIGIBLE_WHERE = {
  cardNumber: null,
  platformRole: { not: 'admin' },
  email: { contains: '@', not: { endsWith: '@client.local' } },
} as const

export async function GET() {
  const gate = await requireAdmin()
  if (gate instanceof NextResponse) return gate
  try {
    const [state, totalEligible] = await Promise.all([
      readCampaign(prisma),
      prisma.user.count({ where: ELIGIBLE_WHERE }),
    ])
    return NextResponse.json({ state, totalEligible })
  } catch (e) {
    console.error('[card-rules-campaign GET]', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireAdmin()
  if (gate instanceof NextResponse) return gate

  try {
    const body = (await req.json().catch(() => ({}))) as { reset?: boolean }
    let state = await readCampaign(prisma)

    if (body.reset) {
      state = { sentCount: 0, errorCount: 0, cursor: null, lastRunAt: null, finished: false, runningSince: null }
      await writeCampaign(prisma, state)
      return NextResponse.json({ state })
    }

    if (state.finished) {
      return NextResponse.json({ error: 'finished', state }, { status: 409 })
    }
    // Замок от параллельных батчей
    if (state.runningSince && Date.now() - new Date(state.runningSince).getTime() < CAMPAIGN_LOCK_MS) {
      return NextResponse.json({ error: 'busy', state }, { status: 409 })
    }
    state.runningSince = new Date().toISOString()
    await writeCampaign(prisma, state)

    const users = await prisma.user.findMany({
      where: {
        ...ELIGIBLE_WHERE,
        ...(state.cursor ? { id: { gt: state.cursor } } : {}),
      },
      select: { id: true, name: true, email: true, platformRole: true, cardNumber: true },
      orderBy: { id: 'asc' },
      take: CAMPAIGN_BATCH_SIZE,
    })

    const templates = await getTemplates()
    const tpl = templates.find((t) => t.id === 'card-rules-ru')
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://miksplus.eu'

    let processed = 0
    for (const u of users) {
      if (!isEligibleRulesRecipient(u)) continue
      const { subject, html } = buildRulesEmail(
        'ru',
        { name: u.name ?? '', siteUrl },
        tpl ? { subject: tpl.subject, body: tpl.body } : undefined
      )
      try {
        await sendEmail(u.email, subject, html)
        state.sentCount++
      } catch (err) {
        console.error('[card-rules-campaign] sendEmail failed for', u.email, err)
        state.errorCount++
      }
      processed++
    }

    state.cursor = users.length > 0 ? users[users.length - 1].id : state.cursor
    state.finished = users.length < CAMPAIGN_BATCH_SIZE
    state.lastRunAt = new Date().toISOString()
    state.runningSince = null
    await writeCampaign(prisma, state)

    return NextResponse.json({ state, processed })
  } catch (e) {
    console.error('[card-rules-campaign POST]', e)
    // снять замок, чтобы не заблокировать кампанию навсегда
    try {
      const state = await readCampaign(prisma)
      state.runningSince = null
      await writeCampaign(prisma, state)
    } catch { /* уже залогировано выше */ }
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Типы и линт**

Run: `npm run typecheck && npx eslint app/api/admin/card-rules-campaign/route.ts`
Expected: без ошибок. ВНИМАНИЕ: если typecheck ругнётся на `email: { contains: '@', not: { endsWith: '@client.local' } }` (вложенный `not` с `endsWith` появился в Prisma 5+; в Prisma 7 валиден) — заменить на `AND: [{ email: { contains: '@' } }, { NOT: { email: { endsWith: '@client.local' } } }]`.

- [ ] **Step 3: Ручная проверка**

```bash
curl -s http://localhost:3000/api/admin/card-rules-campaign -H "Cookie: eshop_session=<TOKEN>"
# → {"state":{...,"finished":false},"totalEligible":<~38000>}
curl -s -X POST http://localhost:3000/api/admin/card-rules-campaign -H "Cookie: eshop_session=<TOKEN>" -H "Content-Type: application/json" -d '{}'
# → {"state":{"sentCount":50,...},"processed":50} (письма в консоль dev-сервера)
# сразу второй POST во время первого → 409 busy
curl -s -X POST ... -d '{"reset":true}'  # вернуть в 0 после проверки
```

- [ ] **Step 4: Commit + push**

```bash
git add app/api/admin/card-rules-campaign/route.ts
git commit -m "feat(invitations): batched card-rules campaign API for segment B"
git push origin main
```

---

### Task 7: Страница `/auth/invite` — активация по токену

**Files:**
- Create: `app/auth/invite/page.tsx`

**Interfaces:**
- Consumes: `GET/POST /api/auth/invite` (Task 5), `loginUserAuto` из `@/lib/auth` (клиентский логин: синхронизирует zustand-сторы и серверную сессию).

- [ ] **Step 1: Реализация**

`app/auth/invite/page.tsx`:

```tsx
'use client';

import React, { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { loginUserAuto } from '@/lib/auth';
import { useTranslation } from '@/lib/use-translation';

type Stage = 'loading' | 'form' | 'submitting' | 'done' | 'error';

const ERROR_TEXT: Record<string, [string, string, string]> = {
    invalid_token: ['Ссылка недействительна.', 'The link is invalid.', 'Saite nav derīga.'],
    token_expired: ['Ссылка устарела. Запросите новое приглашение.', 'The link has expired. Request a new invitation.', 'Saites derīgums ir beidzies. Pieprasiet jaunu ielūgumu.'],
    already_used: ['Приглашение уже использовано. Войдите со своим паролем.', 'This invitation was already used. Log in with your password.', 'Ielūgums jau ir izmantots. Piesakieties ar savu paroli.'],
    weak_password: ['Пароль должен быть не короче 8 символов.', 'Password must be at least 8 characters.', 'Parolei jābūt vismaz 8 rakstzīmēm.'],
    server_error: ['Ошибка сервера. Попробуйте ещё раз.', 'Server error. Please try again.', 'Servera kļūda. Mēģiniet vēlreiz.'],
};

export default function InvitePage() {
    const { language } = useTranslation();
    const l = (ru: string, en: string, lv: string) =>
        language === 'ru' ? ru : language === 'lv' ? lv : en;
    const errText = (code: string) => {
        const t = ERROR_TEXT[code] ?? ERROR_TEXT.server_error;
        return l(t[0], t[1], t[2]);
    };

    const searchParams = useSearchParams();
    const router = useRouter();
    const token = searchParams.get('token');

    const [stage, setStage] = useState<Stage>('loading');
    const [error, setError] = useState('');
    const [email, setEmail] = useState('');
    const [cardNumber, setCardNumber] = useState('');
    const [name, setName] = useState('');
    const [password, setPassword] = useState('');
    const [password2, setPassword2] = useState('');

    useEffect(() => {
        if (!token) {
            setError(errText('invalid_token'));
            setStage('error');
            return;
        }
        fetch(`/api/auth/invite?token=${encodeURIComponent(token)}`)
            .then(async (res) => {
                const json = await res.json() as { ok: boolean; error?: string; email?: string; name?: string; cardNumber?: string };
                if (!json.ok) {
                    setError(errText(json.error ?? 'server_error'));
                    setStage('error');
                    return;
                }
                setEmail(json.email ?? '');
                setName(json.name ?? '');
                setCardNumber(json.cardNumber ?? '');
                setStage('form');
            })
            .catch(() => {
                setError(errText('server_error'));
                setStage('error');
            });
        // errText стабилен в рамках языка; language в deps не нужен
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (password !== password2) {
            setError(l('Пароли не совпадают.', 'Passwords do not match.', 'Paroles nesakrīt.'));
            return;
        }
        setError('');
        setStage('submitting');
        try {
            const res = await fetch('/api/auth/invite', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, password }),
            });
            const json = await res.json() as { ok: boolean; error?: string; email?: string };
            if (!json.ok) {
                setError(errText(json.error ?? 'server_error'));
                setStage('form');
                return;
            }
            // Полный клиентский логин (zustand-сторы + серверная сессия)
            await loginUserAuto(json.email ?? email, password);
            setStage('done');
            setTimeout(() => router.push('/account'), 1500);
        } catch {
            setError(errText('server_error'));
            setStage('form');
        }
    };

    if (stage === 'loading') {
        return (
            <main className="flex min-h-[60vh] items-center justify-center px-4">
                <p className="text-muted-foreground text-sm animate-pulse">
                    {l('Проверяем приглашение…', 'Checking the invitation…', 'Pārbaudām ielūgumu…')}
                </p>
            </main>
        );
    }

    if (stage === 'error') {
        return (
            <main className="flex min-h-[60vh] items-center justify-center px-4">
                <div className="max-w-md w-full text-center space-y-4">
                    <p className="text-red-600 dark:text-red-400">{error}</p>
                    <Link href="/auth/login" className="inline-block text-primary hover:underline text-sm">
                        {l('Перейти ко входу', 'Go to login', 'Doties uz pieteikšanos')}
                    </Link>
                </div>
            </main>
        );
    }

    if (stage === 'done') {
        return (
            <main className="flex min-h-[60vh] items-center justify-center px-4">
                <div className="max-w-md w-full text-center space-y-4">
                    <div className="text-4xl">✓</div>
                    <h1 className="text-xl font-semibold text-foreground">
                        {l('Аккаунт активирован!', 'Account activated!', 'Konts aktivizēts!')}
                    </h1>
                    <p className="text-muted-foreground text-sm">
                        {l('Перенаправляем в личный кабинет…', 'Redirecting to your account…', 'Novirzām uz jūsu kontu…')}
                    </p>
                </div>
            </main>
        );
    }

    return (
        <main className="flex min-h-[60vh] items-center justify-center px-4 py-8">
            <div className="max-w-md w-full space-y-6">
                <div className="text-center space-y-2">
                    <h1 className="text-2xl font-bold text-foreground">
                        {l('Добро пожаловать!', 'Welcome!', 'Laipni lūdzam!')}
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        {l(
                            'Ваш аккаунт готов. Задайте пароль, чтобы начать пользоваться сайтом.',
                            'Your account is ready. Set a password to start using the site.',
                            'Jūsu konts ir gatavs. Iestatiet paroli, lai sāktu lietot vietni.'
                        )}
                    </p>
                </div>

                <div className="rounded-lg border border-border bg-card p-6 space-y-4">
                    <div className="space-y-3 text-sm">
                        {name && (
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">{l('Имя', 'Name', 'Vārds')}</span>
                                <span className="font-medium text-foreground">{name}</span>
                            </div>
                        )}
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Email</span>
                            <span className="font-medium text-foreground">{email}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">{l('Карта клиента', 'Client card', 'Klienta karte')}</span>
                            <span className="font-mono font-medium text-foreground">{cardNumber}</span>
                        </div>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-3">
                        <label className="block text-sm">
                            <span className="block mb-1 text-muted-foreground">
                                {l('Новый пароль', 'New password', 'Jaunā parole')}
                            </span>
                            <Input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                minLength={8}
                                required
                                autoComplete="new-password"
                            />
                        </label>
                        <label className="block text-sm">
                            <span className="block mb-1 text-muted-foreground">
                                {l('Повторите пароль', 'Repeat password', 'Atkārtojiet paroli')}
                            </span>
                            <Input
                                type="password"
                                value={password2}
                                onChange={(e) => setPassword2(e.target.value)}
                                minLength={8}
                                required
                                autoComplete="new-password"
                            />
                        </label>

                        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

                        <Button type="submit" className="w-full" disabled={stage === 'submitting'}>
                            {stage === 'submitting'
                                ? l('Активируем…', 'Activating…', 'Aktivizējam…')
                                : l('Активировать аккаунт', 'Activate account', 'Aktivizēt kontu')}
                        </Button>
                    </form>
                </div>
            </div>
        </main>
    );
}
```

- [ ] **Step 2: Типы и линт**

Run: `npm run typecheck && npx eslint app/auth/invite/page.tsx`
Expected: без ошибок

- [ ] **Step 3: Ручная проверка**

Повторить цикл из Task 5 Step 3, но открыть `inviteUrl` в браузере: форма показывает email+карту read-only, пароль дважды → «Аккаунт активирован» → редирект в `/account`, юзер залогинен. Повторное открытие той же ссылки → «Приглашение уже использовано».

- [ ] **Step 4: Commit + push**

```bash
git add app/auth/invite/page.tsx
git commit -m "feat(invitations): public invite activation page"
git push origin main
```

---

### Task 8: Админ-страница `/admin/invitations` + карточка в дашборде

**Files:**
- Create: `app/admin/invitations/page.tsx`
- Modify: `app/admin/page.tsx:140` — добавить карточку после `barcodes`

**Interfaces:**
- Consumes: все API из Tasks 3, 4, 6.

- [ ] **Step 1: Страница**

`app/admin/invitations/page.tsx`:

```tsx
'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import AdminGate from '@/components/admin/AdminGate';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTranslation } from '@/lib/use-translation';

type Holder = {
    userId: string;
    name: string | null;
    email: string;
    cardNumber: string;
    status: 'none' | 'sent' | 'accepted' | 'expired' | 'error';
    sentAt: string | null;
    inviteUrl: string | null;
};

type CampaignState = {
    sentCount: number;
    errorCount: number;
    cursor: string | null;
    lastRunAt: string | null;
    finished: boolean;
    runningSince: string | null;
};

type InviteLang = 'ru' | 'en' | 'lv';

export default function AdminInvitationsPage() {
    const { language } = useTranslation();
    const l = (ru: string, en: string, lv: string) =>
        language === 'ru' ? ru : language === 'lv' ? lv : en;

    const [holders, setHolders] = useState<Holder[]>([]);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState('');
    const [formError, setFormError] = useState('');
    const [inviteLang, setInviteLang] = useState<InviteLang>('ru');
    const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
    const [bulkBusy, setBulkBusy] = useState(false);

    // Форма назначения карты
    const [cardEmail, setCardEmail] = useState('');
    const [cardNumber, setCardNumber] = useState('');
    const [cardBusy, setCardBusy] = useState(false);

    // Кампания сегмента B
    const [campaign, setCampaign] = useState<CampaignState | null>(null);
    const [totalEligible, setTotalEligible] = useState(0);
    const [campaignRunning, setCampaignRunning] = useState(false);
    const stopRequested = useRef(false);

    const loadHolders = useCallback(async () => {
        try {
            const res = await fetch('/api/admin/invitations');
            const json = await res.json();
            if (res.ok) setHolders(json.holders ?? []);
        } finally {
            setLoading(false);
        }
    }, []);

    const loadCampaign = useCallback(async () => {
        const res = await fetch('/api/admin/card-rules-campaign');
        if (res.ok) {
            const json = await res.json();
            setCampaign(json.state);
            setTotalEligible(json.totalEligible ?? 0);
        }
    }, []);

    useEffect(() => {
        void loadHolders();
        void loadCampaign();
    }, [loadHolders, loadCampaign]);

    const sendInvites = async (userIds: string[]) => {
        setFormError('');
        setMessage('');
        const res = await fetch('/api/admin/invitations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userIds, language: inviteLang }),
        });
        const json = await res.json();
        if (!res.ok) {
            setFormError(l('Не удалось отправить приглашения', 'Failed to send invitations', 'Neizdevās nosūtīt ielūgumus'));
            return;
        }
        const sent = (json.results ?? []).filter((r: { status: string }) => r.status === 'sent').length;
        const failed = (json.results ?? []).length - sent;
        setMessage(
            l(`Отправлено: ${sent}${failed ? `, ошибок: ${failed}` : ''}`,
              `Sent: ${sent}${failed ? `, errors: ${failed}` : ''}`,
              `Nosūtīts: ${sent}${failed ? `, kļūdas: ${failed}` : ''}`)
        );
        await loadHolders();
    };

    const handleInviteOne = async (userId: string) => {
        setBusyIds((prev) => new Set(prev).add(userId));
        try {
            await sendInvites([userId]);
        } finally {
            setBusyIds((prev) => { const next = new Set(prev); next.delete(userId); return next; });
        }
    };

    const handleInviteAll = async () => {
        const ids = holders.filter((h) => h.status === 'none' || h.status === 'expired' || h.status === 'error').map((h) => h.userId);
        if (ids.length === 0) return;
        setBulkBusy(true);
        try {
            await sendInvites(ids);
        } finally {
            setBulkBusy(false);
        }
    };

    const handleAssignCard = async (e: React.FormEvent) => {
        e.preventDefault();
        setFormError('');
        setMessage('');
        setCardBusy(true);
        try {
            const res = await fetch('/api/admin/invitations/card', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: cardEmail, cardNumber }),
            });
            const json = await res.json();
            if (!res.ok) {
                const msg =
                    json.error === 'user_not_found'
                        ? l('Клиент с таким email не найден', 'No client with this email', 'Klients ar šādu e-pastu nav atrasts')
                        : json.error === 'card_taken'
                        ? l('Этот номер карты уже занят', 'This card number is already taken', 'Šis kartes numurs jau ir aizņemts')
                        : json.error === 'invalid_card'
                        ? l('Номер карты: 4–10 цифр', 'Card number: 4–10 digits', 'Kartes numurs: 4–10 cipari')
                        : l('Ошибка', 'Error', 'Kļūda');
                setFormError(msg);
                return;
            }
            setMessage(l(`Карта ${cardNumber} назначена ${cardEmail}`, `Card ${cardNumber} assigned to ${cardEmail}`, `Karte ${cardNumber} piešķirta ${cardEmail}`));
            setCardEmail('');
            setCardNumber('');
            await loadHolders();
        } finally {
            setCardBusy(false);
        }
    };

    const runCampaign = async () => {
        setCampaignRunning(true);
        stopRequested.current = false;
        try {
            // Цикл батчей до finished или остановки админом
            for (;;) {
                if (stopRequested.current) break;
                const res = await fetch('/api/admin/card-rules-campaign', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({}),
                });
                const json = await res.json();
                if (json.state) setCampaign(json.state);
                if (!res.ok || json.state?.finished) break;
            }
        } finally {
            setCampaignRunning(false);
        }
    };

    const resetCampaign = async () => {
        const res = await fetch('/api/admin/card-rules-campaign', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reset: true }),
        });
        const json = await res.json();
        if (json.state) setCampaign(json.state);
    };

    const STATUS_LABEL: Record<Holder['status'], string> = {
        none: l('не приглашён', 'not invited', 'nav ielūgts'),
        sent: l('отправлено', 'sent', 'nosūtīts'),
        accepted: l('зарегистрировался', 'registered', 'reģistrējies'),
        expired: l('просрочено', 'expired', 'beidzies termiņš'),
        error: l('ошибка отправки', 'send error', 'sūtīšanas kļūda'),
    };
    const STATUS_CLASS: Record<Holder['status'], string> = {
        none: 'bg-muted text-muted-foreground',
        sent: 'bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300',
        accepted: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300',
        expired: 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300',
        error: 'bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300',
    };

    const uninvitedCount = holders.filter((h) => h.status === 'none' || h.status === 'expired' || h.status === 'error').length;

    return (
        <AdminGate>
            <main className="w-full py-4 space-y-6">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-bold text-foreground">
                            {l('Приглашения клиентов', 'Client invitations', 'Klientu ielūgumi')}
                        </h1>
                        <p className="text-sm text-muted-foreground mt-1">
                            {l(
                                'Приглашения держателям карты клиента и рассылка правил получения карты остальным.',
                                'Invitations for card holders and card-rules mailing for everyone else.',
                                'Ielūgumi kartes īpašniekiem un kartes noteikumu izsūtīšana pārējiem.'
                            )}
                        </p>
                    </div>
                    <Link href="/admin">
                        <Button variant="outline">{l('Назад в админку', 'Back to admin', 'Atpakaļ uz admin')}</Button>
                    </Link>
                </div>

                {(formError || message) && (
                    <div className="rounded-lg border px-4 py-3 text-sm">
                        {formError && <p className="text-red-600 dark:text-red-400">{formError}</p>}
                        {message && <p className="text-emerald-600 dark:text-emerald-400">{message}</p>}
                    </div>
                )}

                {/* ── Сегмент A: держатели карт ── */}
                <section className="rounded-lg border border-border bg-card p-6 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <h2 className="text-xl font-semibold text-foreground">
                            {l('Клиенты с картой', 'Clients with a card', 'Klienti ar karti')}{' '}
                            <span className="text-gray-400 dark:text-gray-500 font-normal text-base">{holders.length}</span>
                        </h2>
                        <div className="flex items-center gap-2">
                            <Select value={inviteLang} onValueChange={(v) => setInviteLang(v as InviteLang)}>
                                <SelectTrigger className="w-32 rounded-md border border-border bg-card px-3 py-2 text-sm">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="ru">Русский</SelectItem>
                                    <SelectItem value="en">English</SelectItem>
                                    <SelectItem value="lv">Latviešu</SelectItem>
                                </SelectContent>
                            </Select>
                            <Button onClick={handleInviteAll} disabled={bulkBusy || uninvitedCount === 0}>
                                {bulkBusy
                                    ? l('Отправка…', 'Sending…', 'Sūta…')
                                    : l(`Пригласить всех (${uninvitedCount})`, `Invite all (${uninvitedCount})`, `Ielūgt visus (${uninvitedCount})`)}
                            </Button>
                        </div>
                    </div>

                    {loading ? (
                        <p className="text-sm text-muted-foreground animate-pulse py-4">{l('Загрузка…', 'Loading…', 'Ielādē…')}</p>
                    ) : holders.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                            {l(
                                'Пока нет клиентов с картой. Назначьте карту через форму ниже или дождитесь импорта из ERP.',
                                'No clients with a card yet. Assign a card below or wait for the ERP import.',
                                'Pagaidām nav klientu ar karti. Piešķiriet karti zemāk vai gaidiet ERP importu.'
                            )}
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-border text-left text-muted-foreground">
                                        <th className="py-2 pr-4 font-medium">{l('Имя', 'Name', 'Vārds')}</th>
                                        <th className="py-2 pr-4 font-medium">Email</th>
                                        <th className="py-2 pr-4 font-medium">{l('Карта', 'Card', 'Karte')}</th>
                                        <th className="py-2 pr-4 font-medium">{l('Статус', 'Status', 'Statuss')}</th>
                                        <th className="py-2 pr-4 font-medium">{l('Отправлено', 'Sent', 'Nosūtīts')}</th>
                                        <th className="py-2 font-medium"></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {holders.map((h) => (
                                        <tr key={h.userId} className="border-b border-border/50">
                                            <td className="py-2 pr-4 text-foreground">{h.name || '—'}</td>
                                            <td className="py-2 pr-4 text-foreground">{h.email}</td>
                                            <td className="py-2 pr-4 font-mono text-foreground">{h.cardNumber}</td>
                                            <td className="py-2 pr-4">
                                                <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[h.status]}`}>
                                                    {STATUS_LABEL[h.status]}
                                                </span>
                                            </td>
                                            <td className="py-2 pr-4 text-muted-foreground">
                                                {h.sentAt ? new Date(h.sentAt).toLocaleDateString('ru-RU') : '—'}
                                            </td>
                                            <td className="py-2 text-right whitespace-nowrap">
                                                {h.status !== 'accepted' && (
                                                    <Button
                                                        size="sm"
                                                        variant={h.status === 'none' ? 'default' : 'outline'}
                                                        disabled={busyIds.has(h.userId)}
                                                        onClick={() => handleInviteOne(h.userId)}
                                                    >
                                                        {busyIds.has(h.userId)
                                                            ? l('Отправка…', 'Sending…', 'Sūta…')
                                                            : h.status === 'none'
                                                            ? l('Пригласить', 'Invite', 'Ielūgt')
                                                            : l('Повторно', 'Resend', 'Atkārtoti')}
                                                    </Button>
                                                )}
                                                {h.inviteUrl && (
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        className="ml-1"
                                                        onClick={() => { void navigator.clipboard.writeText(h.inviteUrl!); }}
                                                        title={l('Скопировать ссылку', 'Copy link', 'Kopēt saiti')}
                                                    >
                                                        ⧉
                                                    </Button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* Ручное назначение карты (до ERP-импорта) */}
                    <form onSubmit={handleAssignCard} className="rounded-md border border-border p-4 grid grid-cols-1 sm:grid-cols-[1.5fr_1fr_auto] gap-3 items-end">
                        <label className="text-sm">
                            <span className="block mb-1 text-muted-foreground">{l('Email клиента', 'Client email', 'Klienta e-pasts')}</span>
                            <Input type="email" required value={cardEmail} onChange={(e) => setCardEmail(e.target.value)} placeholder="client@inbox.lv" />
                        </label>
                        <label className="text-sm">
                            <span className="block mb-1 text-muted-foreground">{l('Номер карты', 'Card number', 'Kartes numurs')}</span>
                            <Input required value={cardNumber} onChange={(e) => setCardNumber(e.target.value)} placeholder="1001" className="font-mono" />
                        </label>
                        <Button type="submit" disabled={cardBusy}>
                            {cardBusy ? l('Сохраняем…', 'Saving…', 'Saglabā…') : l('Назначить карту', 'Assign card', 'Piešķirt karti')}
                        </Button>
                    </form>
                </section>

                {/* ── Сегмент B: остальные клиенты ── */}
                <section className="rounded-lg border border-border bg-card p-6 space-y-4">
                    <h2 className="text-xl font-semibold text-foreground">
                        {l('Остальные клиенты — правила получения карты', 'Other clients — how to get a card', 'Pārējie klienti — kā saņemt karti')}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                        {l(
                            'Письмо с правилами получения карты клиента всем, у кого карты нет. Отправка порциями по 50.',
                            'An email with card rules to everyone without a card. Sent in batches of 50.',
                            'E-pasts ar kartes noteikumiem visiem bez kartes. Sūta pa 50.'
                        )}
                    </p>

                    {campaign && (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                            <div className="rounded-md border border-border p-3">
                                <p className="text-muted-foreground">{l('Получателей', 'Recipients', 'Saņēmēji')}</p>
                                <p className="text-lg font-semibold text-foreground">{totalEligible.toLocaleString('ru-RU')}</p>
                            </div>
                            <div className="rounded-md border border-border p-3">
                                <p className="text-muted-foreground">{l('Отправлено', 'Sent', 'Nosūtīts')}</p>
                                <p className="text-lg font-semibold text-foreground">{campaign.sentCount.toLocaleString('ru-RU')}</p>
                            </div>
                            <div className="rounded-md border border-border p-3">
                                <p className="text-muted-foreground">{l('Ошибок', 'Errors', 'Kļūdas')}</p>
                                <p className="text-lg font-semibold text-foreground">{campaign.errorCount}</p>
                            </div>
                            <div className="rounded-md border border-border p-3">
                                <p className="text-muted-foreground">{l('Статус', 'Status', 'Statuss')}</p>
                                <p className="text-lg font-semibold text-foreground">
                                    {campaign.finished
                                        ? l('Завершена', 'Finished', 'Pabeigta')
                                        : campaign.sentCount + campaign.errorCount > 0
                                        ? l('В процессе', 'In progress', 'Procesā')
                                        : l('Не начата', 'Not started', 'Nav sākta')}
                                </p>
                            </div>
                        </div>
                    )}

                    <div className="flex flex-wrap gap-2">
                        {campaignRunning ? (
                            <Button variant="outline" onClick={() => { stopRequested.current = true; }}>
                                {l('Остановить после текущей порции', 'Stop after current batch', 'Apturēt pēc pašreizējās partijas')}
                            </Button>
                        ) : (
                            <Button onClick={runCampaign} disabled={campaign?.finished ?? false}>
                                {campaign && campaign.sentCount + campaign.errorCount > 0 && !campaign.finished
                                    ? l('Продолжить рассылку', 'Continue mailing', 'Turpināt sūtīšanu')
                                    : l('Начать рассылку', 'Start mailing', 'Sākt sūtīšanu')}
                            </Button>
                        )}
                        {campaign?.finished && (
                            <Button variant="outline" onClick={resetCampaign}>
                                {l('Сбросить (новая кампания)', 'Reset (new campaign)', 'Atiestatīt (jauna kampaņa)')}
                            </Button>
                        )}
                    </div>
                </section>
            </main>
        </AdminGate>
    );
}
```

- [ ] **Step 2: Карточка в админ-дашборде**

В `app/admin/page.tsx` после строки с `id: 'barcodes'` (строка 140) добавить:

```tsx
    { id: 'invitations', href: '/admin/invitations',           adminOnly: true,  bg: 'bg-indigo-50 dark:bg-indigo-950/20', border: 'border-l-indigo-500', title: l('Приглашения клиентов', 'Client invitations', 'Klientu ielūgumi'), description: l('Приглашения держателям карт и рассылка правил получения карты', 'Invitations for card holders and card-rules mailing', 'Ielūgumi karšu īpašniekiem un kartes noteikumu izsūtīšana'), linkText: l('Открыть', 'Open', 'Atvērt') },
```

- [ ] **Step 3: Типы и линт**

Run: `npm run typecheck && npx eslint app/admin/invitations/page.tsx app/admin/page.tsx`
Expected: без ошибок

- [ ] **Step 4: Ручная сквозная проверка (dev)**

1. `npm run dev`, логин `admin@test.com` → `/admin` → карточка «Приглашения клиентов» видна → открыть.
2. Назначить карту `user@test.com` → `1001` → клиент появился в таблице со статусом «не приглашён».
3. «Пригласить» → статус «отправлено», письмо в консоли dev-сервера, кнопка ⧉ копирует ссылку.
4. Открыть ссылку в инкогнито → задать пароль → «Аккаунт активирован» → `/account` залогинен.
5. Вернуться в админку → статус «зарегистрировался».
6. Секция B: «Начать рассылку» → счётчик растёт порциями по 50, письма в консоли; «Остановить» останавливает; «Продолжить» продолжает с курсора.
7. `{"reset":true}` вручную или дождаться finished → «Сбросить».

- [ ] **Step 5: Commit + push**

```bash
git add app/admin/invitations/page.tsx app/admin/page.tsx
git commit -m "feat(invitations): admin invitations page with card-holder statuses and campaign"
git push origin main
```

---

### Task 9: Финальная проверка

**Files:** нет новых.

- [ ] **Step 1: Полный прогон тестов и типов**

Run: `npm run typecheck && npm run test:unit`
Expected: PASS, все существующие тесты не сломаны.

- [ ] **Step 2: Линт всего диффа**

Run: `npx eslint lib/invitations.ts lib/invitation-emails.ts app/api/admin/invitations app/api/admin/card-rules-campaign app/api/auth/invite app/auth/invite app/admin/invitations`
Expected: чисто.

- [ ] **Step 3: Сверка со спекой**

Пройтись по `docs/superpowers/specs/2026-07-06-client-card-invitations-design.md` §1–§6 — каждый пункт покрыт задачами 1–8. Отметить в спеке ничего не нужно; расхождения — фиксить кодом, не спекой.

Сознательное отступление от §7: playwright-e2e не пишем — сценарий мутирует общую тестовую Neon-БД (создаёт компании, переписывает пароли). Вместо него — ручная сквозная проверка Task 8 Step 4, покрывающая тот же путь. Идемпотентность батча кампании проверяется руками (Task 6 Step 3), юнитами покрыты чистые функции.

- [ ] **Step 4: Финальный коммит (если были правки) + push**

```bash
git add -A && git commit -m "chore(invitations): final lint/type fixes" && git push origin main
```

---

## Решения, зафиксированные планом (из спеки)

- Токен потребляется на **POST** (не на GET, как в `/api/auth/confirm`) — форме нужно два обращения.
- `inviteUrl` отдаётся админу в GET/POST ответах — кнопка «скопировать ссылку» страхует от недоставки email.
- Кампания B шлёт только `ru`-письма (у юзеров нет поля языка; DB-шаблон `card-rules-ru` переопределяет текст).
- Конфликт `Company.cardNumber @unique` при активации → компания создаётся без карты, карта остаётся на юзере.
- Снятие карты с юзера не поддерживается (только назначение) — YAGNI.
