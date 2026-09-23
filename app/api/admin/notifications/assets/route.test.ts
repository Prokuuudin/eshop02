import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const permissionMock = vi.hoisted(() => vi.fn())
const createMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/server-auth', () => ({ requireAdminPermission: permissionMock }))
vi.mock('@/lib/prisma', () => ({ prisma: { mediaAsset: { create: createMock } } }))
import { POST } from './route'

function request(file: File, kind: string): NextRequest {
  const form = new FormData(); form.set('file', file); form.set('kind', kind)
  return new NextRequest('http://localhost/api/admin/notifications/assets', { method: 'POST', body: form })
}

describe('POST /api/admin/notifications/assets', () => {
  beforeEach(() => { vi.clearAllMocks(); permissionMock.mockResolvedValue({ id: 'a1', platformRole: 'admin' }) })

  it('accepts a verified image', async () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    const response = await POST(request(new File([bytes], 'new-year.png', { type: 'image/png' }), 'image'))
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ name: 'new-year.png', mimeType: 'image/png' })
  })

  it('accepts PDF as an attachment but not as a greeting image', async () => {
    const pdf = new File(['%PDF-1.7\n'], 'offer.pdf', { type: 'application/pdf' })
    expect((await POST(request(pdf, 'attachment'))).status).toBe(200)
    expect((await POST(request(pdf, 'image'))).status).toBe(400)
  })

  it('rejects active or unsupported content', async () => {
    const response = await POST(request(new File(['<script>x</script>'], 'x.png', { type: 'image/png' }), 'image'))
    expect(response.status).toBe(400)
    expect(createMock).not.toHaveBeenCalled()
  })
})
