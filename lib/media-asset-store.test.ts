import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { NextRequest } from 'next/server'
import { Prisma } from '@/generated/prisma/client'

// Stateful harness: each $transaction mutates a staged copy that is published
// only when the callback resolves. Transactions run one at a time, which is
// what the SELECT … FOR UPDATE row lock guarantees for the same asset.

type Asset = { mimeType: string; size: number; data: Uint8Array; updatedAt: number }
type State = { assets: Record<string, Asset>; audits: Array<{ actorId: string; input: Record<string, unknown> }>; clock: number }

const h = vi.hoisted(() => ({
  state: null as unknown as State,
  queue: Promise.resolve() as Promise<unknown>,
  appendServerAudit: vi.fn(),
  rawQueries: [] as string[],
}))

const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

function makeTx(s: State) {
  return {
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      h.rawQueries.push(strings.join('?'))
      const names = values[0] as string[]
      return names.filter((name) => s.assets[name]).sort().map((name) => ({
        name, mimeType: s.assets[name].mimeType, size: s.assets[name].size, sha256: sha(s.assets[name].data),
      }))
    },
    mediaAsset: {
      create: async ({ data }: { data: { name: string; mimeType: string; size: number; data: Uint8Array } }) => {
        if (s.assets[data.name]) {
          throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' })
        }
        s.assets[data.name] = { mimeType: data.mimeType, size: data.size, data: data.data, updatedAt: ++s.clock }
      },
      update: async ({ where, data }: { where: { name: string }; data: { mimeType: string; size: number; data: Uint8Array } }) => {
        Object.assign(s.assets[where.name], data, { updatedAt: ++s.clock })
      },
      deleteMany: async ({ where }: { where: { name: { in: string[] } } }) => {
        let count = 0
        for (const name of where.name.in) if (s.assets[name]) { delete s.assets[name]; count += 1 }
        return { count }
      },
    },
    auditLog: {
      create: async (row: { actorId: string; input: Record<string, unknown> }) => { s.audits.push(row) },
    },
  }
}

vi.mock('server-only', () => ({}))
vi.mock('@/lib/server-audit', () => ({ appendServerAudit: h.appendServerAudit }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    $transaction: async (run: (tx: ReturnType<typeof makeTx>) => Promise<unknown>) => {
      const previous = h.queue
      let release = (): void => undefined
      h.queue = new Promise<void>((resolve) => { release = resolve })
      await previous
      try {
        const staged = structuredClone(h.state)
        const result = await run(makeTx(staged))
        h.state = staged
        return result
      } finally {
        release()
      }
    },
  },
}))

import { createMediaAsset, deleteMediaAssets, replaceMediaAsset } from './media-asset-store'

const actor = { id: 'admin-1', email: 'admin@example.test' }
const request = new NextRequest('http://localhost/api/admin/media', { method: 'POST' })
const audit = { actor, request } as never
const OLD = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3])
const NEW = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 9, 9, 9, 9])
const OTHER = new Uint8Array([0xff, 0xd8, 0xff, 7, 7])

function seed(assets: Record<string, Uint8Array> = { 'logo.png': OLD }): void {
  h.state = {
    assets: Object.fromEntries(Object.entries(assets).map(([name, data]) => [name, { mimeType: 'image/png', size: data.length, data, updatedAt: 0 }])),
    audits: [],
    clock: 0,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  h.queue = Promise.resolve()
  h.rawQueries = []
  seed()
  h.appendServerAudit.mockImplementation(async (tx: ReturnType<typeof makeTx>, _req: NextRequest, sessionActor: { id: string }, input: Record<string, unknown>) => {
    await tx.auditLog.create({ actorId: sessionActor.id, input })
  })
})

