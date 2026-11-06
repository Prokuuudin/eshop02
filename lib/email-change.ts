import 'server-only'
import { createHash, randomBytes } from 'node:crypto'
import type { NextRequest } from 'next/server'
import { Prisma } from '@/generated/prisma/client'
import { hasDeliverableEmail } from '@/lib/card-activation'
import { escapeHtml } from '@/lib/escape-html'
import { prisma } from '@/lib/prisma'
import { appendServerAudit } from '@/lib/server-audit'
import { mapDbToServerUser } from '@/lib/server-auth'
import { getSiteUrl } from '@/lib/site-url'

export const EMAIL_CHANGE_TTL_MS = 60 * 60 * 1000
const MAX_EMAIL_LENGTH = 254

export type EmailChangeLanguage = 'ru' | 'en' | 'lv'

type PendingEmailChange = {
  tokenHash: string
  newEmail: string
  /** The account e-mail when the change was requested; a later change voids this link. */
  currentEmail: string
  expiresAt: string
  language: EmailChangeLanguage
}

export const emailChangeKey = (userId: string): string => `email-change:${userId}`
const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex')

export function resolveEmailChangeLanguage(value: unknown): EmailChangeLanguage {
  return value === 'en' || value === 'lv' ? value : 'ru'
}

export function normalizeRequestedEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const email = value.trim().toLowerCase()
  if (email.length > MAX_EMAIL_LENGTH || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null
  return hasDeliverableEmail(email) ? email : null
}

const isEmailTaken = (db: Pick<typeof prisma, 'user'>, email: string, exceptUserId: string): Promise<boolean> =>
  db.user.findFirst({
    where: { email: { equals: email, mode: 'insensitive' }, NOT: { id: exceptUserId } },
    select: { id: true },
  }).then(Boolean)

/**
 * Records one pending change per user; a new request voids the previous link. The row is written
 * whether or not the address is free, so the work done does not depend on someone else's account.
 * The caller only mails a link when `token` is returned. Only the token hash is ever stored.
 */
export async function requestEmailChange(
  user: { id: string; email: string },
  newEmail: string,
  language: EmailChangeLanguage,
): Promise<{ token: string | null }> {
  const taken = await isEmailTaken(prisma, newEmail, user.id)
  const secret = randomBytes(32).toString('hex')
  const token = `${Buffer.from(user.id).toString('base64url')}.${secret}`
  const value: PendingEmailChange = {
    tokenHash: hashToken(token),
    newEmail,
    currentEmail: user.email,
    expiresAt: new Date(Date.now() + EMAIL_CHANGE_TTL_MS).toISOString(),
    language,
  }
  const json = value as unknown as Prisma.InputJsonValue
  const key = emailChangeKey(user.id)
  await prisma.keyValueSetting.upsert({ where: { key }, create: { key, value: json }, update: { value: json } })
  return { token: taken ? null : token }
}

function userIdFromToken(token: string): string | null {
  const [encoded, secret, extra] = token.split('.')
  if (!encoded || !secret || extra !== undefined || !/^[0-9a-f]{64}$/.test(secret)) return null
  const id = Buffer.from(encoded, 'base64url').toString('utf8')
  return id && id.length <= 200 ? id : null
}

export type ConfirmedEmailChange = {
  oldEmail: string
  newEmail: string
  language: EmailChangeLanguage
}

/**
 * Applies a pending change in one transaction. The conditional delete is the single atomic consume:
 * of concurrent requests with one link exactly one removes the row. A consumed link stays consumed
 * when the later checks refuse it. The advisory lock makes the case-insensitive uniqueness check safe
 * between two accounts claiming one address (the column's unique index is case-sensitive).
 * Every refusal looks the same to the caller, so the answer reveals nothing about other accounts.
 */
