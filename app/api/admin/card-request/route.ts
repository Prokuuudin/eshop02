import { NextRequest, NextResponse } from 'next/server'
import { logApiError } from '@/lib/observability'
import { requireAdminPermission, type ServerUser } from '@/lib/server-auth'
import { sendEmail } from '@/lib/mailer'
import { getTemplates } from '@/lib/email-templates-server-store'
import { escapeHtml } from '@/lib/escape-html'
import { prisma } from '@/lib/prisma'
import { appendServerAudit } from '@/lib/server-audit'
import { invitationBatchId, lockBatch } from '@/lib/invitation-dispatch'

export const runtime = 'nodejs'

type Lang = 'ru' | 'en' | 'lv'

const OFFICE_PHONE = '+371 27067730'
const OFFICE_EMAIL = 'office@miksplus.eu'

function interpolate(template: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce(
    (html, [key, value]) => html.replaceAll(`{{${key}}}`, value),
    template
  )
}

function buildNoteBlock(note: string, lang: Lang): string {
  const label = lang === 'ru' ? 'Комментарий' : lang === 'en' ? 'Comment' : 'Komentārs'
  return `<div style="background:#fff7ed;border-left:3px solid #f97316;border-radius:4px;padding:12px 16px;margin:16px 0;font-size:14px;color:#9a3412;line-height:1.6">
    <p style="margin:0 0 4px;font-weight:600;font-size:13px;text-transform:uppercase;letter-spacing:0.04em;color:#c2410c">${label}</p>
    <p style="margin:0">${escapeHtml(note)}</p>
  </div>`
}

// Fallback HTML builders (used if template not found in JSON)
const FALLBACK_SUBJECTS: Record<string, Record<Lang, string>> = {
  rejection: {
    ru: 'О вашей заявке на карту клиента',
    en: 'About your client card application',
    lv: 'Par jūsu klienta kartes pieteikumu',
  },
}

function buildFallbackRejection(name: string, lang: Lang, note?: string): string {
  const safeName = escapeHtml(name)
  const noteBlock = note ? buildNoteBlock(note, lang) : ''
  return `<p>${safeName},</p><p>Application rejected.</p>${noteBlock}<p>${OFFICE_PHONE} / ${OFFICE_EMAIL}</p>`
}

type ApprovePayload = { action: 'approve'; email: string; name: string; cardNumber: string; language?: Lang }
type RejectPayload = { action: 'reject'; email: string; name: string; note?: string; language?: Lang; accessRequestId?: string }
type Payload = ApprovePayload | RejectPayload

const PREPARED = 'access_request.rejection_email_prepared'
const RECORDED = 'access_request.rejection_email_recorded'

class RejectionConflict extends Error {
  constructor(readonly code: 'in_progress' | 'request_mismatch') {
    super(code)
  }
}

/**
 * Claims the send under the batch lock and audits it before SMTP. A technical
 * retry with the same Idempotency-Key replays a delivered email instead of
 * sending it again; after a recorded failure the same key may try again, and
 * a new key (a new admin action) is always an explicit resend.
 */
async function prepareRejectionEmail(
  request: NextRequest,
  actor: ServerUser,
  batchId: string,
  payload: RejectPayload,
  lang: Lang,
): Promise<'prepared' | 'replayed'> {
  return prisma.$transaction(async (tx) => {
    await lockBatch(tx, batchId)
    const attempts = await tx.auditLog.findMany({
      where: { requestId: batchId, action: { in: [PREPARED, RECORDED] } },
      orderBy: { sequence: 'asc' },
      select: { action: true, after: true },
    })
    const last = attempts.at(-1)
    if (last?.action === PREPARED) throw new RejectionConflict('in_progress')
    if (last?.action === RECORDED && (last.after as { status?: string } | null)?.status === 'sent') return 'replayed'

    if (payload.accessRequestId) {
      const accessRequest = await tx.accessRequest.findUnique({
        where: { id: payload.accessRequestId },
        select: { status: true, email: true },
      })
      if (!accessRequest || accessRequest.status !== 'rejected'
        || accessRequest.email.toLowerCase() !== payload.email.trim().toLowerCase()) {
        throw new RejectionConflict('request_mismatch')
      }
    }
    await appendServerAudit(tx, request, actor, {
      action: PREPARED,
      entityType: 'access_request',
      entityId: payload.accessRequestId ?? 'unlinked',
      requestId: batchId,
      after: { channel: 'email', language: lang, linked: Boolean(payload.accessRequestId), hasNote: Boolean(payload.note) },
    })
    return 'prepared'
  })
}