describe('createMediaAsset', () => {
  it('stores the asset and audits name, path, type, size and hash in one transaction', async () => {
    await createMediaAsset({ name: '1-new.png', mimeType: 'image/png', size: NEW.length, bytes: NEW }, audit)

    expect(h.state.assets['1-new.png']).toMatchObject({ mimeType: 'image/png', size: NEW.length })
    expect(h.appendServerAudit).toHaveBeenCalledWith(expect.anything(), request, actor, {
      action: 'media.uploaded', entityType: 'media_asset', entityId: '1-new.png', entityTitle: '1-new.png',
      before: null,
      after: { path: '/api/media/1-new.png', mimeType: 'image/png', size: NEW.length, sha256: sha(NEW) },
    })
  })

  it('rolls the upload back when the audit append fails', async () => {
    h.appendServerAudit.mockRejectedValueOnce(new Error('audit unavailable'))
    const before = structuredClone(h.state)

    await expect(createMediaAsset({ name: '1-new.png', mimeType: 'image/png', size: NEW.length, bytes: NEW }, audit))
      .rejects.toThrow('audit unavailable')
    expect(h.state).toEqual(before)
  })

  it('rejects a name collision without a second audit row', async () => {
    await expect(createMediaAsset({ name: 'logo.png', mimeType: 'image/png', size: NEW.length, bytes: NEW }, audit))
      .rejects.toMatchObject({ code: 'P2002' })
    expect(h.state.assets['logo.png'].data).toEqual(OLD)
    expect(h.state.audits).toHaveLength(0)
  })
})

describe('replaceMediaAsset', () => {
  it('replaces bytes under the same name and audits before/after fingerprints', async () => {
    await expect(replaceMediaAsset('logo.png', { mimeType: 'image/png', size: NEW.length, bytes: NEW }, audit)).resolves.toBe('replaced')

    expect(h.state.assets['logo.png'].data).toEqual(NEW)
    expect(h.state.audits).toEqual([{ actorId: 'admin-1', input: {
      action: 'media.replaced', entityType: 'media_asset', entityId: 'logo.png', entityTitle: 'logo.png',
      before: { path: '/api/media/logo.png', mimeType: 'image/png', size: OLD.length, sha256: sha(OLD) },
      after: { path: '/api/media/logo.png', mimeType: 'image/png', size: NEW.length, sha256: sha(NEW) },
    } }])
    expect(h.rawQueries[0]).toMatch(/FOR UPDATE/u)
    expect(h.rawQueries[0]).toMatch(/sha256\(data\)/u)
  })

  it('treats identical bytes and type as a no-op: no write, no updatedAt bump, no event', async () => {
    await expect(replaceMediaAsset('logo.png', { mimeType: 'image/png', size: OLD.length, bytes: OLD }, audit)).resolves.toBe('unchanged')

    expect(h.state.assets['logo.png'].updatedAt).toBe(0)
    expect(h.appendServerAudit).not.toHaveBeenCalled()
  })

  it('records a type-only change of identical bytes', async () => {
    await expect(replaceMediaAsset('logo.png', { mimeType: 'image/webp', size: OLD.length, bytes: OLD }, audit)).resolves.toBe('replaced')
    expect(h.state.audits).toHaveLength(1)
  })

  it('returns not_found without an event for a missing asset', async () => {
    await expect(replaceMediaAsset('missing.png', { mimeType: 'image/png', size: NEW.length, bytes: NEW }, audit)).resolves.toBe('not_found')
    expect(h.appendServerAudit).not.toHaveBeenCalled()
  })

  it('restores the previous bytes when the audit append fails', async () => {
    h.appendServerAudit.mockRejectedValueOnce(new Error('audit unavailable'))
    const before = structuredClone(h.state)

    await expect(replaceMediaAsset('logo.png', { mimeType: 'image/png', size: NEW.length, bytes: NEW }, audit))
      .rejects.toThrow('audit unavailable')
    expect(h.state).toEqual(before)
  })

  it('serialises concurrent replaces of one file into a consistent before/after chain', async () => {
    const results = await Promise.all([
      replaceMediaAsset('logo.png', { mimeType: 'image/png', size: NEW.length, bytes: NEW }, audit),
      replaceMediaAsset('logo.png', { mimeType: 'image/jpeg', size: OTHER.length, bytes: OTHER }, audit),
    ])

    expect(results).toEqual(['replaced', 'replaced'])
    const [first, second] = h.state.audits.map((row) => row.input)
    expect(second.before).toEqual(first.after)
    expect(h.state.assets['logo.png'].data).toEqual(OTHER)
  })

  it('a concurrent duplicate replace with the same bytes is recorded once', async () => {
    const results = await Promise.all([
      replaceMediaAsset('logo.png', { mimeType: 'image/png', size: NEW.length, bytes: NEW }, audit),
      replaceMediaAsset('logo.png', { mimeType: 'image/png', size: NEW.length, bytes: NEW }, audit),
    ])

    expect(results.sort()).toEqual(['replaced', 'unchanged'])
    expect(h.state.audits).toHaveLength(1)
  })
})

