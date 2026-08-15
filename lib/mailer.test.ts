import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const sendMail = vi.fn()
vi.mock('nodemailer', () => ({ default: { createTransport: vi.fn(() => ({ sendMail })) } }))
vi.mock('@/lib/observability', () => ({ logOperationalEvent: vi.fn() }))

import nodemailer from 'nodemailer'
import { logOperationalEvent } from '@/lib/observability'
import { sendEmail } from './mailer'

describe('mailer degradation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('SMTP_HOST', 'smtp.test')
    vi.stubEnv('SMTP_FROM', 'shop@example.test')
  })

  afterEach(() => vi.unstubAllEnvs())

  it('fails closed when production SMTP is not configured', async () => {
    vi.stubEnv('SMTP_HOST', '')
    await expect(sendEmail('buyer@example.test', 'Subject', '<p>Body</p>'))
      .rejects.toThrow('SMTP_HOST is required in production')
    expect(sendMail).not.toHaveBeenCalled()
  })

  it('can disable STARTTLS for a local SMTP capture service', async () => {
    vi.stubEnv('SMTP_SECURE', 'false')
    vi.stubEnv('SMTP_IGNORE_TLS', 'true')
    sendMail.mockResolvedValue(undefined)

    await sendEmail('buyer@example.test', 'Subject', '<p>Body</p>')

    expect(nodemailer.createTransport).toHaveBeenCalledWith(expect.objectContaining({
      secure: false,
      requireTLS: false,
      ignoreTLS: true,
    }))
  })

  it('alerts and surfaces a permanent SMTP failure without retrying', async () => {
    sendMail.mockRejectedValue(Object.assign(new Error('mailbox rejected'), { responseCode: 550 }))

    await expect(sendEmail('buyer@example.test', 'Subject', '<p>Body</p>')).rejects.toThrow('mailbox rejected')

    expect(sendMail).toHaveBeenCalledTimes(1)
    expect(logOperationalEvent).toHaveBeenCalledWith(expect.objectContaining({
      event: 'smtp_send_failed', level: 'error', alert: true, responseCode: 550,
    }), expect.any(Error))
  })
})
