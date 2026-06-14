# Notification Email Channel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a user selects "To email" or "To account and email" in notification settings, actually send an email for each notification added.

**Architecture:** Create a server-side `POST /api/notifications/send-email` route that authenticates via session cookie, then sends email via the existing `lib/mailer.ts`. Modify `addNotification` in `lib/notifications-store.ts` to fire-and-forget a fetch to that route when `channel === 'email' || channel === 'both'` and `isSubscribed === true`.

**Tech Stack:** Next.js App Router API routes, Nodemailer (`lib/mailer.ts`), Zustand (`lib/notifications-store.ts`), Vitest

---

### Task 1: API route — send notification email

**Files:**
- Create: `app/api/notifications/send-email/route.ts`
- Create: `app/api/notifications/send-email/route.test.ts`

- [ ] **Step 1: Write failing tests**

Create `app/api/notifications/send-email/route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from './route'
import { NextRequest } from 'next/server'

vi.mock('@/lib/mailer', () => ({ sendEmail: vi.fn() }))
vi.mock('@/lib/server-auth', () => ({ getServerUser: vi.fn() }))

import { sendEmail } from '@/lib/mailer'
import { getServerUser } from '@/lib/server-auth'

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/notifications/send-email', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('POST /api/notifications/send-email', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when not authenticated', async () => {
    vi.mocked(getServerUser).mockResolvedValue(null)
    const res = await POST(makeRequest({ title: 'T', message: 'M', type: 'info' }))
    expect(res.status).toBe(401)
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('returns 400 when title is missing', async () => {
    vi.mocked(getServerUser).mockResolvedValue({ id: 'u1', email: 'a@b.com' } as any)
    const res = await POST(makeRequest({ message: 'M', type: 'info' }))
    expect(res.status).toBe(400)
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('returns 400 when message is missing', async () => {
    vi.mocked(getServerUser).mockResolvedValue({ id: 'u1', email: 'a@b.com' } as any)
    const res = await POST(makeRequest({ title: 'T', type: 'info' }))
    expect(res.status).toBe(400)
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('calls sendEmail with user email and returns 200', async () => {
    vi.mocked(getServerUser).mockResolvedValue({ id: 'u1', email: 'user@shop.com' } as any)
    vi.mocked(sendEmail).mockResolvedValue(undefined)
    const res = await POST(makeRequest({ title: 'Order shipped', message: 'Your order is on the way', type: 'success' }))
    expect(res.status).toBe(200)
    expect(sendEmail).toHaveBeenCalledOnce()
    const [to, subject, html] = vi.mocked(sendEmail).mock.calls[0]
    expect(to).toBe('user@shop.com')
    expect(subject).toContain('Order shipped')
    expect(html).toContain('Order shipped')
    expect(html).toContain('Your order is on the way')
  })

  it('includes link button when link is provided', async () => {
    vi.mocked(getServerUser).mockResolvedValue({ id: 'u1', email: 'user@shop.com' } as any)
    vi.mocked(sendEmail).mockResolvedValue(undefined)
    await POST(makeRequest({ title: 'T', message: 'M', type: 'info', link: '/account' }))
    const html = vi.mocked(sendEmail).mock.calls[0][2]
    expect(html).toContain('/account')
  })

  it('returns 500 when sendEmail throws', async () => {
    vi.mocked(getServerUser).mockResolvedValue({ id: 'u1', email: 'user@shop.com' } as any)
    vi.mocked(sendEmail).mockRejectedValue(new Error('smtp error'))
    const res = await POST(makeRequest({ title: 'T', message: 'M', type: 'info' }))
    expect(res.status).toBe(500)
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npx vitest run app/api/notifications/send-email/route.test.ts
```

Expected: FAIL — "Cannot find module './route'"

- [ ] **Step 3: Implement the route**

