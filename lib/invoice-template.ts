import { Order } from '@/lib/orders-store'
import { translations } from '@/data/translations'

type Lang = 'ru' | 'en' | 'lv'

const esc = (s: unknown): string =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const LABELS: Record<Lang, Record<string, string>> = {
  ru: {
    invoice: 'СЧЁТ',
    number: 'Номер счёта',
    date: 'Дата',
    seller: 'Продавец',
    buyer: 'Покупатель',
    product: 'Товар',
    qty: 'Кол-во',
    price: 'Цена',
    amount: 'Сумма',
    subtotal: 'Подитог',
    delivery: 'Доставка',
    discount: 'Скидка',
    tax: 'НДС (21%)',
    total: 'ИТОГО',
    phone: 'Тел.',
    sku: 'Арт.',
    thankyou: 'Спасибо за заказ!',
  },
  en: {
    invoice: 'INVOICE',
    number: 'Invoice No.',
    date: 'Date',
    seller: 'Seller',
    buyer: 'Buyer',
    product: 'Product',
    qty: 'Qty',
    price: 'Price',
    amount: 'Amount',
    subtotal: 'Subtotal',
    delivery: 'Delivery',
    discount: 'Discount',
    tax: 'VAT (21%)',
    total: 'TOTAL',
    phone: 'Phone',
    sku: 'SKU',
    thankyou: 'Thank you for your order!',
  },
  lv: {
    invoice: 'RĒĶINS',
    number: 'Rēķina Nr.',
    date: 'Datums',
    seller: 'Pārdevējs',
    buyer: 'Pircējs',
    product: 'Prece',
    qty: 'Daudzums',
    price: 'Cena',
    amount: 'Summa',
    subtotal: 'Starpsumma',
    delivery: 'Piegāde',
    discount: 'Atlaide',
    tax: 'PVN (21%)',
    total: 'KOPĀ',
    phone: 'Tālr.',
    sku: 'Art.',
    thankyou: 'Paldies par pasūtījumu!',
  },
}

function eur(cents: number): string {
  return (cents / 100).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}

export function buildInvoiceHtml(order: Order, lang: Lang): string {
  const L = LABELS[lang]
  const date = new Date(order.createdAt).toLocaleDateString('ru-RU')

  const itemRows = order.items
    .map((item) => {
      const titleKey = `products.${item.id}.title`
      const localTitle = translations[lang][titleKey] ?? item.title
      const unitPrice = eur(item.price)
      const lineTotal = eur(item.price * item.quantity)
      const sku = item.sku ? `<br/><small style="color:#888">${L.sku}: ${esc(item.sku)}</small>` : ''
      return `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #eee">${esc(localTitle)}${sku}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center">${item.quantity}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right">${unitPrice}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right">${lineTotal}</td>
        </tr>`
    })
    .join('')

  const discountRow = order.discount > 0
    ? `<tr><td colspan="3" style="padding:4px 12px;text-align:right;color:#555">${L.discount}</td><td style="padding:4px 12px;text-align:right;color:#dc2626">−${eur(order.discount)}</td></tr>`
    : ''

  const taxAmount = Math.round((order.subtotal - order.discount) * 0.21)

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${L.invoice} INV-${esc(order.id)}</title>
<style>
  body{font-family:Arial,sans-serif;font-size:13px;color:#1a1a1a;margin:0;padding:32px;background:#fff}
  table{border-collapse:collapse;width:100%}
  .header-table td{vertical-align:top;padding:0 0 24px}
  .meta{color:#555;font-size:12px;line-height:1.8}
  th{background:#f5f5f5;padding:8px 12px;text-align:left;font-size:12px;font-weight:600;border-bottom:2px solid #e5e5e5}
  th:last-child,td:last-child{text-align:right}
  th:nth-child(2),td:nth-child(2){text-align:center}
  .totals td{padding:4px 12px}
  .total-row td{font-weight:700;font-size:14px;border-top:2px solid #1a1a1a;padding-top:8px}
  .footer{margin-top:40px;font-size:11px;color:#999;text-align:center}
</style>
</head>
<body>
<table class="header-table">
  <tr>
    <td style="width:50%">
      <h1 style="margin:0 0 4px;font-size:22px;letter-spacing:2px">${L.invoice}</h1>
      <div class="meta">
        ${L.number}: <strong>INV-${esc(order.id)}</strong><br/>
        ${L.date}: ${date}
      </div>
    </td>
    <td style="text-align:right">
      <strong style="font-size:16px">Eshop</strong><br/>
      <span class="meta">info@eshop.lv<br/>eshop.lv</span>
    </td>
  </tr>
  <tr>
    <td>
      <div style="font-size:11px;font-weight:600;text-transform:uppercase;color:#888;margin-bottom:4px">${L.buyer}</div>
      <div>
        <strong>${esc(order.firstName)} ${esc(order.lastName)}</strong><br/>
        ${esc(order.email)}<br/>
        ${L.phone}: ${esc(order.phone)}<br/>
        ${order.address ? esc(order.address) + ', ' : ''}${esc(order.city)}${order.postalCode ? ' ' + esc(order.postalCode) : ''}
      </div>
    </td>
    <td></td>
  </tr>
</table>

<table>
  <thead>
    <tr>
      <th style="width:50%">${L.product}</th>
      <th style="width:10%">${L.qty}</th>
      <th style="width:20%">${L.price}</th>
      <th style="width:20%">${L.amount}</th>
    </tr>
  </thead>
  <tbody>
    ${itemRows}
  </tbody>
</table>

<table class="totals" style="margin-top:0;width:320px;margin-left:auto">
  <tr><td style="color:#555">${L.subtotal}</td><td style="text-align:right">${eur(order.subtotal)}</td></tr>
  ${discountRow}
  <tr><td style="color:#555">${L.delivery}</td><td style="text-align:right">${eur(order.delivery)}</td></tr>
  <tr><td style="color:#555">${L.tax}</td><td style="text-align:right">${eur(taxAmount)}</td></tr>
  <tr class="total-row"><td>${L.total}</td><td style="text-align:right">${eur(order.total)}</td></tr>
</table>

<div class="footer">${L.thankyou}</div>
</body>
</html>`
}
