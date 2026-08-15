import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

vi.mock('@/lib/server-auth', () => ({ requireAdmin: vi.fn() }))
vi.mock('@/lib/mailer', () => ({ sendEmail: vi.fn() }))
vi.mock('@/lib/email-templates-server-store', () => ({ getTemplates: vi.fn() }))

import { getTemplates } from '@/lib/email-templates-server-store'
import { sendEmail } from '@/lib/mailer'
import { requireAdmin } from '@/lib/server-auth'
import { POST } from './route'

const invoke = (to = 'admin@test.com') => POST(
  new NextRequest('https://shop.test/api/admin/email-templates/password-reset-en/send-test', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ to }),
  }),
  { params: Promise.resolve({ id: 'password-reset-en' }) },
)

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(requireAdmin).mockResolvedValue({ id: 'admin' } as never)
  vi.mocked(sendEmail).mockResolvedValue(undefined)
  vi.mocked(getTemplates).mockResolvedValue([{
    id: 'password-reset-en',
    name: 'Reset EN',
    subject: 'Reset {{order_id}}',
    body: '<a href="{{reset_link}}">Reset</a><p>{{email}}</p>',
    variables: ['order_id', 'reset_link', 'email'],
  }] as never)
})

describe('POST /api/admin/email-templates/:id/send-test', () => {
  it('requires admin authorization and validates the destination', async () => {
    vi.mocked(requireAdmin).mockResolvedValue(NextResponse.json({ error: 'forbidden' }, { status: 403 }))
    expect((await invoke()).status).toBe(403)
    expect(sendEmail).not.toHaveBeenCalled()

    vi.mocked(requireAdmin).mockResolvedValue({ id: 'admin' } as never)
    expect((await invoke('not-an-email')).status).toBe(400)
  })

  it('renders every declared placeholder and only sends sample personal data to the requested admin', async () => {
    const res = await invoke()
    expect(res.status).toBe(200)
    expect(sendEmail).toHaveBeenCalledOnce()
    const [to, subject, html] = vi.mocked(sendEmail).mock.calls[0]
    expect(to).toBe('admin@test.com')
    expect(subject).toContain('ORD-2025-001')
    expect(html).not.toMatch(/\{\{\w+\}\}/)
    expect(html).toContain('ivan@example.com')
    expect(html).toContain('href="#"')
  })

  it('does not deliver unknown templates or hide SMTP failure', async () => {
    vi.mocked(getTemplates).mockResolvedValue([])
    expect((await invoke()).status).toBe(404)
    expect(sendEmail).not.toHaveBeenCalled()

    vi.mocked(getTemplates).mockResolvedValue([{
      id: 'password-reset-en', name: 'Reset', subject: 'S', body: 'B', variables: [],
    }] as never)
    vi.mocked(sendEmail).mockRejectedValue(new Error('smtp down'))
    expect((await invoke()).status).toBe(500)
  })
})
