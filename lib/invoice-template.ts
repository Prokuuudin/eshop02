import { Order } from '@/lib/orders-store'
import { translations } from '@/data/translations'
import { displayOrderTax } from '@/lib/tax'
import { COMPANY } from '@/data/company'
import { stores } from '@/data/stores'

/** Инвойс по умолчанию латышский; по запросу покупателя — английский.
 *  Адреса (продавца и магазина самовывоза) всегда латышские в обоих вариантах. */
export type InvoiceLang = 'lv' | 'en'

const esc = (s: unknown): string =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const LABELS: Record<InvoiceLang, Record<string, string>> = {
  lv: {
    invoice: 'RĒĶINS',
    number: 'Rēķina Nr.',
    date: 'Datums',
    seller: 'Pārdevējs',
    buyer: 'Pircējs',
    product: 'Nosaukums',
    qty: 'Daudzums',
    price: 'Cena',
    amount: 'Summa',
    subtotal: 'Starpsumma',
    delivery: 'Piegāde',
    discount: 'Atlaide',
    tax: 'PVN 21%',
    total: 'KOPĀ',
    phone: 'Tālr.',
    sku: 'Artikuls',
    thankyou: 'Paldies par pasūtījumu!',
    orderNumber: 'Pasūtījuma numurs', orderDate: 'Pasūtījuma datums', supplier: 'Preču izsniedzējs',
    supplierName: 'Preču piegādātājs', taxCode: 'Nodokļu maksātāja kods', address: 'Adrese',
    payer: 'Maksātājs', recipient: 'Saņēmējs', name: 'Vārds, uzvārds', email: 'E-pasts',
    paymentMethod: 'Maksāšanas veids', deliveryMethod: 'Piegādes veids', products: 'Preces',
    amountWords: 'Summa vārdiem', paymentReference: 'Apmaksājot, lūdzu, norādiet rēķina numuru',
    electronic: 'Rēķins sagatavots elektroniskā veidā un ir autorizēts', notes: 'Piezīmes',
    created: 'Izveidota', note: 'Piezīme', paymentWarning: 'Ja rēķins netiks apmaksāts 3 darba dienu laikā, mēs būsim spiesti anulēt Jūsu pasūtījumu. Ja Jums rodas jautājumi, lūdzam sazināties ar mums pa e-pastu info@hairshop.lv.',
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
    orderNumber: 'Order number', orderDate: 'Order date', supplier: 'Goods supplier',
    supplierName: 'Supplier', taxCode: 'Tax registration number', address: 'Address',
    payer: 'Payer', recipient: 'Recipient', name: 'Name', email: 'Email',
    paymentMethod: 'Payment method', deliveryMethod: 'Delivery method', products: 'Products',
    amountWords: 'Amount in words', paymentReference: 'When paying, please specify the invoice number',
    electronic: 'This invoice was prepared electronically and is authorised', notes: 'Notes',
    created: 'Created', note: 'Note', paymentWarning: 'If the invoice is not paid within 3 business days, we will have to cancel your order. If you have any questions, please contact us at info@hairshop.lv.',
  },
}

function eur(value: number): string {
  return `${value.toFixed(2)} €`
}

function formatVatNumber(): string {
  return `LV ${COMPANY.regNumber}`
}

function formatIban(value: string): string {
  return value.replace(/^(LV)(\d{2})([A-Z]{4})(\d{4})(\d{4})(\d{4})(\d)$/, '$1 $2 $3 $4 $5 $6 $7')
}

function formatInvoiceDate(value: Date | string): string {
  const date = new Date(value)
  return [date.getDate(), date.getMonth() + 1, date.getFullYear()]
    .map((part, index) => index < 2 ? String(part).padStart(2, '0') : String(part))
    .join('.')
}

