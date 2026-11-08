import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import {
  hasOpenAdminOrderNotificationWork,
  OPEN_ADMIN_ORDER_NOTIFICATION_WORK_SQL,
} from '@/lib/order-admin-notification-outbox-probe'
import { ADMIN_ORDER_NOTIFICATION_MAX_ATTEMPTS } from '@/lib/order-admin-notification-worker'
import { ADMIN_ORDER_NOTIFICATION_TYPE } from '@/lib/order-admin-notification-outbox'

const NEON = 'postgresql://u:p@ep-x-pooler.c-2.eu-central-1.aws.neon.tech/db?sslmode=require'

vi.mock('@/lib/prisma', () => ({ prisma: {} }))

describe('hasOpenAdminOrderNotificationWork', () => {
  it('asks for open work with the same type and attempt bound as the claim', async () => {
    const query = vi.fn().mockResolvedValue([{ open: false }])
    await expect(hasOpenAdminOrderNotificationWork({ DATABASE_URL: NEON }, query)).resolves.toBe(false)
    expect(query).toHaveBeenCalledWith(NEON, OPEN_ADMIN_ORDER_NOTIFICATION_WORK_SQL, [
      ADMIN_ORDER_NOTIFICATION_TYPE,
      ADMIN_ORDER_NOTIFICATION_MAX_ATTEMPTS,
    ])
  })

  it('reports open work', async () => {
    const query = vi.fn().mockResolvedValue([{ open: true }])
    await expect(hasOpenAdminOrderNotificationWork({ DATABASE_URL: NEON }, query)).resolves.toBe(true)
  })

  it.each([
    ['no database URL', {}],
    ['a local database', { DATABASE_URL: 'postgresql://u:p@localhost:5432/db' }],
    ['a non-Neon host', { DATABASE_URL: 'postgresql://u:p@db.example.com/db' }],
    ['a malformed URL', { DATABASE_URL: 'not a url' }],
  ])('is unknown (full run) for %s', async (_label, env) => {
    const query = vi.fn()
    await expect(hasOpenAdminOrderNotificationWork(env, query)).resolves.toBeNull()
    expect(query).not.toHaveBeenCalled()
  })

  it.each([
    ['a query error', () => Promise.reject(new Error('fetch failed'))],
    ['no rows', () => Promise.resolve([])],
    ['a non-boolean value', () => Promise.resolve([{ open: 't' }])],
  ])('is unknown (full run) on %s', async (_label, impl) => {
    await expect(hasOpenAdminOrderNotificationWork({ DATABASE_URL: NEON }, vi.fn(impl))).resolves.toBeNull()
  })

  it('compares no timestamps, so it is never narrower than the time-bounded claim', () => {
    expect(OPEN_ADMIN_ORDER_NOTIFICATION_WORK_SQL).not.toMatch(/nextAttemptAt|lockedAt|now\(\)/)
    expect(OPEN_ADMIN_ORDER_NOTIFICATION_WORK_SQL).toMatch(/"status" = 'pending' AND "attempts" < \$2/)
    expect(OPEN_ADMIN_ORDER_NOTIFICATION_WORK_SQL).toMatch(/"status" = 'processing' AND "attempts" <= \$2/)
  })
})
