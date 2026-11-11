import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const permissionMock = vi.hoisted(() => vi.fn())
const createMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/server-auth', () => ({ requireAdminPermission: permissionMock }))
vi.mock('@/lib/media-asset-store', () => ({ createMediaAsset: createMock }))
import { POST } from './route'

const actor = { id: 'a1', email: 'admin@example.test', platformRole: 'admin' }

function request(file: File): NextRequest {
  const form = new FormData(); form.set('file', file)
  return new NextRequest('http://localhost/api/admin/notifications/assets', { method: 'POST', body: form })
}

describe('POST /api/admin/notifications/assets', () => {
  beforeEach(() => { vi.clearAllMocks(); permissionMock.mockResolvedValue(actor); createMock.mockResolvedValue(undefined) })

  it('rejects upload without marketing permission before storing a file', async () => {
    permissionMock.mockResolvedValue(NextResponse.json({ error: 'forbidden' }, { status: 403 }))
    const file = new File(['not-an-image'], 'x.txt', { type: 'text/plain' })

    expect((await POST(request(file))).status).toBe(403)
    expect(createMock).not.toHaveBeenCalled()
  })

  it('accepts a verified image', async () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    const upload = request(new File([bytes], 'new-year.png', { type: 'image/png' }))
    const response = await POST(upload)
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ name: 'new-year.png', mimeType: 'image/png' })
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({ mimeType: 'image/png', size: bytes.length, bytes }),
      { actor, request: upload },
    )
  })

  it('accepts PDF as an attachment', async () => {
    const pdf = new File(['%PDF-1.7\n'], 'offer.pdf', { type: 'application/pdf' })
    expect((await POST(request(pdf))).status).toBe(200)
  })

  it('rejects active or unsupported content', async () => {
    const response = await POST(request(new File(['<script>x</script>'], 'x.png', { type: 'image/png' })))
    expect(response.status).toBe(400)
    expect(createMock).not.toHaveBeenCalled()
  })

  it('keeps separate-upload behavior for two identical images', async () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

    expect((await POST(request(new File([bytes], 'same.png', { type: 'image/png' })))).status).toBe(200)
    expect((await POST(request(new File([bytes], 'same.png', { type: 'image/png' })))).status).toBe(200)

    expect(createMock).toHaveBeenCalledTimes(2)
    const names = createMock.mock.calls.map((call) => call[0].name)
    expect(new Set(names).size).toBe(2)
  })
})
