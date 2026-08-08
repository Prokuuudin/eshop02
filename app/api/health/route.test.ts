import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({ prisma: { $queryRaw: vi.fn() } }))
vi.mock('@/lib/observability', () => ({ logOperationalEvent: vi.fn() }))

import { prisma } from '@/lib/prisma'
import { logOperationalEvent } from '@/lib/observability'
import { GET } from './route'

beforeEach(() => vi.clearAllMocks())

describe('GET /api/health', () => {
  it('returns DB latency when healthy', async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ '?column?': 1 }])
    const response = await GET()
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ status: 'ok', db: 'ok' })
  })

  it('returns 503, emits an alert and hides the DB error', async () => {
    vi.mocked(prisma.$queryRaw).mockRejectedValue(new Error('password leaked'))
    const response = await GET()
    const body = await response.json()
    expect(response.status).toBe(503)
    expect(body).toMatchObject({ status: 'degraded', db: 'error' })
    expect(JSON.stringify(body)).not.toContain('password leaked')
    expect(logOperationalEvent).toHaveBeenCalledWith(expect.objectContaining({ event: 'health_db_failed', alert: true }), expect.any(Error))
  })
})