Create `app/api/notifications/send-email/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getServerUser } from '@/lib/server-auth'
import { sendEmail } from '@/lib/mailer'

export const runtime = 'nodejs'

const TYPE_COLOR: Record<string, string> = {
  info:    '#4f46e5',
  success: '#059669',
  warning: '#d97706',
  promo:   '#7c3aed',
}

export async function POST(req: NextRequest) {
  try {
    const user = await getServerUser()
    if (!user) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    const body = await req.json() as {
      title?: string
      message?: string
      type?: string
      link?: string
    }

    const title = body.title?.trim() ?? ''
    const message = body.message?.trim() ?? ''
    if (!title || !message) {
      return NextResponse.json({ error: 'missing_fields' }, { status: 400 })
    }

    const type = body.type ?? 'info'
    const accentColor = TYPE_COLOR[type] ?? TYPE_COLOR.info
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? ''
    const link = body.link ? `${siteUrl}${body.link}` : null

    const html = `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
        <div style="border-left:4px solid ${accentColor};padding:16px 20px;background:#f9fafb;border-radius:0 8px 8px 0;margin-bottom:16px">
          <h2 style="margin:0 0 8px;font-size:16px;color:#111827">${escHtml(title)}</h2>
          <p style="margin:0;font-size:14px;color:#374151;line-height:1.5">${escHtml(message)}</p>
        </div>
        ${link ? `<a href="${escHtml(link)}" style="display:inline-block;padding:10px 20px;background:${accentColor};color:#fff;border-radius:6px;font-size:14px;text-decoration:none">Open</a>` : ''}
        <p style="margin:16px 0 0;font-size:12px;color:#9ca3af">You received this because you subscribed to email notifications.</p>
      </div>`

    await sendEmail(user.email, title, html)

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[notifications/send-email]', err)
    return NextResponse.json({ error: 'send_failed' }, { status: 500 })
  }
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npx vitest run app/api/notifications/send-email/route.test.ts
```

Expected: all 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add app/api/notifications/send-email/route.ts app/api/notifications/send-email/route.test.ts
git commit -m "feat: add POST /api/notifications/send-email route"
```

---

### Task 2: Wire channel setting into addNotification

**Files:**
- Modify: `lib/notifications-store.ts`

- [ ] **Step 1: Update addNotification to fire email when channel requires it**

Replace `addNotification` in `lib/notifications-store.ts`:

```typescript
addNotification: (n) => {
  const id = `notif_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`
  const createdAt = new Date().toISOString()
  set((state) => ({
    notifications: [
      { ...n, id, createdAt, isRead: false },
      ...state.notifications,
    ],
  }))

  const { channel, isSubscribed } = get()
  if (isSubscribed && (channel === 'email' || channel === 'both') && typeof window !== 'undefined') {
    fetch('/api/notifications/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: n.title, message: n.message, type: n.type, link: n.link }),
    }).catch(() => {})
  }
},
```

- [ ] **Step 2: Run full test suite — verify nothing is broken**

```bash
npx vitest run
```

Expected: all tests PASS

- [ ] **Step 3: Commit**

```bash
git add lib/notifications-store.ts
git commit -m "feat: send email notification when channel is email or both"
```

---

### Task 3: Manual verification

- [ ] **Step 1: Start dev server**

```bash
npm run dev
```

- [ ] **Step 2: Verify channel=app (default) — no email sent**

1. Open `/account`, find Notifications section
2. Subscribe to notifications (if not already)
3. Confirm channel is "To account" (app)
4. Trigger a notification — check server console: no `[mailer]` log

- [ ] **Step 3: Verify channel=email — email sent**

1. Switch channel to "To email"
2. Unsubscribe and re-subscribe (triggers demo notifications)
3. Check server console: `[mailer] SMTP_HOST not set — printing email to console`  
   (or actual email if SMTP configured)
4. Verify email content contains notification title and message

- [ ] **Step 4: Verify channel=both — in-app + email**

1. Switch channel to "To account and email"
2. Trigger notification
3. Notification appears in list AND email logged to console

- [ ] **Step 5: Verify unauthenticated call is rejected**

```bash
curl -X POST http://localhost:3000/api/notifications/send-email \
  -H "Content-Type: application/json" \
  -d '{"title":"test","message":"test","type":"info"}'
```

Expected: `{"error":"unauthorized"}` with status 401
