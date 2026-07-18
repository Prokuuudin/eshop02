import nodemailer from 'nodemailer'

function createTransport() {
  if (!process.env.SMTP_HOST) return null
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  })
}

type SendEmailOptions = {
  /** Absolute URL that unsubscribes the recipient. Adds RFC 8058 one-click headers
   *  so mail clients can surface a native "Unsubscribe" control for marketing mail. */
  listUnsubscribeUrl?: string
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
    console.log('[mailer] SMTP_HOST not set — printing email to console')
    console.log(`TO: ${to}\nSUBJECT: ${subject}\n${html}`)
    return
  }
  await transport.sendMail({
    from: process.env.SMTP_FROM ?? process.env.SMTP_USER,
    to,
    subject,
    html,
    headers: Object.keys(headers).length ? headers : undefined,
  })
}
