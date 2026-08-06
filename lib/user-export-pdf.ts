import 'server-only'
import { jsPDF } from 'jspdf'
import type { UserExport } from '@/lib/user-erasure'

type Row = Record<string, unknown>

const LABELS: Record<string, string> = {
  id: 'ID', email: 'Email', name: 'Name', phone: 'Phone', cardNumber: 'Client card',
  companyName: 'Company', teamRole: 'Team role', bonusPoints: 'Bonus points', createdAt: 'Created',
  firstName: 'First name', lastName: 'Last name', address: 'Address', city: 'City',
  postalCode: 'Postal code', status: 'Status', total: 'Total', orderId: 'Order ID',
  invoiceNumber: 'Invoice number', productTitle: 'Product', quantity: 'Quantity',
  interval: 'Interval', requestedAt: 'Requested', exportedAt: 'Exported',
  productId: 'Product ID', addedAt: 'Added', title: 'Title', message: 'Message',
  type: 'Type', channel: 'Channel', requestType: 'Request type', reviewedAt: 'Reviewed',
  expiresAt: 'Expires', acceptedAt: 'Accepted', marketingConsent: 'Marketing consent',
  marketingConsentAt: 'Marketing consent date', privacyNoticeVersion: 'Privacy notice version',
  privacyAcknowledgedAt: 'Privacy notice accepted', items: 'Items',
}

const HIDDEN_FIELDS = new Set(['avatarUrl', 'passwordHash', 'timeline', 'quote'])

function valueText(value: unknown): string {
  if (value == null || value === '') return '-'
  if (value instanceof Date) return value.toISOString().replace('T', ' ').slice(0, 19)
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value)
  if (typeof value === 'string') {
    const date = /^\d{4}-\d{2}-\d{2}T/.test(value) ? new Date(value) : null
    return date && !Number.isNaN(date.getTime()) ? date.toISOString().replace('T', ' ').slice(0, 19) : value
  }
  if (Array.isArray(value)) {
    return value.map((item) => {
      if (!item || typeof item !== 'object') return String(item)
      const row = item as Row
      const title = valueText(row.title ?? row.productTitle ?? row.id)
      const quantity = row.quantity == null ? '' : ` x ${valueText(row.quantity)}`
      const price = row.price == null ? '' : ` (${valueText(row.price)})`
      return `${title}${quantity}${price}`
    }).join('; ')
  }
  if (typeof value === 'object') {
    try { return JSON.stringify(value) } catch { return String(value) }
  }
  return '-'
}

export function createUserExportPdf(data: UserExport): ArrayBuffer {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' })
  const left = 16
  const width = 178
  let y = 18

  const ensureSpace = (height = 10) => {
    if (y + height <= 282) return
    pdf.addPage()
    y = 18
  }
  const line = (text: string, size = 10, color: [number, number, number] = [31, 41, 55]) => {
    pdf.setFontSize(size)
    pdf.setTextColor(...color)
    const wrapped = pdf.splitTextToSize(text, width) as string[]
    ensureSpace(wrapped.length * 5 + 2)
    pdf.text(wrapped, left, y)
    y += wrapped.length * 5 + 2
  }
  const section = (title: string) => {
    ensureSpace(14)
    y += 4
    line(title, 14, [17, 24, 39])
    pdf.setDrawColor(226, 232, 240)
    pdf.line(left, y - 2, left + width, y - 2)
    y += 2
  }
  const fields = (row: Row) => {
    for (const [key, value] of Object.entries(row)) {
      if (HIDDEN_FIELDS.has(key)) continue
      line(`${LABELS[key] ?? key}: ${valueText(value)}`, 9, [55, 65, 81])
    }
  }
  const collection = (title: string, rows: unknown[]) => {
    section(`${title} (${rows.length})`)
    if (!rows.length) return line('No records', 9, [107, 114, 128])
    rows.forEach((item, index) => {
      ensureSpace(14)
      line(`${index + 1}.`, 10, [37, 99, 235])
      fields((item ?? {}) as Row)
      y += 2
    })
  }

  line('Your Hairshop Pro account report', 20, [17, 24, 39])
  line(`Prepared for: ${valueText(data.profile.name)}`, 10, [55, 65, 81])
  line(`Email: ${valueText(data.profile.email)}`, 10, [55, 65, 81])
  line(`Client card: ${valueText(data.profile.cardNumber)}`, 10, [55, 65, 81])
  line(`Report generated: ${valueText(data.exportedAt)}`, 9, [107, 114, 128])
  section('Profile')
  fields(data.profile)
  collection('Orders', data.orders)
  collection('Invoices', data.invoices)
  collection('Saved addresses', data.savedAddresses)
  collection('Subscriptions', data.subscriptions)
  collection('Stock notifications', data.stockNotifications)
  collection('Return requests', data.returnRequests)
  collection('Wishlist', data.wishlist)
  collection('Account notifications', data.notifications)
  collection('Access requests', data.accessRequests)
  collection('Invitations', data.invitations)

  return pdf.output('arraybuffer')
}
