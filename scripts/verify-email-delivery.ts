import { randomUUID } from 'node:crypto'
import { sendEmail } from '../lib/mailer'

type MailpitMessage = {
  ID?: string
  Subject?: string
  To?: Array<{ Address?: string }>
}

type MailpitList = { messages?: MailpitMessage[] }

async function main(): Promise<void> {
  const apiUrl = (process.env.MAILPIT_API_URL ?? 'http://127.0.0.1:8025').replace(/\/$/, '')
  const recipient = `email-lifecycle-${randomUUID()}@example.test`
  const subject = `Email lifecycle ${randomUUID()}`
  const link = 'https://shop.test/auth/reset-password?token=delivery-probe'

  await sendEmail(recipient, subject, `<h1>Delivery probe</h1><a href="${link}">Continue</a>`)

  const deadline = Date.now() + 20_000
  let delivered: MailpitMessage | undefined
  while (Date.now() < deadline && !delivered) {
    const response = await fetch(`${apiUrl}/api/v1/messages`)
    if (!response.ok) throw new Error(`Mailpit API returned ${response.status}`)
    const body = await response.json() as MailpitList
    delivered = body.messages?.find((message) =>
      message.Subject === subject && message.To?.some((to) => to.Address === recipient),
    )
    if (!delivered) await new Promise((resolve) => setTimeout(resolve, 250))
  }

  if (!delivered?.ID) throw new Error(`Mailpit did not receive ${subject}`)
  const detailResponse = await fetch(`${apiUrl}/api/v1/message/${encodeURIComponent(delivered.ID)}`)
  if (!detailResponse.ok) throw new Error(`Mailpit message API returned ${detailResponse.status}`)
  const raw = JSON.stringify(await detailResponse.json())
  if (!raw.includes(link)) throw new Error('Delivered message does not contain the lifecycle link')

  console.log(`Mailpit delivery verified: ${delivered.ID}`)
}

void main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