async function recordRejectionEmail(
  request: NextRequest,
  actor: ServerUser,
  batchId: string,
  accessRequestId: string | undefined,
  status: 'sent' | 'failed',
): Promise<void> {
  try {
    await prisma.$transaction((tx) => appendServerAudit(tx, request, actor, {
      action: RECORDED,
      entityType: 'access_request',
      entityId: accessRequestId ?? 'unlinked',
      requestId: batchId,
      after: { channel: 'email', status },
    }))
  } catch (error) {
    // The SMTP outcome is already final; keep the response truthful.
    logApiError('[card-request] delivery audit failed', error)
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const actor = await requireAdminPermission('customers.read')
  if (actor instanceof NextResponse) return actor

  let payload: Payload
  try {
    payload = (await request.json()) as Payload
  } catch {
    return NextResponse.json({ ok: false, code: 'invalid_json' }, { status: 400 })
  }

  const { action, email, name } = payload
  if (!action || !email || !name) {
    return NextResponse.json({ ok: false, code: 'missing_fields' }, { status: 422 })
  }

  const lang: Lang = payload.language ?? 'ru'

  try {
    const templates = await getTemplates()
    const findTemplate = (id: string) => templates.find((t) => t.id === id)

    if (action === 'approve') {
      // Approval must go through /api/admin/access-requests/:id. That workflow
      // creates a one-time /auth/invite token and sends the canonical pro-invite
      // template; the retired shared-password registration email is forbidden.
      return NextResponse.json({ ok: false, code: 'legacy_approval_disabled' }, { status: 410 })

    } else if (action === 'reject') {
      const reject = payload as RejectPayload
      const { note } = reject
      if (reject.accessRequestId !== undefined && (typeof reject.accessRequestId !== 'string' || reject.accessRequestId.length > 100)) {
        return NextResponse.json({ ok: false, code: 'invalid_access_request_id' }, { status: 422 })
      }
      const batchId = invitationBatchId(request, actor.id, 'card-request-reject')
      if (!batchId) return NextResponse.json({ ok: false, code: 'invalid_idempotency_key' }, { status: 400 })
      const tpl = findTemplate(`access-request-rejected-${lang}`)
      const subject = tpl?.subject ?? FALLBACK_SUBJECTS.rejection[lang]
      const html = tpl
        ? interpolate(tpl.body, {
            name: escapeHtml(name),
            note_block: note ? buildNoteBlock(note, lang) : '',
          })
        : buildFallbackRejection(name, lang, note)

      try {
        if (await prepareRejectionEmail(request, actor, batchId, reject, lang) === 'replayed') {
          return NextResponse.json({ ok: true, replayed: true })
        }
      } catch (error) {
        if (error instanceof RejectionConflict) {
          return NextResponse.json({ ok: false, code: error.code }, { status: 409 })
        }
        throw error
      }

      try {
        await sendEmail(email, subject, html)
      } catch (error) {
        await recordRejectionEmail(request, actor, batchId, reject.accessRequestId, 'failed')
        throw error
      }
      await recordRejectionEmail(request, actor, batchId, reject.accessRequestId, 'sent')

    } else {
      return NextResponse.json({ ok: false, code: 'unknown_action' }, { status: 400 })
    }
  } catch (err) {
    logApiError("[card-request] sendEmail error:", err)
    return NextResponse.json({ ok: false, code: 'email_failed' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

