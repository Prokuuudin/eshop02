import { prisma } from '@/lib/prisma'
import { Prisma } from '@/generated/prisma/client'

const keyFor = (email: string) => `newsletter:subscriber:${email.toLowerCase()}`

export async function subscribeToNewsletter(email: string): Promise<void> {
  const value = { email: email.toLowerCase(), consentAt: new Date().toISOString() }
  await prisma.keyValueSetting.upsert({
    where: { key: keyFor(email) },
    create: { key: keyFor(email), value: value as unknown as Prisma.InputJsonValue },
    update: { value: value as unknown as Prisma.InputJsonValue },
  })
}
