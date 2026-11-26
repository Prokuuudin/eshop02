import { NextRequest, NextResponse } from 'next/server'
import { escapeHtml } from '@/lib/escape-html'
import { prisma } from '@/lib/prisma'
import {
  addInvitationSuppression,
  verifyInvitationOptOutToken,
} from '@/lib/invitation-suppression'
import type { InviteLang } from '@/lib/invitations'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ lang: string }> }

const COPY: Record<InviteLang, {
  title: string
  description: string
  confirm: string
  successTitle: string
  success: string
  invalidTitle: string
  invalid: string
}> = {
  lv: {
    title: 'Atteikties no turpmākiem uzaicinājumiem?',
    description: 'Pēc apstiprināšanas Hairshop Pro vairs nesūtīs jums atkārtotus konta aktivizācijas uzaicinājumus. Jūsu karte, bonusi, pasūtījumi un iespēja reģistrēties patstāvīgi nemainīsies.',
    confirm: 'Turpmāk nesūtīt uzaicinājumus',
    successTitle: 'Atteikums saglabāts',
    success: 'Turpmāki Hairshop Pro uzaicinājumi jums netiks sūtīti.',
    invalidTitle: 'Saite nav derīga',
    invalid: 'Šī atteikuma saite nav derīga. Dati netika mainīti.',
  },
  ru: {
    title: 'Отказаться от повторных приглашений?',
    description: 'После подтверждения Hairshop Pro больше не будет отправлять вам повторные приглашения для активации аккаунта. Карта, бонусы, заказы и самостоятельная регистрация не изменятся.',
    confirm: 'Не приглашать повторно',
    successTitle: 'Отказ сохранён',
    success: 'Повторные приглашения Hairshop Pro больше не будут вам отправляться.',
    invalidTitle: 'Ссылка недействительна',
    invalid: 'Эта ссылка отказа недействительна. Данные не изменены.',
  },
  en: {
    title: 'Stop further invitations?',
    description: 'After confirmation, Hairshop Pro will no longer send you repeat account activation invitations. Your card, bonuses, orders, and ability to register yourself are not affected.',
    confirm: 'Do not send further invitations',
    successTitle: 'Preference saved',
    success: 'Hairshop Pro will not send you further invitations.',
    invalidTitle: 'Invalid link',
    invalid: 'This opt-out link is invalid. No data was changed.',
  },
}

function language(input: string): InviteLang {
  return input === 'ru' || input === 'en' ? input : 'lv'
}

function page(lang: InviteLang, state: 'confirm' | 'success' | 'invalid', fields?: { userId: string; token: string }): NextResponse {
  const copy = COPY[lang]
  const body = state === 'confirm' && fields
    ? `<h1>${copy.title}</h1><p>${copy.description}</p><form method="post"><input type="hidden" name="userId" value="${escapeHtml(fields.userId)}"><input type="hidden" name="token" value="${escapeHtml(fields.token)}"><button type="submit">${copy.confirm}</button></form>`
    : state === 'success'
      ? `<h1>${copy.successTitle}</h1><p>${copy.success}</p>`
      : `<h1>${copy.invalidTitle}</h1><p>${copy.invalid}</p>`
  const html = `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Hairshop Pro</title><style>body{margin:0;background:#f2f9fd;color:#17212b;font:16px/1.55 Arial,sans-serif}.card{max-width:560px;margin:10vh auto;padding:32px;background:#fff;border:1px solid #bfe3f4;border-radius:18px;box-shadow:0 12px 35px rgba(0,88,130,.1)}h1{margin:0 0 16px;font-size:28px}p{color:#4a6878}button{margin-top:12px;padding:12px 20px;border:1px solid #0088c4;border-radius:8px;background:#fff;color:#0075a9;font:inherit;font-weight:700;cursor:pointer}button:hover{background:#eaf6fc}@media(max-width:620px){.card{margin:24px 12px;padding:24px}}</style></head><body><main class="card">${body}</main></body></html>`
  return new NextResponse(html, {
    status: state === 'invalid' ? 400 : 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
      'Referrer-Policy': 'no-referrer',
    },
  })
}

async function validTarget(userId: string, token: string): Promise<boolean> {
  if (!verifyInvitationOptOutToken(userId, token)) return false
  return await prisma.user.findUnique({ where: { id: userId }, select: { id: true } }) !== null
}

/** Link scanners may open this URL: GET validates and renders only; it never writes. */
export async function GET(req: NextRequest, context: RouteContext): Promise<Response> {
  const lang = language((await context.params).lang)
  const userId = req.nextUrl.searchParams.get('userId')?.trim() ?? ''
  const token = req.nextUrl.searchParams.get('token')?.trim() ?? ''
  if (!await validTarget(userId, token)) return page(lang, 'invalid')
  return page(lang, 'confirm', { userId, token })
}

/** Explicit confirmation; an existing row is retained so repeated POSTs are idempotent. */
export async function POST(req: NextRequest, context: RouteContext): Promise<Response> {
  const lang = language((await context.params).lang)
  const form = await req.formData().catch(() => null)
  const userId = String(form?.get('userId') ?? '').trim()
  const token = String(form?.get('token') ?? '').trim()
  if (!await validTarget(userId, token)) return page(lang, 'invalid')
  await addInvitationSuppression(prisma, { userId, source: 'client_link' })
  return page(lang, 'success')
}
