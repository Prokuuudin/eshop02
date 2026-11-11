import 'server-only'

import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { appendServerAudit } from '@/lib/server-audit'
import type { ServerUser } from '@/lib/server-auth'

export type ContactMessageAuditContext = { actor: ServerUser; request: NextRequest }
export type ContactMessageStatusResult = 'changed' | 'unchanged' | 'not_found'

/**
 * Moves a contact message between "answered" and "unanswered" and audits the
 * transition in the same transaction. The row lock serialises concurrent
 * requests; repeating the current status keeps the original answeredAt and
 * answeredById and writes no event. The audit holds only the message ID and
 * the status fields — never the sender's name, email, subject or text.
 */
export async function setContactMessageAnswered(
  id: string,
  answered: boolean,
  audit: ContactMessageAuditContext,
): Promise<ContactMessageStatusResult> {
  return prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "ContactMessage" WHERE id = ${id} FOR UPDATE`
    if (locked.length === 0) return 'not_found'
    // Values through Prisma (not raw SQL) so timestamps keep their mapping.
    const current = await tx.contactMessage.findUnique({
      where: { id },
      select: { answeredAt: true, answeredById: true },
    })
    if (!current) return 'not_found'
    const wasAnswered = current.answeredAt !== null
    if (wasAnswered === answered) return 'unchanged'

    const data = answered
      ? { answeredAt: new Date(), answeredById: audit.actor.id }
      : { answeredAt: null, answeredById: null }
    await tx.contactMessage.update({ where: { id }, data })
    await appendServerAudit(tx, audit.request, audit.actor, {
      action: answered ? 'contact_message.marked_answered' : 'contact_message.marked_unanswered',
      entityType: 'contact_message',
      entityId: id,
      before: { answered: wasAnswered, answeredAt: current.answeredAt?.toISOString() ?? null, answeredById: current.answeredById },
      after: { answered, answeredAt: data.answeredAt?.toISOString() ?? null, answeredById: data.answeredById },
    })
    return 'changed'
  })
}
