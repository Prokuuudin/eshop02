import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

// Route contract only (auth, origin, validation, audit content, error mapping). The merge and the
// undo themselves run on real PostgreSQL in tests/integration/account-merge-postgres.integration.test.ts.
const { requireAdminMock, auditMock, transactionMock, mergeMock, previewMock, restoreMock } = vi.hoisted(() => ({
  requireAdminMock: vi.fn(),
  auditMock: vi.fn(),
  transactionMock: vi.fn(),
  mergeMock: vi.fn(),
  previewMock: vi.fn(),
  restoreMock: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/server-auth', () => ({ requireAdmin: requireAdminMock }))
vi.mock('@/lib/server-audit', () => ({ appendServerAudit: auditMock }))
vi.mock('@/lib/prisma', () => ({ prisma: { $transaction: transactionMock } }))
vi.mock('@/lib/admin-account-merge', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/admin-account-merge')>()),
  executeAccountMerge: mergeMock,
  buildMergePreview: previewMock,
}))
vi.mock('@/lib/admin-account-merge-restore', () => ({ restoreAccountMerge: restoreMock }))

import { DELETE, GET, POST } from './route'
import { AccountMergeError } from '@/lib/admin-account-merge'

const ADMIN = { id: 'admin-1', email: 'admin@example.test', platformRole: 'admin', superAdmin: false }
const TX = { tx: true }

const get = (query: string) => GET(new NextRequest(`https://shop.test/api/admin/users/merge${query}`))
const send = (method: 'POST' | 'DELETE', body: unknown, origin = 'https://shop.test') =>
  (method === 'POST' ? POST : DELETE)(new NextRequest('https://shop.test/api/admin/users/merge', {
    method, body: JSON.stringify(body), headers: { origin },
  }))
const mergeBody = (fields: Record<string, unknown> = {}) => ({
  sourceId: 'legacy-1',
  targetId: 'card-1',
  sourceUpdatedAt: '2024-05-01T09:00:00.000Z',
  targetUpdatedAt: '2026-09-01T12:00:00.000Z',
  reasonCode: 'phone_match',
  confirmed: true,
  ...fields,
})
const MERGED = {
  alreadyMerged: false, targetId: 'card-1', email: 'anna@example.com', moved: { 'Order.userId': 1 }, dropped: {},
  profileCopied: ['name'], previousTargetEmail: 'card.4242@client.local', suppressionCarried: false,
  recoveryKey: 'account-merge:v1:legacy-1',
}

beforeEach(() => {
  vi.clearAllMocks()
  requireAdminMock.mockResolvedValue(ADMIN)
  transactionMock.mockImplementation(async (run: (tx: unknown) => Promise<unknown>) => run(TX))
  mergeMock.mockResolvedValue(MERGED)
})

describe('GET /api/admin/users/merge (preview)', () => {
  it('is admin-only and needs both ids', async () => {
    requireAdminMock.mockResolvedValueOnce(NextResponse.json({ error: 'forbidden' }, { status: 403 }))
    expect((await get('?sourceId=a&targetId=b')).status).toBe(403)
    expect((await get('?sourceId=a')).status).toBe(400)
    expect(previewMock).not.toHaveBeenCalled()
  })

  it('returns the preview outside any transaction', async () => {
    previewMock.mockResolvedValue({ blockers: [] })
    const response = await get('?sourceId=legacy-1&targetId=card-1')
    expect(await response.json()).toEqual({ preview: { blockers: [] } })
    expect(transactionMock).not.toHaveBeenCalled()
  })
})

describe('POST /api/admin/users/merge', () => {
  it('rejects a foreign origin and a non-admin before anything else', async () => {
    expect((await send('POST', mergeBody(), 'https://evil.test')).status).toBe(403)
    expect(requireAdminMock).not.toHaveBeenCalled()
    requireAdminMock.mockResolvedValueOnce(NextResponse.json({ error: 'forbidden' }, { status: 403 }))
    expect((await send('POST', mergeBody())).status).toBe(403)
    expect(transactionMock).not.toHaveBeenCalled()
  })

  it.each([
    ['without the confirmation', { confirmed: undefined }],
    ['with confirmed=false', { confirmed: false }],
    ['without a reason code', { reasonCode: undefined }],
    ['with an unknown reason code', { reasonCode: 'because' }],
    ['with a free-text reason field', { reason: 'same person' }],
    ['with unknown fields', { force: true }],
  ])('refuses a request %s', async (_label, fields) => {
    expect((await send('POST', mergeBody(fields))).status).toBe(400)
    expect(transactionMock).not.toHaveBeenCalled()
  })

  it.each([
    ['personal data in the note', { note: 'mail someone@example.com' }, 'personal_data'],
    ['a missing note for «other»', { reasonCode: 'other' }, 'required'],
    ['a long note', { note: 'x'.repeat(201) }, 'too_long'],
  ])('refuses %s', async (_label, fields, problem) => {
    const response = await send('POST', mergeBody(fields))
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'invalid_note', problem })
    expect(transactionMock).not.toHaveBeenCalled()
  })

  it('merges in one READ COMMITTED transaction (explicit locks) and audits ids, counts and the reason code only', async () => {
    const response = await send('POST', mergeBody({ note: '  confirmed at the counter ' }))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      alreadyMerged: false, targetId: 'card-1', email: 'anna@example.com', sourceId: 'legacy-1',
      moved: { 'Order.userId': 1 }, dropped: {}, profileCopied: ['name'],
    })
    expect(transactionMock).toHaveBeenCalledWith(expect.any(Function), expect.objectContaining({ isolationLevel: 'ReadCommitted' }))
    expect(mergeMock).toHaveBeenCalledWith(TX, expect.objectContaining({
      sourceId: 'legacy-1', targetId: 'card-1', reasonCode: 'phone_match', note: 'confirmed at the counter',
      actor: { id: 'admin-1', email: 'admin@example.test' },
    }))
    const [tx, , actor, entry] = auditMock.mock.calls[0]
    expect(tx).toBe(TX)
    expect(actor).toBe(ADMIN)
    expect(entry).toEqual({
      action: 'user.accounts_merged', entityType: 'user', entityId: 'card-1',
      before: { sourceId: 'legacy-1' },
      after: { moved: { 'Order.userId': 1 }, dropped: {}, profileCopied: ['name'], suppressionCarried: false },
      details: 'recoveryRecord=account-merge:v1:legacy-1',
      reason: 'phone_match: confirmed at the counter',
    })
    // No email addresses (old or new) and no secrets in the audit row.
    expect(JSON.stringify(entry)).not.toMatch(/@|passwordHash|pkLast3|mfa|token/iu)
  })

  it('answers a repeated request without a second audit row', async () => {
    mergeMock.mockResolvedValueOnce({ alreadyMerged: true, targetId: 'card-1' })
    const response = await send('POST', mergeBody())
    expect(await response.json()).toEqual({ alreadyMerged: true, targetId: 'card-1' })
    expect(auditMock).not.toHaveBeenCalled()
  })

  it.each([
    ['blockers', new AccountMergeError('blocked', 409, ['source_activated']), 409, { error: 'blocked', blockers: ['source_activated'] }],
    ['a stale preview', new AccountMergeError('optimistic_conflict', 409), 409, { error: 'optimistic_conflict' }],
    ['a serialization failure', Object.assign(new Error('could not serialize'), { code: 'P2034' }), 409, { error: 'concurrent_update' }],
    ['a lock timeout', new Error('canceling statement due to lock timeout (55P03)'), 409, { error: 'concurrent_update' }],
    ['a concurrent unique write', Object.assign(new Error('unique'), { code: 'P2002' }), 409, { error: 'concurrent_update' }],
  ])('maps %s', async (_label, error, status, body) => {
    mergeMock.mockRejectedValueOnce(error)
    const response = await send('POST', mergeBody())
    expect(response.status).toBe(status)
    expect(await response.json()).toEqual(body)
    expect(auditMock).not.toHaveBeenCalled()
  })
})