const LV_ONES = ['', 'viens', 'divi', 'trīs', 'četri', 'pieci', 'seši', 'septiņi', 'astoņi', 'deviņi']
const LV_TEENS = ['desmit', 'vienpadsmit', 'divpadsmit', 'trīspadsmit', 'četrpadsmit', 'piecpadsmit', 'sešpadsmit', 'septiņpadsmit', 'astoņpadsmit', 'deviņpadsmit']
const LV_TENS = ['', '', 'divdesmit', 'trīsdesmit', 'četrdesmit', 'piecdesmit', 'sešdesmit', 'septiņdesmit', 'astoņdesmit', 'deviņdesmit']
const EN_ONES = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen']
const EN_TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']

function lvUnder1000(n: number): string {
  const parts: string[] = []
  if (n >= 100) { const h = Math.floor(n / 100); parts.push(h === 1 ? 'simts' : `${LV_ONES[h]} simti`); n %= 100 }
  if (n >= 20) { parts.push(LV_TENS[Math.floor(n / 10)]); n %= 10 }
  else if (n >= 10) { parts.push(LV_TEENS[n - 10]); n = 0 }
  if (n) parts.push(LV_ONES[n])
  return parts.join(' ')
}

function enUnder1000(n: number): string {
  const parts: string[] = []
  if (n >= 100) { parts.push(`${EN_ONES[Math.floor(n / 100)]} hundred`); n %= 100 }
  if (n >= 20) { parts.push(EN_TENS[Math.floor(n / 10)]); n %= 10 }
  if (n) parts.push(EN_ONES[n])
  return parts.join(' ')
}

export function amountInWords(value: number, lang: InvoiceLang = 'lv'): string {
  const centsTotal = Math.round(Math.max(0, value) * 100)
  let euros = Math.floor(centsTotal / 100)
  const cents = centsTotal % 100
  const groups: string[] = []
  let scale = 0
  while (euros > 0) {
    const group = euros % 1000
    if (group) {
      const lvSingular = group % 10 === 1 && group % 100 !== 11
      const scaleWord = lang === 'en'
        ? ['', 'thousand', 'million'][scale]
        : scale === 1 ? (lvSingular ? 'tūkstotis' : 'tūkstoši') : scale === 2 ? (lvSingular ? 'miljons' : 'miljoni') : ''
      groups.unshift(`${lang === 'lv' ? lvUnder1000(group) : enUnder1000(group)} ${scaleWord ?? ''}`.trim())
    }
    euros = Math.floor(euros / 1000); scale++
  }
  const words = groups.join(' ') || (lang === 'lv' ? 'nulle' : 'zero')
  return lang === 'lv'
    ? `${words.charAt(0).toUpperCase()}${words.slice(1)} eiro un ${String(cents).padStart(2, '0')} ${cents % 10 === 1 && cents % 100 !== 11 ? 'cents' : 'centi'}`
    : `${words.charAt(0).toUpperCase()}${words.slice(1)} euros and ${String(cents).padStart(2, '0')} cents`
}

function paymentLabel(method: string, lang: InvoiceLang): string {
  const labels: Record<string, [string, string]> = { bank: ['Apmaksa ar pārskaitījumu', 'Bank transfer'], card: ['Apmaksa ar karti', 'Card payment'], cash: ['Apmaksa skaidrā naudā', 'Cash'] }
  return labels[method]?.[lang === 'lv' ? 0 : 1] ?? method
}

function deliveryLabel(order: Order, address: string, city: string): string {
  const destination = [city, address, order.deliveryMethod === 'pickup' ? '' : order.postalCode].filter(Boolean).join(', ')
  if (order.deliveryMethod === 'pickup') return `Saņemšana veikalā, ${destination}`
  if (order.deliveryMethod === 'post') return `Omniva pakomāts, ${destination}`
  return `Kurjers, ${destination}`
}

/**
 * Для pickup-заказов в address/city лежит снимок адреса магазина на языке
 * оформления (в старых заказах — русский). Резолвим магазин по pickupStoreId,
 * а для старых снимков — по уникальному индексу LV-xxxx внутри строки,
 * и подставляем латышские название и адрес из data/stores.ts.
 * Адрес магазина остаётся латышским и в английском инвойсе.
 */
