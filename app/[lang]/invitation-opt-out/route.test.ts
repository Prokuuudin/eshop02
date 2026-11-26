import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const h = vi.hoisted(() => ({
  rows: new Map<string, unknown>(),
  users: new Set(['user-1', 'user-2']),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => h.users.has(where.id) ? { id: where.id } : null),
    },
    keyValueSetting: {
      findUnique: vi.fn(async ({ where }: { where: { key: string } }) => h.rows.has(where.key) ? { key: where.key, value: h.rows.get(where.key) } : null),
      upsert: vi.fn(async ({ where, create }: { where: { key: string }; create: { key: string; value: unknown } }) => {
        if (!h.rows.has(where.key)) h.rows.set(create.key, create.value)
        return { key: where.key }
      }),
    },
  },
}))

import { GET, POST } from './route'
import { invitationOptOutToken } from '@/lib/invitation-suppression'

const context = { params: Promise.resolve({ lang: 'ru' }) }

beforeEach(() => {
  h.rows.clear()
  vi.stubEnv('NEWSLETTER_UNSUB_SECRET', 'test-invitation-opt-out-secret')
})

describe('public invitation opt-out confirmation', () => {
  it('GET validates and renders confirmation without changing data', async () => {
    const token = invitationOptOutToken('user-1')
    const response = await GET(new NextRequest(`https://shop.test/ru/invitation-opt-out?userId=user-1&token=${token}`), context)

    expect(response.status).toBe(200)
    expect(await response.text()).toContain('Не приглашать повторно')
    expect(h.rows.size).toBe(0)
  })

  it('POST records the preference and repeated confirmation is idempotent', async () => {
    const token = invitationOptOutToken('user-1')
    const request = () => new NextRequest('https://shop.test/ru/invitation-opt-out', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ userId: 'user-1', token }),
    })

    const first = await POST(request(), context)
    const second = await POST(request(), context)

    expect(first.status).toBe(200)
    expect(await first.text()).toContain('Отказ сохранён')
    expect(second.status).toBe(200)
    expect(h.rows.size).toBe(1)
    expect(h.rows.has('invitation:optout:user:user-1')).toBe(true)
  })

  it('a token for one client cannot change another client', async () => {
    const response = await POST(new NextRequest('https://shop.test/ru/invitation-opt-out', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ userId: 'user-2', token: invitationOptOutToken('user-1') }),
    }), context)

    expect(response.status).toBe(400)
    expect(h.rows.size).toBe(0)
  })
})
