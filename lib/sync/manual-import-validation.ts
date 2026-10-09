import { auditGrinsXml, readGrinsXmlItems, type GrinsXmlAudit } from './grins-xml-parser'

// Vendor decimal notation only. No exponent, hexadecimal, separators or prefix
// parsing; whitespace around a value is harmless. PostgreSQL Product bounds.
export function manualDecimal(value: unknown, stock = false): number | null {
  const text = typeof value === 'string' || typeof value === 'number' ? String(value).trim() : ''
  if (!/^\d+(?:\.\d+)?$/u.test(text)) return null
  const number = Number(text)
  if (!Number.isFinite(number) || number > (stock ? 2_147_483_647 : 9_999_999_999.99)) return null
  if (stock && (!Number.isInteger(number) || (text.includes('.') && !/^0+$/u.test(text.split('.')[1])))) return null
  if (!stock && ((number === 0 && /[1-9]/u.test(text)) || !Number.isSafeInteger(Math.trunc(number * 100)))) return null
  if (stock) return number
  const [whole, fraction = ''] = text.split('.')
  const cents = BigInt(whole) * 100n + BigInt((fraction + '00').slice(0, 2)) + (Number(fraction[2] ?? '0') >= 5 ? 1n : 0n)
  if (cents > 999_999_999_999n || (cents === 0n && /[1-9]/u.test(text))) return null
  return Number(cents) / 100
}

/** Manual-only fail-closed gates; scheduled Hairshop.lv behavior is unchanged. */
export function auditManualXml(xml: string): GrinsXmlAudit {
  const audit = auditGrinsXml(xml)
  if (!audit.validXml) return audit
  audit.invalidPrices = []
  audit.invalidStocks = []
  for (const item of readGrinsXmlItems(xml)) {
    const sku = String(item.sku ?? '').trim()
    for (const field of ['price1', 'price2', 'price3', 'price4'] as const) {
      if (manualDecimal(item[field]) === null) audit.invalidPrices.push({ sku, field, value: String(item[field] ?? '') })
    }
    if (manualDecimal(item.quantity, true) === null) audit.invalidStocks.push({ sku, field: 'quantity', value: String(item.quantity ?? '') })
    const slots = new Set<string>()
    let selected = 0
    for (const warehouse of item.warehouses?.warehouse ?? []) {
      const slot = String(warehouse['@_id'] ?? '').trim()
      const value = manualDecimal(warehouse['#text'], true)
      if (!/^[1-9]$/u.test(slot) || slots.has(slot) || value === null) {
        audit.invalidStocks.push({ sku, field: `warehouse:${slot}`, value: String(warehouse['#text'] ?? '') })
      }
      slots.add(slot)
      if (['1', '2', '3', '6'].includes(slot)) selected += value ?? 0
    }
    for (let slot = 1; slot <= 9; slot++) if (!slots.has(String(slot))) {
      audit.invalidStocks.push({ sku, field: `warehouse:${slot}`, value: 'missing' })
    }
    if (selected > 2_147_483_647) audit.invalidStocks.push({ sku, field: 'selectedStock', value: String(selected) })
  }
  return audit
}
