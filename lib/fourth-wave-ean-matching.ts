export type BarcodeQuality = {
  kind: 'VALID_STANDARD' | 'INVALID_STANDARD_LOOKING' | 'INTERNAL_NON_STANDARD'
  length: number
  digitsOnly: boolean
  leadingZero: boolean
  checksumValid: boolean | null
}

export type Measurement = { value: number; unit: string }

export function barcodeQuality(value: string): BarcodeQuality {
  const digitsOnly = /^\d+$/u.test(value)
  const standard = digitsOnly && [8, 12, 13].includes(value.length)
  let checksumValid: boolean | null = null
  if (standard) {
    const digits = [...value].map(Number)
    const check = digits.pop()!
    const sum = digits.reduce((total, digit, index) => {
      const positionFromRight = digits.length - index
      return total + digit * (positionFromRight % 2 === 1 ? 3 : 1)
    }, 0)
    checksumValid = (10 - (sum % 10)) % 10 === check
  }
  return {
    kind: standard ? (checksumValid ? 'VALID_STANDARD' : 'INVALID_STANDARD_LOOKING') : 'INTERNAL_NON_STANDARD',
    length: value.length,
    digitsOnly,
    leadingZero: value.startsWith('0'),
    checksumValid,
  }
}

export function normalizeName(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase('en-US').replace(/&(?:amp;)?quot;|[`'’]/gu, '')
    .replace(/[^\p{L}\p{N}%+]+/gu, ' ').trim().replace(/\s+/gu, ' ')
}

export function nameTokens(value: string): string[] {
  return normalizeName(value).split(' ').filter(token => token.length > 1)
}

export function diceSimilarity(left: string, right: string): number {
  const a = new Set(nameTokens(left)); const b = new Set(nameTokens(right))
  if (!a.size || !b.size) return 0
  let common = 0
  for (const token of a) if (b.has(token)) common += 1
  return 2 * common / (a.size + b.size)
}

const UNIT: Record<string, string> = { ml: 'ml', 'мл': 'ml', l: 'l', g: 'g', 'г': 'g', kg: 'kg', 'кг': 'kg', mm: 'mm', 'мм': 'mm', cm: 'cm', 'см': 'cm', '%': '%', gab: 'pack', gabali: 'pack', pcs: 'pack', psc: 'pack', kps: 'pack', 'шт': 'pack' }

export function measurements(value: string): Measurement[] {
  const normalized = normalizeName(value).replace(/(\d),(\d)/gu, '$1.$2')
  const result: Measurement[] = []
  const re = /(^|\s)(\d+(?:\.\d+)?)\s*(ml|мл|kg|кг|mm|мм|cm|см|l|g|г|%|gab(?:ali)?|pcs|psc|kps|шт)(?=\b|\s|$)/giu
  for (const match of normalized.matchAll(re)) {
    let amount = Number(match[2]); let unit = UNIT[match[3].toLocaleLowerCase('en-US')]
    if (unit === 'l') { amount *= 1000; unit = 'ml' }
    if (unit === 'kg') { amount *= 1000; unit = 'g' }
    result.push({ value: amount, unit })
  }
  return result
}

export function numericTokens(value: string): string[] {
  return [...new Set(normalizeName(value).match(/\d+(?:[.,]\d+)?/gu)?.map(x => String(Number(x.replace(',', '.')))) ?? [])]
}

export function measurementConflicts(left: string, right: string): string[] {
  const a = measurements(left); const b = measurements(right); const conflicts: string[] = []
  for (const unit of new Set(a.map(x => x.unit).filter(unit => b.some(x => x.unit === unit)))) {
    const av = [...new Set(a.filter(x => x.unit === unit).map(x => x.value))]
    const bv = [...new Set(b.filter(x => x.unit === unit).map(x => x.value))]
    if (!av.some(value => bv.includes(value))) conflicts.push(`${av.join('|')}${unit} != ${bv.join('|')}${unit}`)
  }
  return conflicts
}

export function csv(rows: Record<string, unknown>[], columns?: string[]): string {
  const cols = columns ?? [...new Set(rows.flatMap(Object.keys))]
  const quote = (value: unknown) => `"${String(value ?? '').replace(/"/gu, '""')}"`
  return '\ufeff' + [cols.map(quote).join(','), ...rows.map(row => cols.map(col => quote(row[col])).join(','))].join('\n') + '\n'
}