describe('deleteMediaAssets', () => {
  beforeEach(() => seed({ 'a.png': OLD, 'b.png': NEW }))

  it('deletes existing assets and audits each with one shared request id', async () => {
    await expect(deleteMediaAssets(['b.png', 'a.png', 'missing.png'], audit)).resolves.toEqual(['a.png', 'b.png'])

    expect(h.state.assets).toEqual({})
    const inputs = h.state.audits.map((row) => row.input)
    expect(inputs).toEqual([
      expect.objectContaining({ action: 'media.deleted', entityId: 'a.png', after: null,
        before: { path: '/api/media/a.png', mimeType: 'image/png', size: OLD.length, sha256: sha(OLD) } }),
      expect.objectContaining({ action: 'media.deleted', entityId: 'b.png', after: null,
        before: { path: '/api/media/b.png', mimeType: 'image/png', size: NEW.length, sha256: sha(NEW) } }),
    ])
    expect(inputs[0].requestId).toEqual(expect.any(String))
    expect(inputs[1].requestId).toBe(inputs[0].requestId)
  })

  it('a repeated delete is a no-op without events', async () => {
    await deleteMediaAssets(['a.png'], audit)
    vi.clearAllMocks()

    await expect(deleteMediaAssets(['a.png'], audit)).resolves.toEqual([])
    expect(h.appendServerAudit).not.toHaveBeenCalled()
  })

  it('concurrent deletes of one file audit it exactly once', async () => {
    const results = await Promise.all([deleteMediaAssets(['a.png'], audit), deleteMediaAssets(['a.png', 'a.png'], audit)])

    expect(results.map((names) => names.length).sort()).toEqual([0, 1])
    expect(h.state.audits).toHaveLength(1)
  })

  it('keeps every asset when an audit append in the batch fails', async () => {
    h.appendServerAudit
      .mockImplementationOnce(async (tx: ReturnType<typeof makeTx>, _req: NextRequest, sessionActor: { id: string }, input: Record<string, unknown>) => {
        await tx.auditLog.create({ actorId: sessionActor.id, input })
      })
      .mockRejectedValueOnce(new Error('audit unavailable'))
    const before = structuredClone(h.state)

    await expect(deleteMediaAssets(['a.png', 'b.png'], audit)).rejects.toThrow('audit unavailable')
    expect(h.state).toEqual(before)
  })
})

describe('audit payloads', () => {
  it('never contain file bytes', async () => {
    const marker = new TextEncoder().encode('FILE-CONTENT-MARKER')
    const bytes = new Uint8Array([...NEW, ...marker])
    await createMediaAsset({ name: '2-x.png', mimeType: 'image/png', size: bytes.length, bytes }, audit)
    await replaceMediaAsset('2-x.png', { mimeType: 'image/png', size: OLD.length, bytes: OLD }, audit)
    await deleteMediaAssets(['2-x.png'], audit)

    const serialized = JSON.stringify(h.appendServerAudit.mock.calls.map((call) => call[3]))
    expect(h.appendServerAudit).toHaveBeenCalledTimes(3)
    expect(serialized).not.toContain('FILE-CONTENT-MARKER')
    expect(serialized).not.toContain(Buffer.from(bytes).toString('base64'))
    for (const call of h.appendServerAudit.mock.calls) {
      for (const side of [call[3].before, call[3].after]) {
        if (side) expect(Object.keys(side).sort()).toEqual(['mimeType', 'path', 'sha256', 'size'])
      }
    }
  })
})