export async function confirmEmailChange(
  token: string,
  request: NextRequest,
  currentSessionTokenHash: string | null,
): Promise<ConfirmedEmailChange | null> {
  const userId = userIdFromToken(token)
  if (!userId) return null
  const tokenHash = hashToken(token)
  const key = emailChangeKey(userId)

  try {
    return await prisma.$transaction(async (tx) => {
      const consumed = await tx.keyValueSetting.findUnique({ where: { key } })
      const pending = consumed?.value as PendingEmailChange | undefined
      if (!pending || pending.tokenHash !== tokenHash) return null
      const { count } = await tx.keyValueSetting.deleteMany({
        where: { key, value: { path: ['tokenHash'], equals: tokenHash } },
      })
      if (count !== 1) return null
      if (new Date(pending.expiresAt).getTime() <= Date.now()) return null

      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`email-change:${pending.newEmail}`}))`
      const user = await tx.user.findUnique({ where: { id: userId } })
      if (!user || user.email !== pending.currentEmail) return null
      if (await isEmailTaken(tx as unknown as Pick<typeof prisma, 'user'>, pending.newEmail, userId)) return null

      await tx.user.update({ where: { id: userId }, data: { email: pending.newEmail } })
      await tx.companyMember.updateMany({ where: { userId }, data: { email: pending.newEmail } })
      await tx.savedAddress.updateMany({ where: { userId }, data: { email: pending.newEmail } })
      // Anything already issued for the old mailbox or an older sign-in stops working.
      await tx.passwordResetToken.deleteMany({ where: { userId } })
      await tx.mfaChallenge.deleteMany({ where: { userId } })
      await tx.session.deleteMany({
        where: { userId, ...(currentSessionTokenHash ? { NOT: { tokenHash: currentSessionTokenHash } } : {}) },
      })
      await appendServerAudit(tx, request, mapDbToServerUser(user), {
        action: 'user.email_changed',
        entityType: 'user',
        entityId: userId,
        before: { email: user.email },
        after: { email: pending.newEmail },
      })
      return { oldEmail: user.email, newEmail: pending.newEmail, language: pending.language }
    })
  } catch (error) {
    // An exact-case unique conflict with a writer outside this lock: refused like any other.
    if ((error as { code?: string })?.code === 'P2002') return null
    throw error
  }
}

function localizedPrefix(language: EmailChangeLanguage): string {
  return language === 'ru' ? '' : `/${language}`
}

function maskEmail(email: string): string {
  const [local, domain] = email.split('@')
  return `${local.slice(0, 1)}***@${domain}`
}

const CONFIRM_TEXT: Record<EmailChangeLanguage, { subject: string; title: string; intro: string; button: string; expiry: string; ignore: string }> = {
  ru: {
    subject: 'Подтвердите новый email',
    title: 'Подтвердите новый email',
    intro: 'Для вашего аккаунта Hairshop-Pro запрошена смена email на этот адрес. Email изменится только после подтверждения.',
    button: 'Подтвердить email',
    expiry: 'Ссылка действительна 1 час и срабатывает один раз.',
    ignore: 'Если вы этого не запрашивали, просто проигнорируйте письмо.',
  },
  en: {
    subject: 'Confirm your new email',
    title: 'Confirm your new email',
    intro: 'A change of your Hairshop-Pro account email to this address was requested. The email changes only after you confirm.',
    button: 'Confirm email',
    expiry: 'The link is valid for 1 hour and works once.',
    ignore: 'If you did not request this, simply ignore this email.',
  },
  lv: {
    subject: 'Apstipriniet jauno e-pastu',
    title: 'Apstipriniet jauno e-pastu',
    intro: 'Jūsu Hairshop-Pro konta e-pastam pieprasīta maiņa uz šo adresi. E-pasts mainīsies tikai pēc apstiprināšanas.',
    button: 'Apstiprināt e-pastu',
    expiry: 'Saite ir derīga 1 stundu un darbojas vienu reizi.',
    ignore: 'Ja to nepieprasījāt, vienkārši ignorējiet šo e-pastu.',
  },
}

const NOTICE_TEXT: Record<EmailChangeLanguage, { subject: string; title: string; body: (masked: string) => string; warning: string }> = {
  ru: {
    subject: 'Email вашего аккаунта изменён',
    title: 'Email аккаунта изменён',
    body: (masked) => `Email вашего аккаунта Hairshop-Pro изменён на ${masked}. Другие сеансы входа завершены.`,
    warning: 'Если это были не вы, срочно свяжитесь с нами: office@miksplus.eu.',
  },
  en: {
    subject: 'Your account email was changed',
    title: 'Account email changed',
    body: (masked) => `The email of your Hairshop-Pro account was changed to ${masked}. Other sign-ins were ended.`,
    warning: 'If this was not you, contact us immediately: office@miksplus.eu.',
  },
  lv: {
    subject: 'Jūsu konta e-pasts ir mainīts',
    title: 'Konta e-pasts mainīts',
    body: (masked) => `Jūsu Hairshop-Pro konta e-pasts ir mainīts uz ${masked}. Citas pieslēgšanās ir pārtrauktas.`,
    warning: 'Ja tas nebijāt jūs, nekavējoties sazinieties ar mums: office@miksplus.eu.',
  },
}

export function buildEmailChangeConfirmMail(token: string, language: EmailChangeLanguage): { subject: string; html: string } {
  const text = CONFIRM_TEXT[language]
  const url = `${getSiteUrl()}${localizedPrefix(language)}/auth/confirm-email?token=${encodeURIComponent(token)}`
  return {
    subject: text.subject,
    html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto">
      <h2>${text.title}</h2>
      <p>${text.intro}</p>
      <p style="margin:24px 0"><a href="${escapeHtml(url)}" style="display:inline-block;padding:12px 24px;background:#4f46e5;color:#fff;border-radius:6px;text-decoration:none;font-weight:600">${text.button}</a></p>
      <p style="color:#6b7280;font-size:13px">${text.expiry}<br>${text.ignore}</p>
    </div>`,
  }
}

export function buildEmailChangedNoticeMail(newEmail: string, language: EmailChangeLanguage): { subject: string; html: string } {
  const text = NOTICE_TEXT[language]
  return {
    subject: text.subject,
    html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto">
      <h2>${text.title}</h2>
      <p>${escapeHtml(text.body(maskEmail(newEmail)))}</p>
      <p style="color:#6b7280;font-size:13px">${text.warning}</p>
    </div>`,
  }
}
