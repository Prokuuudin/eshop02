import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    accessRequest: { findFirst: vi.fn(), create: vi.fn() },
    keyValueSetting: { upsert: vi.fn() },
    $transaction: vi.fn(),
  },
}))
vi.mock('@/lib/server-auth', () => ({
  hashPassword: vi.fn(),
}))

import { prisma } from '@/lib/prisma'
import { hashPassword } from '@/lib/server-auth'
import { POST } from './route'

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/access-requests', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(hashPassword as any).mockResolvedValue('hashed')
  vi.mocked(prisma.accessRequest.findFirst as any).mockResolvedValue(null)
  vi.mocked(prisma.accessRequest.create as any).mockImplementation(async ({ data }: any) => ({ ...data }))
  vi.mocked(prisma.$transaction as any).mockImplementation(async (fn: any) => fn(prisma))
})

describe('POST /api/access-requests', () => {
  it('no-card заявка мастера принимается без company-полей и карты', async () => {
    const res = await POST(
      makeRequest({
        email: 'Master@inbox.lv',
        password: 'Welcome1!',
        name: 'Māra',
        requestType: 'no-card',
        certificateName: 'diploms.jpg',
        language: 'lv',
      })
    )

    expect(res.status).toBe(201)
    const createArgs = vi.mocked(prisma.accessRequest.create).mock.calls[0][0] as any
    expect(createArgs.data.email).toBe('master@inbox.lv')
    expect(createArgs.data.requestType).toBe('no-card')
    expect(createArgs.data.cardNumber).toBe('')
  })

  it('сертификат из заявки сохраняется в KV на время рассмотрения', async () => {
    const dataUrl = 'data:image/jpeg;base64,' + Buffer.from('img').toString('base64')
    const res = await POST(
      makeRequest({
        email: 'master@inbox.lv',
        password: 'x',
        requestType: 'no-card',
        certificateName: 'diploms.jpg',
        certificateData: dataUrl,
      })
    )

    expect(res.status).toBe(201)
    const upsertArgs = vi.mocked(prisma.keyValueSetting.upsert).mock.calls[0][0] as any
    expect(upsertArgs.where.key).toMatch(/^access-request-cert-/)
    expect(upsertArgs.create.value.data).toBe(dataUrl)
    expect(upsertArgs.create.value.name).toBe('diploms.jpg')
  })

  it('слишком большой сертификат → 413, заявка не создаётся', async () => {
    const res = await POST(
      makeRequest({
        email: 'master@inbox.lv',
        password: 'x',
        requestType: 'no-card',
        certificateData: 'data:image/jpeg;base64,' + 'A'.repeat(2_500_000),
      })
    )

    expect(res.status).toBe(413)
    expect(vi.mocked(prisma.accessRequest.create)).not.toHaveBeenCalled()
  })

  it('битый certificateData (не data URL) → 400', async () => {
    const res = await POST(
      makeRequest({
        email: 'master@inbox.lv',
        password: 'x',
        requestType: 'no-card',
        certificateData: 'javascript:alert(1)',
      })
    )

    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('invalid_certificate')
  })

  it('card-заявка без номера карты по-прежнему отвергается', async () => {
    const res = await POST(
      makeRequest({
        email: 'member@inbox.lv',
        password: 'x',
        companyId: 'c1',
        companyName: 'Salons',
        requestType: 'card',
      })
    )

    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('missing_fields')
  })
})
