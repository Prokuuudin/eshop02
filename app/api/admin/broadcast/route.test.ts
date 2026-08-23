import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

vi.mock('@/lib/server-auth', () => ({ requireAdmin: vi.fn() }))
vi.mock('@/lib/mailer', () => ({ sendEmail: vi.fn() }))
vi.mock('@/lib/site-url', () => ({ getSiteUrl: vi.fn(() => 'https://shop.test') }))
vi.mock('@/lib/newsletter-store', () => ({
  getMarketingOptedOutSet: vi.fn(),
  marketingUnsubUrl: vi.fn((email: string) => `https://shop.test/api/newsletter/unsubscribe?email=${encodeURIComponent(email)}&token=signed`),
}))
vi.mock('@/lib/admin/customer-segments', () => ({
  CUSTOMER_SEGMENTS: ['vip', 'regular', 'new', 'inactive'],
  getCustomerRecipients: vi.fn(),
}))

import { sendEmail } from '@/lib/mailer'
import { getMarketingOptedOutSet, marketingUnsubUrl } from '@/lib/newsletter-store'
import { requireAdmin } from '@/lib/server-auth'
import { POST } from './route'
import { getCustomerRecipients } from '@/lib/admin/customer-segments'

const request = (recipients: Array<{ email: string; firstName: string; lastName: string }>) => new NextRequest(
  'https://shop.test/api/admin/broadcast',
  {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ recipients, subject: 'Hello {first_name}', body: 'Private message for {first_name} {last_name}' }),
  },
)

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(requireAdmin).mockResolvedValue({ id: 'admin' } as never)
  vi.mocked(getMarketingOptedOutSet).mockResolvedValue(new Set())
  vi.mocked(sendEmail).mockResolvedValue(undefined)
  vi.mocked(getCustomerRecipients).mockResolvedValue([])
})

describe('POST /api/admin/broadcast email lifecycle', () => {
  it('requires admin authorization before delivery', async () => {
    vi.mocked(requireAdmin).mockResolvedValue(NextResponse.json({ error: 'forbidden' }, { status: 403 }))
    const res = await POST(request([{ email: 'a@test.com', firstName: 'A', lastName: 'One' }]))
    expect(res.status).toBe(403)
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('personalizes each delivery without leaking another recipient and includes signed unsubscribe metadata', async () => {
    await POST(request([
      { email: 'anna@test.com', firstName: 'Anna', lastName: 'One' },
      { email: 'boris@test.com', firstName: 'Boris', lastName: 'Two' },
    ]))

    expect(sendEmail).toHaveBeenCalledTimes(2)
    const anna = vi.mocked(sendEmail).mock.calls.find(([to]) => to === 'anna@test.com')!
    expect(anna[1]).toBe('Hello Anna')
    expect(anna[2]).toContain('Private message for Anna One')
    expect(anna[2]).not.toContain('Boris')
    expect(anna[2]).not.toContain('boris@test.com')
    expect(anna[2]).toContain('token=signed')
    expect(anna[3]).toEqual({ listUnsubscribeUrl: expect.stringContaining('token=signed') })
    expect(marketingUnsubUrl).toHaveBeenCalledWith('anna@test.com', 'https://shop.test')
  })

  it('honours opt-out and reports partial SMTP failures without retrying other recipients twice', async () => {
    vi.mocked(getMarketingOptedOutSet).mockResolvedValue(new Set(['opted@test.com']))
    vi.mocked(sendEmail).mockRejectedValueOnce(new Error('smtp down')).mockResolvedValueOnce(undefined)

    const res = await POST(request([
      { email: 'opted@test.com', firstName: 'Opted', lastName: 'Out' },
      { email: 'fail@test.com', firstName: 'Fail', lastName: 'One' },
      { email: 'ok@test.com', firstName: 'Ok', lastName: 'Two' },
    ]))

    expect(await res.json()).toEqual({ ok: true, sent: 1, failed: 1, skipped: 1, failedEmails: ['fail@test.com'] })
    expect(sendEmail).toHaveBeenCalledTimes(2)
    expect(sendEmail).not.toHaveBeenCalledWith('opted@test.com', expect.anything(), expect.anything(), expect.anything())
  })

  it('resolves a segment audience on the server instead of trusting browser-supplied recipients', async () => {
    vi.mocked(getCustomerRecipients).mockResolvedValue([{ email: 'vip@test.com', firstName: 'V', lastName: 'IP' }])
    const res = await POST(new NextRequest('https://shop.test/api/admin/broadcast', { method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ audience: { segment: 'vip' }, recipients: [{ email: 'attacker@test.com', firstName: '', lastName: '' }], subject: 'Hi', body: 'Text' }),
    }))
    expect(res.status).toBe(200)
    expect(getCustomerRecipients).toHaveBeenCalledWith('vip', 501)
    expect(sendEmail).toHaveBeenCalledWith('vip@test.com', expect.anything(), expect.anything(), expect.anything())
    expect(sendEmail).not.toHaveBeenCalledWith('attacker@test.com', expect.anything(), expect.anything(), expect.anything())
  })
})
