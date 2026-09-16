import { describe, expect, it, vi } from 'vitest'
vi.mock('@/lib/mailer', () => ({ sendEmail: vi.fn() }))
import { sendEmail } from '@/lib/mailer'
import { POST } from './route'

describe('retired invoice-code endpoint', () => {
  it('cannot generate or send an invoice without admin approval', async () => {
    const response = await POST()
    expect(response.status).toBe(410)
    expect(sendEmail).not.toHaveBeenCalled()
  })
})