describe('DELETE /api/admin/users/merge (undo)', () => {
  it('needs origin, admin, confirmation and a reason code', async () => {
    expect((await send('DELETE', { sourceId: 'legacy-1', reasonCode: 'other', note: 'wrong person', confirmed: true }, 'https://evil.test')).status).toBe(403)
    expect((await send('DELETE', { sourceId: 'legacy-1', reasonCode: 'other', note: 'wrong person' })).status).toBe(400)
    expect((await send('DELETE', { sourceId: 'legacy-1', confirmed: true })).status).toBe(400)
    expect(restoreMock).not.toHaveBeenCalled()
  })

  it('restores in one transaction and audits it', async () => {
    restoreMock.mockResolvedValue({
      sourceId: 'legacy-1', targetId: 'card-1', restoredEmail: 'anna@example.com',
      movedBack: { 'Order.userId': 1 }, reinserted: {}, suppressionRemoved: false,
    })
    const response = await send('DELETE', { sourceId: 'legacy-1', reasonCode: 'other', note: 'merged the wrong person', confirmed: true })
    expect(await response.json()).toEqual({ restored: true, sourceId: 'legacy-1', targetId: 'card-1' })
    expect(restoreMock).toHaveBeenCalledWith(TX, 'legacy-1')
    expect(auditMock.mock.calls[0][3]).toEqual({
      action: 'user.accounts_merge_restored', entityType: 'user', entityId: 'legacy-1',
      before: { targetId: 'card-1' },
      after: { movedBack: { 'Order.userId': 1 }, reinserted: {}, suppressionRemoved: false },
      reason: 'other: merged the wrong person',
    })
  })

  it('reports a target changed since the merge', async () => {
    restoreMock.mockRejectedValueOnce(new AccountMergeError('target_changed', 409))
    const response = await send('DELETE', { sourceId: 'legacy-1', reasonCode: 'customer_confirmed', confirmed: true })
    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'target_changed' })
    expect(auditMock).not.toHaveBeenCalled()
  })
})
