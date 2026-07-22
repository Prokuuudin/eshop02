import { vi, describe, it, expect } from 'vitest'
import { acquireSyncLock, releaseSyncLock } from './sync-lock'
import type { ExtendedPrismaClient } from '@/lib/prisma'

function makeMockDb(queryRawResult: unknown[]) {
  return {
    $queryRawUnsafe: vi.fn().mockResolvedValue(queryRawResult),
    $executeRawUnsafe: vi.fn().mockResolvedValue(1),
  } as unknown as ExtendedPrismaClient
}

describe('acquireSyncLock', () => {
  it('returns true when the CAS insert/update returns a row', async () => {
    const db = makeMockDb([{ key: 'sync-run-lock' }])
    const acquired = await acquireSyncLock(db, 'run-1', 30 * 60 * 1000)
    expect(acquired).toBe(true)
  })

  it('returns false when the CAS statement matches no row (lock held and not stale)', async () => {
    const db = makeMockDb([])
    const acquired = await acquireSyncLock(db, 'run-1', 30 * 60 * 1000)
    expect(acquired).toBe(false)
  })

  it('passes the runId and a future lockedUntil to the CAS statement', async () => {
    const db = makeMockDb([{ key: 'sync-run-lock' }])
    await acquireSyncLock(db, 'run-42', 1000)
    const call = (db.$queryRawUnsafe as ReturnType<typeof vi.fn>).mock.calls[0]
    const valueArg = JSON.parse(call[2] as string)
    expect(valueArg.runId).toBe('run-42')
    expect(new Date(valueArg.lockedUntil).getTime()).toBeGreaterThan(Date.now())
  })
})

describe('releaseSyncLock', () => {
  it('issues an UPDATE scoped to the given runId', async () => {
    const db = makeMockDb([])
    await releaseSyncLock(db, 'run-1')
    expect(db.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE "KeyValueSetting"'),
      expect.any(String),
      'sync-run-lock',
      'run-1',
    )
  })
})
