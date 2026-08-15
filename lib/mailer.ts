import nodemailer from 'nodemailer'
import { logOperationalEvent } from '@/lib/observability'

function createTransport() {
  if (!process.env.SMTP_HOST) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('SMTP_HOST is required in production')
    }
    return null
  }
  if (!process.env.SMTP_FROM && !process.env.SMTP_USER && process.env.NODE_ENV === 'production') {
    throw new Error('SMTP_FROM or SMTP_USER is required in production')
  }
  const secure = process.env.SMTP_SECURE === 'true'
  const ignoreTLS = process.env.SMTP_IGNORE_TLS === 'true'
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    requireTLS: !secure && !ignoreTLS,
    ignoreTLS,
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  })
}

function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

type SendEmailOptions = {
  /** Absolute URL that unsubscribes the recipient. Adds RFC 8058 one-click headers
   *  so mail clients can surface a native "Unsubscribe" control for marketing mail. */
  listUnsubscribeUrl?: string
  correlationId?: string
}

export async function sendEmail(
  to: string,
  subject: string,
  html: string,
  options: SendEmailOptions = {}
): Promise<void> {
  const headers: Record<string, string> = {}
  if (options.listUnsubscribeUrl) {
    headers['List-Unsubscribe'] = `<${options.listUnsubscribeUrl}>`
    headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click'
  }

  const transport = createTransport()
  if (!transport) {
    logOperationalEvent({
      event: 'smtp_send_skipped',
      level: 'warn',
      correlationId: options.correlationId,
      reason: 'smtp_not_configured',
      recipientCount: to.split(',').filter(Boolean).length,
    })
    return
  }
  const message = {
    from: process.env.SMTP_FROM ?? process.env.SMTP_USER,
    to,
    subject,
    html,
    text: htmlToText(html),
    headers: Object.keys(headers).length ? headers : undefined,
  }
  let lastError: unknown
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await transport.sendMail(message)
      logOperationalEvent({ event: 'smtp_send_succeeded', correlationId: options.correlationId, attempt })
      return
    } catch (error) {
      lastError = error
      const responseCode = (error as { responseCode?: number }).responseCode
      const transient = responseCode === undefined || (responseCode >= 400 && responseCode < 500)
      logOperationalEvent({
        event: attempt === 3 || !transient ? 'smtp_send_failed' : 'smtp_send_retry',
        level: attempt === 3 || !transient ? 'error' : 'warn',
        alert: attempt === 3 || !transient,
        correlationId: options.correlationId,
        attempt,
        responseCode,
      }, error)
      if (!transient || attempt === 3) break
      await new Promise((resolve) => setTimeout(resolve, attempt * 500))
    }
  }
  throw lastError
}
