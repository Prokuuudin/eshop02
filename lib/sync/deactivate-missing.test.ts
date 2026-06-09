import { deactivateMissing } from './deactivate-missing'
import type { PrismaClient } from '@/generated/prisma/client'

function makeMockDb(rowCount: number): PrismaClient {
  return {
    $executeRawUnsafe: vi.fn().mockResolvedValue(rowCount),
  } as unknown as PrismaClient
}

describe('deactivateMissing', () => {
  it('returns the number of rows affected', async () => {
    const count = await deactivateMissing(makeMockDb(7), 'run-1')
    expect(count).toBe(7)
  })

  it('passes runId as a query parameter', async () => {
    const db = makeMockDb(0)
    await deactivateMissing(db, 'run-abc')
    const args = (db.$executeRawUnsafe as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(args).toContain('run-abc')
  })

  it('SQL targets only products with externalId (skips manual products)', async () => {
    const db = makeMockDb(0)
    await deactivateMissing(db, 'run-1')
    const sql = (db.$executeRawUnsafe as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(sql).toContain('"externalId" IS NOT NULL')
  })

  it('SQL deactivates products whose lastSyncRunId does not match', async () => {
    const db = makeMockDb(0)
    await deactivateMissing(db, 'run-1')
    const sql = (db.$executeRawUnsafe as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(sql).toContain('"lastSyncRunId"')
    expect(sql).toContain('$1')
  })
})
