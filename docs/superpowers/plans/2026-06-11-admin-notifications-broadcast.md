# Admin Notifications Broadcast Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow admins to send notifications to selected users with channel choice: in-app only, email only, or both.

**Architecture:** Add a `UserNotification` DB table as a server-side queue for in-app messages (bypassing the client-only Zustand store). Admin creates records and sends emails via `POST /api/admin/notifications/send`. The client fetches pending in-app notifications via `GET /api/notifications/inbox` on account page mount, merges them into the Zustand store, and the server marks them delivered atomically.

**Tech Stack:** Prisma (Neon Postgres), Next.js App Router API routes (`runtime = 'nodejs'`), Zustand (`lib/notifications-store.ts`), Nodemailer (`lib/mailer.ts`), Vitest, Shadcn/ui, Tailwind CSS

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `prisma/schema.prisma` | Modify | Add `UserNotification` model |
| `app/api/notifications/inbox/route.ts` | Create | User fetches undelivered in-app notifications |
| `app/api/notifications/inbox/route.test.ts` | Create | Tests for inbox route |
| `app/api/admin/notifications/send/route.ts` | Create | Admin sends notifications to selected users |
| `app/api/admin/notifications/send/route.test.ts` | Create | Tests for admin send route |
| `lib/notifications-store.ts` | Modify | Add `fetchInbox` action to interface + implementation |
| `components/account/AccountNotificationsSection.tsx` | Modify | Call `fetchInbox` on mount |
| `app/admin/notifications/send/page.tsx` | Create | Admin UI: user search + notification form |
| `components/admin/AdminSidebar.tsx` | Modify | Add nav item under Customers |
| `data/translations.ts` | Modify | Add all new translation keys (RU/EN/LV) |

---

### Task 1: Prisma schema — add UserNotification model

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add relation to User model**

In `prisma/schema.prisma`, find the `User` model and add `userNotifications` after `sessions Session[]`:

```prisma
model User {
  id                  String    @id
  email               String    @unique
  passwordHash        String
  name                String?
  platformRole        String    @default("customer")
  companyId           String?
  companyName         String?
  teamRole            String?
  approvalRequired    Boolean   @default(false)
  auditLoggingEnabled Boolean   @default(false)
  phone               String?
  cardNumber          String?   @unique
  avatarUrl           String?
  bonusPoints         Int       @default(350)
  mustChangePassword  Boolean   @default(false)
  createdAt           DateTime  @default(now())
  updatedAt           DateTime  @updatedAt
  sessions            Session[]
  userNotifications   UserNotification[]

  @@index([email])
  @@index([companyId])
}
```

- [ ] **Step 2: Add UserNotification model**

At the end of `prisma/schema.prisma`, add:

```prisma
model UserNotification {
  id           String   @id @default(cuid())
  userId       String
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  type         String   @default("info")
  title        String
  message      String
  link         String?
  channel      String   @default("app")
  emailSent    Boolean  @default(false)
  appDelivered Boolean  @default(false)
  createdAt    DateTime @default(now())

  @@index([userId, appDelivered])
  @@index([createdAt])
}
```

- [ ] **Step 3: Generate Prisma client**

```bash
npx prisma generate
```

Expected: `✔ Generated Prisma Client (v6.x.x)`

- [ ] **Step 4: Push schema to DB**

```bash
npx prisma db push
```

Expected: `Your database is now in sync with your Prisma schema.`

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma generated/
git commit -m "feat: add UserNotification model for server-side notification queue"
```

---

### Task 2: GET /api/notifications/inbox route

**Files:**
- Create: `app/api/notifications/inbox/route.ts`
- Create: `app/api/notifications/inbox/route.test.ts`

- [ ] **Step 1: Write failing tests**

Create `app/api/notifications/inbox/route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from './route'
import { NextRequest } from 'next/server'

vi.mock('@/lib/server-auth', () => ({ getServerUser: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    userNotification: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}))

import { getServerUser } from '@/lib/server-auth'
import { prisma } from '@/lib/prisma'

function makeRequest(): NextRequest {
  return new NextRequest('http://localhost/api/notifications/inbox')
}