function lvDeliveryAddress(order: Order): { address: string; city: string } | null {
  if (order.deliveryMethod !== 'pickup') return null
  const store = order.pickupStoreId
    ? stores.find((s) => s.id === order.pickupStoreId)
    : stores.find((s) => {
        const postal = String(order.address ?? '').match(/LV-\d{4}/)
        return postal !== null && s.address.lv.includes(postal[0])
      })
  if (!store) return null
  return { address: `${translations.lv[`stores.${store.id}.name`]} — ${store.address.lv}`, city: store.city.lv }
}

/**
 * titles: карта productId → название на языке инвойса (Product.titleLv/titleEn).
 * item.title — снимок в языке корзины на момент заказа, поэтому без карты
 * название может остаться не на языке инвойса; передавайте её везде, где есть доступ к товарам.
 */
export function buildInvoiceHtml(
  order: Order,
  titles?: Record<string, string>,
  lang: InvoiceLang = 'lv',
  assetBaseUrl = ''
): string {
  const L = LABELS[lang]
  const date = formatInvoiceDate(order.createdAt)
  const pickup = lvDeliveryAddress(order)
  const buyerAddress = pickup?.address ?? order.address
  const buyerCity = pickup?.city ?? order.city

  const itemRows = order.items
    .map((item) => {
      const localTitle = titles?.[item.id] || translations[lang][`products.${item.id}.title`] || item.title
      const unitPrice = eur(item.price)
      const lineTotal = eur(item.price * item.quantity)
      return `
        <tr>
          <td>${esc(localTitle)}</td><td>${esc(item.sku ?? '')}</td><td>${unitPrice}</td><td>${item.quantity}</td><td>${lineTotal}</td>
        </tr>`
    })
    .join('')

  const discountRow = order.discount > 0
    ? `<tr><td>${L.discount}</td><td>−${eur(order.discount)}</td></tr>`
    : ''

  const taxAmount = displayOrderTax(order)
  const goodsWithoutVat = Math.max(0, order.subtotal - order.discount) / 1.21

  const invoiceNumber = esc(order.id)
  const customer = `${esc(order.firstName)} ${esc(order.lastName)}`
  const customerAddress = [buyerAddress, buyerCity, !pickup ? order.postalCode : ''].filter(Boolean).map(esc).join(', ')
  const created = new Date(order.createdAt).toLocaleString(lang === 'en' ? 'en-GB' : 'lv-LV')
  const words = amountInWords(order.total, lang)
  const logoUrl = `${assetBaseUrl.replace(/\/$/, '')}/logo.svg`

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${L.invoice} ${invoiceNumber}</title>
<style>
  @page{size:A4;margin:14mm} body{font-family:"Times New Roman",serif;font-size:13px;color:#111;margin:0;padding:24px;background:#fff;max-width:900px;margin-inline:auto}
  table{border-collapse:collapse;width:100%}
  .top{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px}.top img{width:105px;height:auto}
  .supplier{border:1px solid #555;padding:12px;margin-bottom:26px}.supplier-grid,.parties{display:grid;grid-template-columns:1fr 1fr;gap:28px}.parties{margin:0 6px 34px}.line{line-height:1.55}.section-title{font-weight:bold;margin-bottom:4px}
  .items th,.items td,.notes th,.notes td{border:1px solid #444;padding:5px}.items th,.notes th{background:#ccc;text-align:center;font-weight:normal}.items td:nth-child(2){text-align:center}.items td:nth-child(n+3){white-space:nowrap}
  .totals{width:330px;margin-left:auto}.totals td{padding:3px}.totals td:last-child{text-align:right}.total-row td{font-weight:bold}.words{margin-top:8px;text-align:right;font-weight:bold}
  .payment-info{margin-top:30px;line-height:1.5}.notes{margin-top:6px}
  @media print{body{padding:0}.top img{print-color-adjust:exact}}
</style>
</head>
<body>
<div class="top"><div><strong>${L.orderNumber}: #${invoiceNumber}</strong><br/><strong>https://hairshop.lv</strong><br/><strong>${L.orderDate}: ${date}</strong></div><img src="${esc(logoUrl)}" alt="hairshop.lv"/></div>
<div class="supplier"><div class="section-title">${L.supplier}</div><div class="supplier-grid line"><div>${L.supplierName}: ${COMPANY.name.toUpperCase()}<br/>${L.taxCode}: ${formatVatNumber()}<br/>${L.address}: ${COMPANY.legalAddress}</div><div>Bank: ${COMPANY.bankName}, SWIFT: ${COMPANY.swift}<br/>Konts: ${formatIban(COMPANY.bankAccount)}</div></div></div>
<div class="parties"><div class="line"><div class="section-title">${L.payer}</div>${L.name}: ${customer}<br/>${L.email}: ${esc(order.email)}<br/>${L.phone}: ${esc(order.phone)}<br/>${customerAddress}<br/><br/>${L.paymentMethod}: ${esc(paymentLabel(order.paymentMethod, lang))}</div><div class="line"><div class="section-title">${L.recipient}</div>${L.name}: ${customer}<br/>${L.email}: ${esc(order.email)}<br/>${L.phone}: ${esc(order.phone)}<br/>${customerAddress}<br/><br/>${L.deliveryMethod}: ${esc(deliveryLabel(order, buyerAddress || '', buyerCity || ''))}</div></div>
<div class="section-title">${L.products}</div>
<table class="items">
  <thead>
    <tr>
      <th style="width:45%">${L.product}</th><th style="width:15%">${L.sku}</th><th style="width:15%">${L.price}</th><th style="width:10%">${L.qty}</th><th style="width:15%">${L.amount}</th>
    </tr>
  </thead>
  <tbody>
    ${itemRows}
  </tbody>
</table>

<table class="totals">
  <tr><td>${lang === 'lv' ? 'Kopā bez PVN' : 'Goods excl. VAT'}</td><td>${eur(goodsWithoutVat)}</td></tr>
  ${discountRow}
  <tr><td>${L.delivery}</td><td>${eur(order.delivery)}</td></tr><tr><td>${L.tax}</td><td>${eur(taxAmount)}</td></tr><tr class="total-row"><td>${lang === 'lv' ? 'Pasūtījuma summa' : L.total}</td><td>${eur(order.total)}</td></tr>
</table>
<div class="words">${L.amountWords}: ${esc(words)}</div>
<div class="payment-info"><strong>${L.paymentReference}: ${invoiceNumber}</strong><br/><br/>${L.orderDate}: ${date}<br/><br/>${L.electronic} 100000001<br/><br/>${L.paymentWarning}<br/><strong>${L.notes}</strong></div>
<table class="notes"><thead><tr><th style="width:30%">${L.created}</th><th>${L.note}</th></tr></thead><tbody><tr><td>${created}</td><td></td></tr></tbody></table>
</body>
</html>`
}

/** Клиентский помощник: тянет названия товаров заказа на языке инвойса
 *  с /api/products/[id]; для английского фолбэк — латышское название. */
export async function fetchInvoiceTitles(
  items: Order['items'],
  lang: InvoiceLang = 'lv'
): Promise<Record<string, string>> {
  const ids = Array.from(new Set(items.map((i) => i.id)))
  const map: Record<string, string> = {}
  await Promise.all(
    ids.map(async (id) => {
      try {
        const res = await fetch(`/api/products/${encodeURIComponent(id)}`)
        if (!res.ok) return
        const data = await res.json()
        const p = data?.product
        const title = lang === 'en' ? p?.titleEn || p?.titleLv : p?.titleLv
        if (typeof title === 'string' && title.trim()) map[id] = title
      } catch {
        // нет сети/товара — останется снимок item.title
      }
    })
  )
  return map
}
