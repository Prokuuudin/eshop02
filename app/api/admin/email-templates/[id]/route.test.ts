import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

vi.mock('@/lib/server-auth', () => ({ requireAdmin: vi.fn() }))
vi.mock('@/lib/email-templates-server-store', () => ({ upsertTemplate: vi.fn() }))

import { requireAdmin } from '@/lib/server-auth'
import { upsertTemplate } from '@/lib/email-templates-server-store'
import { PUT } from './route'

const context = { params: Promise.resolve({ id: 'order-confirmation' }) }
const actor = { id: 'admin', email: 'admin@example.test' }
const put = (body: unknown) => {
  const request = new NextRequest('https://shop.test/api/admin/email-templates/order-confirmation', {
    method: 'PUT', body: JSON.stringify(body),
  })
  return { request, response: PUT(request, context) }
}

describe('PUT /api/admin/email-templates/:id', () => {
  beforeEach(() => vi.clearAllMocks())

  it('enforces the admin gate', async () => {
    vi.mocked(requireAdmin).mockResolvedValue(NextResponse.json({ error: 'forbidden' }, { status: 403 }))
    expect((await put({ subject: 'x' }).response).status).toBe(403)
    expect(upsertTemplate).not.toHaveBeenCalled()
  })

  it('drops mass-assigned fields', async () => {
    vi.mocked(requireAdmin).mockResolvedValue(actor as never)
    vi.mocked(upsertTemplate).mockResolvedValue({ success: true, template: {} as never })
    const call = put({ subject: 'Safe', id: 'forged', updatedAt: 'forged', secret: 'leak' })
    const response = await call.response
    expect(response.status).toBe(200)
    expect(upsertTemplate).toHaveBeenCalledWith('order-confirmation', { subject: 'Safe' }, { actor, request: call.request })
  })

  it('rejects malformed variables', async () => {
    vi.mocked(requireAdmin).mockResolvedValue(actor as never)
    const response = await put({ variables: ['valid', 42] }).response
    expect(response.status).toBe(400)
    expect(upsertTemplate).not.toHaveBeenCalled()
  })
})