describe('GET /api/notifications/inbox', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when not authenticated', async () => {
    vi.mocked(getServerUser).mockResolvedValue(null)
    const res = await GET(makeRequest())
    expect(res.status).toBe(401)
    expect(prisma.userNotification.findMany).not.toHaveBeenCalled()
  })

  it('returns empty array when no pending notifications', async () => {
    vi.mocked(getServerUser).mockResolvedValue({ id: 'u1', email: 'a@b.com' } as any)
    vi.mocked(prisma.userNotification.findMany as any).mockResolvedValue([])
    vi.mocked(prisma.userNotification.updateMany as any).mockResolvedValue({ count: 0 })
    const res = await GET(makeRequest())
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.notifications).toEqual([])
  })

  it('returns pending notifications and marks them delivered', async () => {
    vi.mocked(getServerUser).mockResolvedValue({ id: 'u1', email: 'a@b.com' } as any)
    const dbRows = [
      { id: 'n1', type: 'info',    title: 'Hello', message: 'World',  link: null,       createdAt: new Date('2025-01-01') },
      { id: 'n2', type: 'success', title: 'Done',  message: 'OK',     link: '/account', createdAt: new Date('2025-01-02') },
    ]
    vi.mocked(prisma.userNotification.findMany as any).mockResolvedValue(dbRows)
    vi.mocked(prisma.userNotification.updateMany as any).mockResolvedValue({ count: 2 })
    const res = await GET(makeRequest())
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.notifications).toHaveLength(2)
    expect(json.notifications[0]).toMatchObject({ type: 'info', title: 'Hello', message: 'World' })
    expect(json.notifications[1]).toMatchObject({ link: '/account' })
    expect(prisma.userNotification.updateMany).toHaveBeenCalledWith({
      where: { userId: 'u1', id: { in: ['n1', 'n2'] } },
      data: { appDelivered: true },
    })
  })

  it('does not call updateMany when no rows returned', async () => {
    vi.mocked(getServerUser).mockResolvedValue({ id: 'u1', email: 'a@b.com' } as any)
    vi.mocked(prisma.userNotification.findMany as any).mockResolvedValue([])
    const res = await GET(makeRequest())
    expect(res.status).toBe(200)
    expect(prisma.userNotification.updateMany).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npx vitest run app/api/notifications/inbox/route.test.ts
```

Expected: FAIL — "Cannot find module './route'"

- [ ] **Step 3: Implement the route**

Create `app/api/notifications/inbox/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getServerUser } from '@/lib/server-auth'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'

export async function GET(_req: NextRequest) {
  try {
    const user = await getServerUser()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const rows = await prisma.userNotification.findMany({
      where: {
        userId: user.id,
        appDelivered: false,
        channel: { in: ['app', 'both'] },
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true, type: true, title: true, message: true, link: true, createdAt: true },
    })

    if (rows.length > 0) {
      await prisma.userNotification.updateMany({
        where: { userId: user.id, id: { in: rows.map((r) => r.id) } },
        data: { appDelivered: true },
      })
    }

    const notifications = rows.map((r) => ({
      type: r.type,
      title: r.title,
      message: r.message,
      link: r.link ?? undefined,
    }))

    return NextResponse.json({ notifications })
  } catch (err) {
    console.error('[notifications/inbox]', err)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npx vitest run app/api/notifications/inbox/route.test.ts
```

Expected: 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add app/api/notifications/inbox/route.ts app/api/notifications/inbox/route.test.ts
git commit -m "feat: add GET /api/notifications/inbox route"
```

---

### Task 3: POST /api/admin/notifications/send route

**Files:**
- Create: `app/api/admin/notifications/send/route.ts`
- Create: `app/api/admin/notifications/send/route.test.ts`

- [ ] **Step 1: Write failing tests**

Create `app/api/admin/notifications/send/route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from './route'
import { NextRequest } from 'next/server'

vi.mock('@/lib/server-auth', () => ({ getServerUser: vi.fn() }))
vi.mock('@/lib/mailer', () => ({ sendEmail: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findMany: vi.fn() },
    userNotification: { createMany: vi.fn() },
  },
}))

import { getServerUser } from '@/lib/server-auth'
import { sendEmail } from '@/lib/mailer'
import { prisma } from '@/lib/prisma'

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/admin/notifications/send', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('POST /api/admin/notifications/send', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 403 when not authenticated', async () => {
    vi.mocked(getServerUser).mockResolvedValue(null)
    const res = await POST(makeRequest({ userIds: ['u1'], title: 'T', message: 'M', type: 'info', channel: 'app' }))
    expect(res.status).toBe(403)
  })

  it('returns 403 when caller is not admin', async () => {
    vi.mocked(getServerUser).mockResolvedValue({ id: 'u1', platformRole: 'customer' } as any)
    const res = await POST(makeRequest({ userIds: ['u2'], title: 'T', message: 'M', type: 'info', channel: 'app' }))
    expect(res.status).toBe(403)
  })

  it('returns 400 when userIds is empty', async () => {
    vi.mocked(getServerUser).mockResolvedValue({ id: 'a1', platformRole: 'admin' } as any)
    const res = await POST(makeRequest({ userIds: [], title: 'T', message: 'M', type: 'info', channel: 'app' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when title is missing', async () => {
    vi.mocked(getServerUser).mockResolvedValue({ id: 'a1', platformRole: 'admin' } as any)
    const res = await POST(makeRequest({ userIds: ['u1'], message: 'M', type: 'info', channel: 'app' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when message is missing', async () => {
    vi.mocked(getServerUser).mockResolvedValue({ id: 'a1', platformRole: 'admin' } as any)
    const res = await POST(makeRequest({ userIds: ['u1'], title: 'T', type: 'info', channel: 'app' }))
    expect(res.status).toBe(400)
  })

  it('creates app notifications without sending email for channel=app', async () => {
    vi.mocked(getServerUser).mockResolvedValue({ id: 'a1', platformRole: 'admin' } as any)
    vi.mocked(prisma.userNotification.createMany as any).mockResolvedValue({ count: 2 })
    const res = await POST(makeRequest({
      userIds: ['u1', 'u2'],
      title: 'Flash sale',
      message: 'Use code SAVE10',
      type: 'promo',
      channel: 'app',
    }))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.created).toBe(2)
    expect(json.emailsSent).toBe(0)
    expect(sendEmail).not.toHaveBeenCalled()
    expect(prisma.userNotification.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ userId: 'u1', title: 'Flash sale', channel: 'app' }),
        expect.objectContaining({ userId: 'u2', title: 'Flash sale', channel: 'app' }),
      ]),
    })
  })

  it('sends emails for channel=email', async () => {
    vi.mocked(getServerUser).mockResolvedValue({ id: 'a1', platformRole: 'admin' } as any)
    vi.mocked(prisma.user.findMany as any).mockResolvedValue([
      { id: 'u1', email: 'alice@example.com' },
      { id: 'u2', email: 'bob@example.com' },
    ])
    vi.mocked(prisma.userNotification.createMany as any).mockResolvedValue({ count: 2 })
    vi.mocked(sendEmail as any).mockResolvedValue(undefined)
    const res = await POST(makeRequest({
      userIds: ['u1', 'u2'],
      title: 'Sale',
      message: 'Big discounts',
      type: 'success',
      channel: 'email',
    }))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.emailsSent).toBe(2)
    expect(json.emailsFailed).toBe(0)
    expect(sendEmail).toHaveBeenCalledTimes(2)
  })

  it('counts failed emails separately, still returns 200', async () => {
    vi.mocked(getServerUser).mockResolvedValue({ id: 'a1', platformRole: 'admin' } as any)
    vi.mocked(prisma.user.findMany as any).mockResolvedValue([{ id: 'u1', email: 'bad@bad.bad' }])
    vi.mocked(prisma.userNotification.createMany as any).mockResolvedValue({ count: 1 })
    vi.mocked(sendEmail as any).mockRejectedValue(new Error('smtp error'))
    const res = await POST(makeRequest({
      userIds: ['u1'],
      title: 'T',
      message: 'M',
      type: 'info',
      channel: 'email',
    }))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.emailsSent).toBe(0)
    expect(json.emailsFailed).toBe(1)
    expect(json.created).toBe(1)
  })

  it('rejects javascript: links', async () => {
    vi.mocked(getServerUser).mockResolvedValue({ id: 'a1', platformRole: 'admin' } as any)
    vi.mocked(prisma.userNotification.createMany as any).mockResolvedValue({ count: 1 })
    const res = await POST(makeRequest({
      userIds: ['u1'],
      title: 'T',
      message: 'M',
      type: 'info',
      channel: 'app',
      link: 'javascript:alert(1)',
    }))
    expect(res.status).toBe(200)
    expect(prisma.userNotification.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([expect.objectContaining({ link: null })]),
    })
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npx vitest run app/api/admin/notifications/send/route.test.ts
```

Expected: FAIL — "Cannot find module './route'"

- [ ] **Step 3: Implement the route**

Create `app/api/admin/notifications/send/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getServerUser } from '@/lib/server-auth'
import { prisma } from '@/lib/prisma'
import { sendEmail } from '@/lib/mailer'

export const runtime = 'nodejs'

const ALLOWED_TYPES = ['info', 'success', 'warning', 'promo'] as const
type AllowedType = typeof ALLOWED_TYPES[number]

const TYPE_COLOR: Record<AllowedType, string> = {
  info:    '#4f46e5',
  success: '#059669',
  warning: '#d97706',
  promo:   '#7c3aed',
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
}

function buildHtml(title: string, message: string, type: AllowedType, link: string | null, siteUrl: string): string {
  const accentColor = TYPE_COLOR[type]
  const fullLink = link ? `${siteUrl}${link}` : null
  return `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
      <div style="border-left:4px solid ${accentColor};padding:16px 20px;background:#f9fafb;border-radius:0 8px 8px 0;margin-bottom:16px">
        <h2 style="margin:0 0 8px;font-size:16px;color:#111827">${escHtml(title)}</h2>
        <p style="margin:0;font-size:14px;color:#374151;line-height:1.5">${escHtml(message)}</p>
      </div>
      ${fullLink ? `<a href="${escHtml(fullLink)}" style="display:inline-block;padding:10px 20px;background:${accentColor};color:#fff;border-radius:6px;font-size:14px;text-decoration:none">Open</a>` : ''}
      <p style="margin:16px 0 0;font-size:12px;color:#9ca3af">You received this notification from the store.</p>
    </div>`
}

export async function POST(req: NextRequest) {
  try {
    const caller = await getServerUser()
    if (!caller || caller.platformRole !== 'admin') {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const body = await req.json() as {
      userIds?: unknown
      title?: string
      message?: string
      type?: string
      link?: string
      channel?: string
    }

    const userIds = Array.isArray(body.userIds)
      ? (body.userIds as unknown[]).filter((id): id is string => typeof id === 'string' && id.length > 0)
      : []
    const title   = body.title?.trim() ?? ''
    const message = body.message?.trim() ?? ''
    const type: AllowedType = (ALLOWED_TYPES as readonly string[]).includes(body.type ?? '')
      ? (body.type as AllowedType)
      : 'info'
    const channel = (['app', 'email', 'both'] as const).includes(body.channel as 'app' | 'email' | 'both')
      ? (body.channel as 'app' | 'email' | 'both')
      : 'app'
    const rawLink = typeof body.link === 'string' ? body.link.trim() : ''
    const link    = (rawLink && /^\/[^/]/.test(rawLink)) ? rawLink : null

    if (userIds.length === 0) return NextResponse.json({ error: 'no_recipients' },  { status: 400 })
    if (!title)               return NextResponse.json({ error: 'title_required' },  { status: 400 })
    if (!message)             return NextResponse.json({ error: 'message_required' }, { status: 400 })

    const now = new Date()
    await prisma.userNotification.createMany({
      data: userIds.map((userId) => ({
        userId,
        type,
        title,
        message,
        link,
        channel,
        emailSent:    false,
        appDelivered: false,
        createdAt:    now,
      })),
    })

    let emailsSent   = 0
    let emailsFailed = 0

    if (channel === 'email' || channel === 'both') {
      const users = await prisma.user.findMany({
        where:  { id: { in: userIds } },
        select: { id: true, email: true },
      })
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? ''
      const html = buildHtml(title, message, type, link, siteUrl)

      for (const u of users) {
        try {
          await sendEmail(u.email, title, html)
          emailsSent++
        } catch {
          emailsFailed++
        }
      }
    }

    return NextResponse.json({ ok: true, created: userIds.length, emailsSent, emailsFailed })
  } catch (err) {
    console.error('[admin/notifications/send]', err)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npx vitest run app/api/admin/notifications/send/route.test.ts
```

Expected: 9 tests PASS

- [ ] **Step 5: Commit**

```bash
git add app/api/admin/notifications/send/route.ts app/api/admin/notifications/send/route.test.ts
git commit -m "feat: add POST /api/admin/notifications/send route"
```

---

### Task 4: fetchInbox in notifications store + AccountNotificationsSection

**Files:**
- Modify: `lib/notifications-store.ts`
- Modify: `components/account/AccountNotificationsSection.tsx`

Context: `lib/notifications-store.ts` is a Zustand `persist` store. It has `addNotification`, `isSubscribed`, `channel`, etc. The `NotificationsStore` interface must be extended with `fetchInbox`.

`components/account/AccountNotificationsSection.tsx` already imports `useNotificationsStore`. It has an existing `useEffect` (line ~230) that clears stale selections. Add a separate `useEffect` for `fetchInbox`.

- [ ] **Step 1: Add fetchInbox to the store interface and implementation**

In `lib/notifications-store.ts`, add `fetchInbox: () => Promise<void>` to the `NotificationsStore` interface:

```typescript
interface NotificationsStore {
  notifications: Notification[]
  isSubscribed: boolean
  channel: NotificationChannel
  setChannel: (channel: NotificationChannel) => void
  subscribe: () => void
  unsubscribe: () => void
  markRead: (id: string) => void
  markAllRead: () => void
  deleteNotification: (id: string) => void
  deleteSelected: (ids: string[]) => void
  deleteAll: () => void
  addNotification: (n: Omit<Notification, 'id' | 'createdAt' | 'isRead'>) => void
  fetchInbox: () => Promise<void>
  unreadCount: () => number
}
```

Add the `fetchInbox` implementation inside the `persist(...)` store body, after `addNotification`:

```typescript
      fetchInbox: async () => {
        if (typeof window === 'undefined') return
        try {
          const res = await fetch('/api/notifications/inbox')
          if (!res.ok) return
          const data = await res.json() as { notifications: Array<Omit<Notification, 'id' | 'createdAt' | 'isRead'>> }
          if (!Array.isArray(data.notifications)) return
          for (const n of data.notifications) {
            get().addNotification(n)
          }
        } catch {}
      },
```

- [ ] **Step 2: Run existing test suite — verify nothing broke**

```bash
npx vitest run
```

Expected: all existing tests PASS (inbox route tests also pass since they're in the suite now)

- [ ] **Step 3: Call fetchInbox on mount in AccountNotificationsSection**

In `components/account/AccountNotificationsSection.tsx`, find the destructured store values (around line 195–198):

```typescript
    } = useNotificationsStore();
```

Add `fetchInbox` to the destructured values:

```typescript
    fetchInbox,
  } = useNotificationsStore();
```

Add a new `useEffect` after the existing ones (after the stale-selection-clear effect):

```typescript
    React.useEffect(() => {
      fetchInbox()
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
```

- [ ] **Step 4: Commit**

```bash
git add lib/notifications-store.ts components/account/AccountNotificationsSection.tsx
git commit -m "feat: fetch server-side inbox notifications on account page mount"
```

---

### Task 5: Translation keys

**Files:**
- Modify: `data/translations.ts`

Context: `data/translations.ts` has three language sections: `ru` starts at line 5, `en` starts at line 1745, `lv` starts at line 3468. Each section ends just before the next. Keys for admin sidebar customers are: `admin.sidebar.customers.history` (last in the customers group). New keys must be added in the same relative position in all three sections.

- [ ] **Step 1: Add RU keys**

In the `ru` section, find:
```
    'admin.sidebar.customers.history': 'История взаимодействий',
```

Add after it:
```typescript
    'admin.sidebar.customers.notifications': 'Рассылка уведомлений',
    'admin.notifications.title': 'Рассылка уведомлений',
    'admin.notifications.subtitle': 'Отправьте уведомление выбранным пользователям',
    'admin.notifications.searchUsers': 'Поиск пользователей по имени или email',
    'admin.notifications.noUsersFound': 'Пользователи не найдены',
    'admin.notifications.selectedCount': 'Выбрано: {count}',
    'admin.notifications.selectAll': 'Выбрать всех',
    'admin.notifications.clearSelection': 'Сбросить',
    'admin.notifications.form.title': 'Заголовок',
    'admin.notifications.form.message': 'Сообщение',
    'admin.notifications.form.type': 'Тип',
    'admin.notifications.form.link': 'Ссылка (необязательно)',
    'admin.notifications.form.linkHint': 'Внутренний путь, например /account',
    'admin.notifications.form.channel': 'Канал доставки',
    'admin.notifications.form.channelApp': 'Только в кабинет',
    'admin.notifications.form.channelEmail': 'Только на почту',
    'admin.notifications.form.channelBoth': 'В кабинет и на почту',
    'admin.notifications.send': 'Отправить',
    'admin.notifications.sending': 'Отправка...',
    'admin.notifications.resultCreated': 'Создано уведомлений: {count}',
    'admin.notifications.resultEmails': 'Писем отправлено: {sent}, не доставлено: {failed}',
    'admin.notifications.typeInfo': 'Информация',
    'admin.notifications.typeSuccess': 'Успех',
    'admin.notifications.typeWarning': 'Предупреждение',
    'admin.notifications.typePromo': 'Акция',
```

- [ ] **Step 2: Add EN keys**

In the `en` section, find:
```
    'admin.sidebar.customers.history': 'Interaction history',
```

Add after it:
```typescript
    'admin.sidebar.customers.notifications': 'Notification broadcast',
    'admin.notifications.title': 'Notification broadcast',
    'admin.notifications.subtitle': 'Send a notification to selected users',
    'admin.notifications.searchUsers': 'Search users by name or email',
    'admin.notifications.noUsersFound': 'No users found',
    'admin.notifications.selectedCount': 'Selected: {count}',
    'admin.notifications.selectAll': 'Select all',
    'admin.notifications.clearSelection': 'Clear',
    'admin.notifications.form.title': 'Title',
    'admin.notifications.form.message': 'Message',
    'admin.notifications.form.type': 'Type',
    'admin.notifications.form.link': 'Link (optional)',
    'admin.notifications.form.linkHint': 'Internal path, e.g. /account',
    'admin.notifications.form.channel': 'Delivery channel',
    'admin.notifications.form.channelApp': 'In-app only',
    'admin.notifications.form.channelEmail': 'Email only',
    'admin.notifications.form.channelBoth': 'In-app and email',
    'admin.notifications.send': 'Send',
    'admin.notifications.sending': 'Sending...',
    'admin.notifications.resultCreated': 'Notifications created: {count}',
    'admin.notifications.resultEmails': 'Emails sent: {sent}, failed: {failed}',
    'admin.notifications.typeInfo': 'Info',
    'admin.notifications.typeSuccess': 'Success',
    'admin.notifications.typeWarning': 'Warning',
    'admin.notifications.typePromo': 'Promo',
```

- [ ] **Step 3: Add LV keys**

In the `lv` section, find:
```
    'admin.sidebar.customers.history': 'Mijiedarbibas vesture',
```

Add after it:
```typescript
    'admin.sidebar.customers.notifications': 'Pazinojumu izsutisana',
    'admin.notifications.title': 'Pazinojumu izsutisana',
    'admin.notifications.subtitle': 'Nosutiet pazinojumu izveletajiem lietotajiem',
    'admin.notifications.searchUsers': 'Meklet lietotajus pec varda vai e-pasta',
    'admin.notifications.noUsersFound': 'Lietotaji nav atrasti',
    'admin.notifications.selectedCount': 'Izvelegti: {count}',
    'admin.notifications.selectAll': 'Izveleties visus',
    'admin.notifications.clearSelection': 'Notirit',
    'admin.notifications.form.title': 'Virsraksts',
    'admin.notifications.form.message': 'Zinojums',
    'admin.notifications.form.type': 'Tips',
    'admin.notifications.form.link': 'Saite (neobligati)',
    'admin.notifications.form.linkHint': 'Ieksheja cela, piem. /account',
    'admin.notifications.form.channel': 'Piegades kanals',
    'admin.notifications.form.channelApp': 'Tikai kabineta',
    'admin.notifications.form.channelEmail': 'Tikai e-pasts',
    'admin.notifications.form.channelBoth': 'Kabineta un e-pasts',
    'admin.notifications.send': 'Nosutit',
    'admin.notifications.sending': 'Notiek nosutisana...',
    'admin.notifications.resultCreated': 'Izveidoti pazinojumi: {count}',
    'admin.notifications.resultEmails': 'E-pasti nosutiti: {sent}, neizdevies: {failed}',
    'admin.notifications.typeInfo': 'Informacija',
    'admin.notifications.typeSuccess': 'Veiksme',
    'admin.notifications.typeWarning': 'Bridinjums',
    'admin.notifications.typePromo': 'Akcija',
```

- [ ] **Step 4: Commit**

```bash
git add data/translations.ts
git commit -m "feat: add admin notifications broadcast translation keys"
```

---

### Task 6: Admin sidebar nav item

**Files:**
- Modify: `components/admin/AdminSidebar.tsx`

Context: the sidebar nav items are in an array. The `customers` group has items including `{ title: 'customers.history', href: '/admin/customers/history' }`. The `title` field maps to `admin.sidebar.${title}` in translations.

- [ ] **Step 1: Add nav item to sidebar**

In `components/admin/AdminSidebar.tsx`, find:
```typescript
            { title: 'customers.history', href: '/admin/customers/history' },
```

Add after it:
```typescript
            { title: 'customers.notifications', href: '/admin/notifications/send' },
```

- [ ] **Step 2: Commit**

```bash
git add components/admin/AdminSidebar.tsx
git commit -m "feat: add notification broadcast link to admin sidebar"
```

---

### Task 7: Admin UI page

**Files:**
- Create: `app/admin/notifications/send/page.tsx`

Context:
- Uses `AdminGate` from `@/components/admin/AdminGate` for auth (wraps the page, redirects non-admins)
- Uses `useTranslation` from `@/lib/use-translation` for `t(key)` translations
- Fetches users from `GET /api/admin/users?search=...&take=100` — returns `{ users: Array<{ id, email, name, platformRole }>, total }` 
- Sends to `POST /api/admin/notifications/send`
- Follows visual style of `app/admin/customers/segments/page.tsx`: white card sections, gray background, Shadcn `Button`, `Input`
- Translation key prefix: `admin.notifications.*` (defined in Task 5)

- [ ] **Step 1: Create the page**

Create `app/admin/notifications/send/page.tsx`:

```tsx
'use client'

import React, { useCallback, useEffect, useState } from 'react'
import AdminGate from '@/components/admin/AdminGate'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useTranslation } from '@/lib/use-translation'

type UserRow = { id: string; email: string; name: string | null; platformRole: string }
type Channel = 'app' | 'email' | 'both'
type NotifType = 'info' | 'success' | 'warning' | 'promo'
type SendResult = { created: number; emailsSent: number; emailsFailed: number }

const TYPE_COLORS: Record<NotifType, string> = {
  info:    'bg-indigo-100 text-indigo-800 border-indigo-300',
  success: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  warning: 'bg-amber-100 text-amber-800 border-amber-300',
  promo:   'bg-purple-100 text-purple-800 border-purple-300',
}

function renderKey(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`))
}

export default function AdminNotificationsSendPage() {
  const { t } = useTranslation()

  const [users, setUsers]               = useState<UserRow[]>([])
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [search, setSearch]             = useState('')
  const [selectedIds, setSelectedIds]   = useState<Set<string>>(new Set())

  const [title, setTitle]     = useState('')
  const [message, setMessage] = useState('')
  const [type, setType]       = useState<NotifType>('info')
  const [link, setLink]       = useState('')
  const [channel, setChannel] = useState<Channel>('app')

  const [sending, setSending]   = useState(false)
  const [result, setResult]     = useState<SendResult | null>(null)
  const [sendError, setSendError] = useState<string | null>(null)

  const fetchUsers = useCallback((q: string) => {
    setLoadingUsers(true)
    fetch(`/api/admin/users?search=${encodeURIComponent(q)}&take=100`)
      .then(async (res) => {
        if (!res.ok) throw new Error()
        const data = await res.json() as { users: UserRow[] }
        setUsers(data.users)
      })
      .catch(() => setUsers([]))
      .finally(() => setLoadingUsers(false))
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => fetchUsers(search), 300)
    return () => clearTimeout(timer)
  }, [search, fetchUsers])

  const toggleUser = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const selectAll = () => setSelectedIds(new Set(users.map((u) => u.id)))
  const clearSelection = () => setSelectedIds(new Set())

  const handleSend = async () => {
    if (selectedIds.size === 0 || !title.trim() || !message.trim()) return
    setSending(true)
    setResult(null)
    setSendError(null)
    try {
      const res = await fetch('/api/admin/notifications/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userIds: Array.from(selectedIds),
          title:   title.trim(),
          message: message.trim(),
          type,
          link:    link.trim() || undefined,
          channel,
        }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json() as SendResult
      setResult(data)
      setTitle('')
      setMessage('')
      setLink('')
      setSelectedIds(new Set())
    } catch {
      setSendError('send_failed')
    } finally {
      setSending(false)
    }
  }

  const TYPES: NotifType[] = ['info', 'success', 'warning', 'promo']
  const CHANNELS: { value: Channel; labelKey: string }[] = [
    { value: 'app',   labelKey: 'admin.notifications.form.channelApp'   },
    { value: 'email', labelKey: 'admin.notifications.form.channelEmail' },
    { value: 'both',  labelKey: 'admin.notifications.form.channelBoth'  },
  ]
  const TYPE_LABEL_KEYS: Record<NotifType, string> = {
    info:    'admin.notifications.typeInfo',
    success: 'admin.notifications.typeSuccess',
    warning: 'admin.notifications.typeWarning',
    promo:   'admin.notifications.typePromo',
  }

  const canSend = selectedIds.size > 0 && title.trim().length > 0 && message.trim().length > 0 && !sending

  return (
    <AdminGate>
      <main className="w-full px-4 py-8">
        <div className="mx-auto max-w-5xl">
          <h1 className="mb-1 text-2xl font-bold text-gray-900 dark:text-gray-100">
            {t('admin.notifications.title')}
          </h1>
          <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
            {t('admin.notifications.subtitle')}
          </p>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* ── User selection ── */}
            <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-900">
              <div className="mb-4 flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {renderKey(t('admin.notifications.selectedCount'), { count: selectedIds.size })}
                </span>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={selectAll} disabled={users.length === 0}>
                    {t('admin.notifications.selectAll')}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={clearSelection} disabled={selectedIds.size === 0}>
                    {t('admin.notifications.clearSelection')}
                  </Button>
                </div>
              </div>

              <Input
                placeholder={t('admin.notifications.searchUsers')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="mb-3"
              />

              <div className="h-80 overflow-y-auto rounded-lg border border-gray-100 dark:border-gray-700">
                {loadingUsers ? (
                  <div className="flex h-full items-center justify-center text-sm text-gray-400">
                    {t('common.loading')}
                  </div>
                ) : users.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-sm text-gray-400">
                    {t('admin.notifications.noUsersFound')}
                  </div>
                ) : (
                  <ul>
                    {users.map((u) => (
                      <li
                        key={u.id}
                        onClick={() => toggleUser(u.id)}
                        className={`flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800 ${
                          selectedIds.has(u.id) ? 'bg-indigo-50 dark:bg-indigo-900/20' : ''
                        }`}
                      >
                        <input
                          type="checkbox"
                          readOnly
                          checked={selectedIds.has(u.id)}
                          className="h-4 w-4 rounded border-gray-300 accent-indigo-600"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                            {u.name || u.email}
                          </p>
                          {u.name && (
                            <p className="truncate text-xs text-gray-500 dark:text-gray-400">{u.email}</p>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>

            {/* ── Notification form ── */}
            <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-900">
              <div className="space-y-4">
                {/* Type */}
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    {t('admin.notifications.form.type')}
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {TYPES.map((tp) => (
                      <button
                        key={tp}
                        type="button"
                        onClick={() => setType(tp)}
                        className={`rounded-full border px-3 py-1 text-xs font-medium transition-opacity ${TYPE_COLORS[tp]} ${
                          type === tp ? 'opacity-100 ring-2 ring-offset-1 ring-indigo-500' : 'opacity-60 hover:opacity-80'
                        }`}
                      >
                        {t(TYPE_LABEL_KEYS[tp])}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Title */}
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    {t('admin.notifications.form.title')}
                  </label>
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    maxLength={120}
                  />
                </div>

                {/* Message */}
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    {t('admin.notifications.form.message')}
                  </label>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    rows={4}
                    maxLength={500}
                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                  />
                </div>

                {/* Link */}
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    {t('admin.notifications.form.link')}
                  </label>
                  <Input
                    value={link}
                    onChange={(e) => setLink(e.target.value)}
                    placeholder="/account"
                  />
                  <p className="mt-1 text-xs text-gray-400">{t('admin.notifications.form.linkHint')}</p>
                </div>

                {/* Channel */}
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    {t('admin.notifications.form.channel')}
                  </label>
                  <div className="flex flex-col gap-2">
                    {CHANNELS.map(({ value, labelKey }) => (
                      <label key={value} className="flex cursor-pointer items-center gap-2">
                        <input
                          type="radio"
                          name="channel"
                          value={value}
                          checked={channel === value}
                          onChange={() => setChannel(value)}
                          className="accent-indigo-600"
                        />
                        <span className="text-sm text-gray-700 dark:text-gray-300">{t(labelKey)}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Send button */}
                <Button
                  className="w-full"
                  onClick={handleSend}
                  disabled={!canSend}
                >
                  {sending ? t('admin.notifications.sending') : t('admin.notifications.send')}
                </Button>

                {/* Result */}
                {result && (
                  <div className="rounded-lg bg-emerald-50 p-4 text-sm text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300">
                    <p>{renderKey(t('admin.notifications.resultCreated'), { count: result.created })}</p>
                    {(result.emailsSent > 0 || result.emailsFailed > 0) && (
                      <p>{renderKey(t('admin.notifications.resultEmails'), { sent: result.emailsSent, failed: result.emailsFailed })}</p>
                    )}
                  </div>
                )}

                {sendError && (
                  <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300">
                    {sendError}
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>
      </main>
    </AdminGate>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add app/admin/notifications/send/page.tsx
git commit -m "feat: add admin notification broadcast UI page"
```

---

## Self-Review

**Spec coverage:**
- Admin selects users ✓ (user list with search + checkboxes)
- Channel choice: app / email / both ✓
- In-app delivery via DB queue ✓ (`UserNotification` table)
- Email delivery ✓ (`sendEmail` in admin route)
- Client fetches inbox on mount ✓ (`fetchInbox` in store + AccountNotificationsSection)
- Admin-only gated ✓ (`platformRole !== 'admin'` → 403)

**Placeholder scan:** None found — all steps have complete code.

**Type consistency:**
- `AllowedType` defined in Task 3 route, not referenced in other tasks ✓
- `UserNotification` fields in schema match `prisma.userNotification.createMany` data in Task 3 ✓
- `fetchInbox` return type `Promise<void>` matches interface and implementation ✓
- `SendResult` type in UI matches API response shape `{ created, emailsSent, emailsFailed }` ✓
