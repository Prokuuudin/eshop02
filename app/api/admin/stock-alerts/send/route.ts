import { NextRequest, NextResponse } from 'next/server'
import { escapeHtml as escHtml } from '@/lib/escape-html'
import { logApiError } from '@/lib/observability'
import { requireAdmin } from '@/lib/server-auth'
import { sendEmail } from '@/lib/mailer'
import { prisma } from '@/lib/prisma'
import { invitationBatchId } from '@/lib/invitation-dispatch'
import { prepareAuditedDelivery, recordAuditedDelivery } from '@/lib/audited-delivery'

export const runtime = 'nodejs'

const STOCK_REPORT_EVENTS = { prepared: 'stock_alert.report_prepared', recorded: 'stock_alert.report_recorded' }

type AlertProduct = {
  id: string
  title: string
  brand: string
  sku?: string
  category: string
  stock: number
  price: number
}

const CATEGORY_LABEL: Record<string, string> = {
  hair: 'Волосы', face: 'Лицо', body: 'Тело',
  nails: 'Ногти', equipment: 'Аксессуары и инструменты',
}

function buildHtml(products: AlertProduct[], threshold: number): string {
  const outOfStock = products.filter((p) => p.stock === 0)
  const lowStock = products.filter((p) => p.stock > 0 && p.stock <= threshold)

  const row = (p: AlertProduct) => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:13px">${escHtml(p.title)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;color:#6b7280">${escHtml(p.brand)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;color:#9ca3af;font-family:monospace">${p.sku ? escHtml(p.sku) : '—'}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;color:#6b7280">${escHtml(CATEGORY_LABEL[p.category] ?? p.category)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;text-align:center;font-weight:600;color:${p.stock === 0 ? '#dc2626' : '#d97706'}">${p.stock === 0 ? 'Нет' : p.stock}</td>
    </tr>`

  const tableHeader = `
    <tr style="background:#f9fafb">
      <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600">Товар</th>
      <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600">Бренд</th>
      <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600">SKU</th>
      <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600">Категория</th>
      <th style="padding:8px 12px;text-align:center;font-size:12px;color:#6b7280;font-weight:600">Остаток</th>
    </tr>`

  const outSection = outOfStock.length > 0 ? `
    <h2 style="margin:24px 0 8px;font-size:16px;color:#dc2626">Нет в наличии (${outOfStock.length})</h2>
    <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
      <thead>${tableHeader}</thead>
      <tbody>${outOfStock.map(row).join('')}</tbody>
    </table>` : ''

  const lowSection = lowStock.length > 0 ? `
    <h2 style="margin:24px 0 8px;font-size:16px;color:#d97706">Мало в наличии ≤ ${threshold} (${lowStock.length})</h2>
    <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
      <thead>${tableHeader}</thead>
      <tbody>${lowStock.map(row).join('')}</tbody>
    </table>` : ''

  return `
    <div style="font-family:sans-serif;max-width:720px;margin:0 auto;padding:24px">
      <div style="margin-bottom:20px;padding-bottom:16px;border-bottom:2px solid #e5e7eb">
        <h1 style="margin:0;font-size:20px;color:#111827">Отчёт по остаткам</h1>
        <p style="margin:4px 0 0;font-size:13px;color:#6b7280">
          Сформирован ${new Date().toLocaleString('ru-RU')} · порог: ${threshold} шт
        </p>
      </div>
      ${outSection}
      ${lowSection}
      ${outOfStock.length === 0 && lowStock.length === 0
        ? '<p style="color:#6b7280;font-size:14px">Товаров с критическим остатком нет.</p>'
        : ''}
    </div>`
}

export async function POST(request: NextRequest): Promise<Response> {
  const actor = await requireAdmin()
  if (actor instanceof NextResponse) return actor

  try {
    const body = (await request.json()) as {
      to?: string
      threshold?: number
    }

    const to = body.to?.trim() ?? ''
    const threshold = Number.isFinite(body.threshold)
      ? Math.max(0, Math.trunc(body.threshold as number))
      : 5

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      return NextResponse.json({ error: 'invalid_email' }, { status: 400 })
    }
    const batchId = invitationBatchId(request, actor.id, 'stock-alert-report')
    if (!batchId) return NextResponse.json({ error: 'invalid_idempotency_key' }, { status: 400 })

    const rows = await prisma.product.findMany({
      where: { isDeleted: false, stock: { gte: 0, lte: threshold } },
      orderBy: [{ stock: 'asc' }, { title: 'asc' }],
      select: {
        id: true, title: true, brand: true, sku: true,
        category: true, stock: true, price: true,
      },
    })
    const alertProducts: AlertProduct[] = rows.map((product) => ({
      ...product,
      sku: product.sku ?? undefined,
      price: Number(product.price),
    }))
    const html = buildHtml(alertProducts, threshold)

    const outCount = alertProducts.filter((p) => p.stock === 0).length
    const lowCount = alertProducts.filter((p) => p.stock > 0).length
    const subject = `[Остатки] ${outCount} нет в наличии, ${lowCount} мало — ${new Date().toLocaleDateString('ru-RU')}`

    // Audit before SMTP: counts and threshold only — no address or report content.
    // A technical retry replays a delivered report; a recorded failure may retry.
    const target = { entityType: 'stock_alert_report', entityId: batchId }
    const claim = await prepareAuditedDelivery({
      request, actor, batchId, actions: STOCK_REPORT_EVENTS, target,
      after: {
        channel: 'email', threshold, products: alertProducts.length, outOfStock: outCount, lowStock: lowCount,
        recipientIsActor: to.toLowerCase() === actor.email.toLowerCase(),
      },
      retryable: (result) => (result as { status?: string } | null)?.status === 'failed',
    })
    if (claim.kind === 'in_progress') return NextResponse.json({ error: 'in_progress' }, { status: 409 })
    if (claim.kind === 'replay') {
      const products = (claim.prepared as { products?: number } | null)?.products ?? 0
      return NextResponse.json({ ok: true, sent: products, replayed: true })
    }

    try {
      await sendEmail(to, subject, html)
    } catch (error) {
      await recordAuditedDelivery({ request, actor, batchId, actions: STOCK_REPORT_EVENTS, target, result: { channel: 'email', status: 'failed' } })
      throw error
    }
    await recordAuditedDelivery({ request, actor, batchId, actions: STOCK_REPORT_EVENTS, target, result: { channel: 'email', status: 'sent' } })

    return NextResponse.json({ ok: true, sent: alertProducts.length })
  } catch (err) {
    logApiError("[stock-alerts/send]", err)
    return NextResponse.json({ error: 'send_failed' }, { status: 500 })
  }
}


