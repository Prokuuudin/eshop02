export const GTIN_LENGTHS = [8, 12, 13, 14] as const

export type GtinFormat = 'gtin_8' | 'gtin_12' | 'gtin_13' | 'gtin_14'

export type NormalizedGtin =
  | { kind: 'missing' }
  | { kind: 'valid_gtin'; value: string; format: GtinFormat }
  | { kind: 'legacy_barcode'; value: string; reason: 'non_numeric' | 'non_standard_length' | 'invalid_check_digit' | 'too_long' }

export type MeasureSizeValue = { dimension: 'volume' | 'mass'; unit: 'ml' | 'g'; amountMilli: number }

export type SizeValue =
  | ({ kind: 'single' } & MeasureSizeValue)
  | { kind: 'count'; unit: 'pcs'; count: number }
  | { kind: 'multipack'; count: number; item: MeasureSizeValue }

export type NormalizedSize =
  | { kind: 'unknown' }
  | { kind: 'ambiguous' }
  | { kind: 'known'; value: SizeValue; key: string }

export type NormalizedTitle = {
  value: string | null
  tokens: string[]
  tokenKey: string | null
  numericTokens: string[]
  productKinds: string[]
  hasRefillMarker: boolean
  hasSetMarker: boolean
  gender: 'male' | 'female' | null
}

const MAX_IDENTIFIER_LENGTH = 200
const DECIMAL_PATTERN = String.raw`\d+(?:[.,]\d{1,3})?`
const MEASURE_UNIT_PATTERN = String.raw`(?:ml|мл|kg|кг|gr|гр|g|г|l|л)`
const COUNT_UNIT_PATTERN = String.raw`(?:pcs?|gab(?:ali)?|шт\.?)`

const PRODUCT_KIND_ALIASES: Readonly<Record<string, string>> = {
  shampoo: 'shampoo',
  shampoing: 'shampoo',
  'шампунь': 'shampoo',
  'šampūns': 'shampoo',
  conditioner: 'conditioner',
  'кондиционер': 'conditioner',
  kondicionieris: 'conditioner',
  mask: 'mask',
  'маска': 'mask',
  maska: 'mask',
  serum: 'serum',
  'сыворотка': 'serum',
  serums: 'serum',
  oil: 'oil',
  'масло': 'oil',
  'eļļa': 'oil',
}

const REFILL_MARKERS = new Set(['refill', 'refil', 'uzpilde', 'сменный', 'сменная', 'запасной', 'запасная'])
const SET_MARKERS = new Set(['set', 'kit', 'набор', 'комплект', 'komplekts'])
const MALE_MARKERS = new Set(['men', 'man', 'male', 'homme', 'мужской', 'мужская', 'vīriešiem'])
const FEMALE_MARKERS = new Set(['women', 'woman', 'female', 'femme', 'женский', 'женская', 'sievietēm'])

function clean(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.normalize('NFKC').trim()
  return normalized && normalized.length <= MAX_IDENTIFIER_LENGTH ? normalized : null
}

function gtinCheckDigitIsValid(value: string): boolean {
  const digits = [...value].map(Number)
  const checkDigit = digits.pop()
  if (checkDigit === undefined) return false
  const sum = digits.reduce((total, digit, index) => {
    const positionFromRight = digits.length - index
    return total + digit * (positionFromRight % 2 === 1 ? 3 : 1)
  }, 0)
  return (10 - (sum % 10)) % 10 === checkDigit
}

/** Leading zeroes are identity data. Legacy barcode-like values are classified, never treated as GTIN. */
export function normalizeGtin(value: string | null | undefined): NormalizedGtin {
  if (typeof value !== 'string' || !value.trim()) return { kind: 'missing' }
  const raw = value.normalize('NFKC').trim()
  if (raw.length > MAX_IDENTIFIER_LENGTH) return { kind: 'legacy_barcode', value: raw.slice(0, MAX_IDENTIFIER_LENGTH), reason: 'too_long' }
  const compact = raw.replace(/[\s\u00a0\u202f-]+/gu, '')
  if (!/^\d+$/u.test(compact)) return { kind: 'legacy_barcode', value: raw, reason: 'non_numeric' }
  if (!(GTIN_LENGTHS as readonly number[]).includes(compact.length)) {
    return { kind: 'legacy_barcode', value: compact, reason: 'non_standard_length' }
  }
  if (!gtinCheckDigitIsValid(compact)) return { kind: 'legacy_barcode', value: compact, reason: 'invalid_check_digit' }
  return { kind: 'valid_gtin', value: compact, format: `gtin_${compact.length}` as GtinFormat }
}

/** Case/Unicode/whitespace normalization only. Punctuation remains identity-significant. */
export function normalizeSku(value: string | null | undefined): string | null {
  const cleaned = clean(value)
  return cleaned ? cleaned.replace(/\s+/gu, ' ').toLocaleLowerCase('en-US') : null
}

function normalizeWords(value: string | null | undefined): string | null {
  const cleaned = clean(value?.replace(/№/gu, ' '))
  if (!cleaned) return null
  const normalized = cleaned.toLocaleLowerCase('en-US').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/gu, ' ')
  return normalized || null
}

/** No fuzzy aliases or diacritic removal: L'Oréal and Loreal intentionally remain different. */
export function normalizeBrand(value: string | null | undefined): string | null {
  return normalizeWords(value)
}

export function normalizeTitleText(value: string | null | undefined): string | null {
  return normalizeWords(value)
}

function canonicalDecimalToken(value: string): string {
  const normalized = value.replace(',', '.')
  const [whole = '0', fraction = ''] = normalized.split('.')
  const canonicalWhole = whole.replace(/^0+(?=\d)/u, '')
  const canonicalFraction = fraction.replace(/0+$/u, '')
  return canonicalFraction ? `${canonicalWhole}.${canonicalFraction}` : canonicalWhole
}

function stripRecognizedSizes(value: string): string {
  const multipack = new RegExp(String.raw`(^|[^\p{L}\p{N}])\d+\s*(?:x|×)\s*${DECIMAL_PATTERN}\s*${MEASURE_UNIT_PATTERN}(?=$|[^\p{L}\p{N}])`, 'giu')
  const measure = new RegExp(String.raw`(^|[^\p{L}\p{N}])${DECIMAL_PATTERN}\s*${MEASURE_UNIT_PATTERN}(?=$|[^\p{L}\p{N}])`, 'giu')
  const count = new RegExp(String.raw`(^|[^\p{L}\p{N}])\d+\s*${COUNT_UNIT_PATTERN}(?=$|[^\p{L}\p{N}])`, 'giu')
  return value.replace(multipack, '$1 ').replace(measure, '$1 ').replace(count, '$1 ')
}

export function normalizeTitle(value: string | null | undefined): NormalizedTitle {
  const normalized = normalizeTitleText(value)
  // Size has its own strict comparison layer. Removing only recognized size
  // expressions lets "0.25 l" and "250 ml" share title identity while model,
  // shade and all other numbers remain significant.
  const identityText = normalizeTitleText(stripRecognizedSizes(value?.replace(/№/gu, ' ').normalize('NFKC') ?? ''))
  const tokens = identityText?.split(' ').filter(Boolean) ?? []
  const kinds = [...new Set(tokens.map((token) => PRODUCT_KIND_ALIASES[token]).filter((kind): kind is string => Boolean(kind)))].sort()
  const numericTokens = [...new Set((stripRecognizedSizes(value?.normalize('NFKC') ?? '').match(/\d+(?:[.,]\d+)?/gu) ?? []).map(canonicalDecimalToken))].sort()
  const male = tokens.some((token) => MALE_MARKERS.has(token))
  const female = tokens.some((token) => FEMALE_MARKERS.has(token))

  return {
    value: normalized,
    tokens,
    tokenKey: tokens.length ? [...tokens].sort().join('|') : null,
    numericTokens,
    productKinds: kinds,
    hasRefillMarker: tokens.some((token) => REFILL_MARKERS.has(token)),
    hasSetMarker: tokens.some((token) => SET_MARKERS.has(token)),
    gender: male === female ? null : male ? 'male' : 'female',
  }
}

export function titleDiceSimilarity(left: NormalizedTitle, right: NormalizedTitle): number {
  const a = new Set(left.tokens)
  const b = new Set(right.tokens)
  if (a.size === 0 || b.size === 0) return 0
  let common = 0
  for (const token of a) if (b.has(token)) common += 1
  return (2 * common) / (a.size + b.size)
}

function decimalToMilli(value: string, multiplier: 1 | 1_000): number | null {
  const normalized = value.replace(',', '.')
  if (!/^\d+(?:\.\d{1,3})?$/u.test(normalized)) return null
  const [whole, fraction = ''] = normalized.split('.')
  try {
    const milli = (BigInt(whole) * 1_000n + BigInt(fraction.padEnd(3, '0'))) * BigInt(multiplier)
    return milli <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(milli) : null
  } catch {
    return null
  }
}

function normalizedMeasure(value: string, unitValue: string): MeasureSizeValue | null {
  const unit = unitValue.toLocaleLowerCase('en-US').replace(/\.$/u, '')
  const volume = ['ml', 'мл', 'l', 'л'].includes(unit)
  const mass = ['g', 'gr', 'г', 'гр', 'kg', 'кг'].includes(unit)
  if (!volume && !mass) return null
  const multiplier: 1 | 1_000 = ['l', 'л', 'kg', 'кг'].includes(unit) ? 1_000 : 1
  const amountMilli = decimalToMilli(value, multiplier)
  if (amountMilli === null || amountMilli <= 0) return null
  return volume
    ? { dimension: 'volume', unit: 'ml', amountMilli }
    : { dimension: 'mass', unit: 'g', amountMilli }
}

export function sizeValueKey(value: SizeValue): string {
  if (value.kind === 'count') return `count:${value.count}:pcs`
  if (value.kind === 'multipack') return `pack:${value.count}x${value.item.amountMilli}:${value.item.unit}`
  return `single:${value.amountMilli}:${value.unit}`
}

/** A multipack retains its structure: 2×250 ml is intentionally not equal to a single 500 ml item. */
export function parseSize(value: string | null | undefined): NormalizedSize {
  if (typeof value !== 'string' || !value.trim()) return { kind: 'unknown' }
  const input = value.normalize('NFKC').toLocaleLowerCase('en-US')
  const multipackPattern = new RegExp(String.raw`(^|[^\p{L}\p{N}])(\d+)\s*(?:x|×)\s*(${DECIMAL_PATTERN})\s*(${MEASURE_UNIT_PATTERN})(?=$|[^\p{L}\p{N}])`, 'giu')
  const measurePattern = new RegExp(String.raw`(^|[^\p{L}\p{N}])(${DECIMAL_PATTERN})\s*(${MEASURE_UNIT_PATTERN})(?=$|[^\p{L}\p{N}])`, 'giu')
  const countPattern = new RegExp(String.raw`(^|[^\p{L}\p{N}])(\d+)\s*(${COUNT_UNIT_PATTERN})(?=$|[^\p{L}\p{N}])`, 'giu')
  const multipacks = [...input.matchAll(multipackPattern)]
  const measures = [...input.matchAll(measurePattern)]
  const counts = [...input.matchAll(countPattern)]

  if (multipacks.length > 0) {
    if (multipacks.length !== 1 || measures.length !== 1 || counts.length > 0) return { kind: 'ambiguous' }
    const count = Number(multipacks[0][2])
    const item = normalizedMeasure(multipacks[0][3], multipacks[0][4])
    if (!Number.isSafeInteger(count) || count <= 1 || !item) return { kind: 'ambiguous' }
    const size: SizeValue = { kind: 'multipack', count, item }
    return { kind: 'known', value: size, key: sizeValueKey(size) }
  }

  if (measures.length > 0 && counts.length > 0) return { kind: 'ambiguous' }
  if (measures.length > 0) {
    const values = measures.map((match) => normalizedMeasure(match[2], match[3])).filter((item): item is MeasureSizeValue => item !== null)
    const unique = new Map(values.map((item) => [`${item.amountMilli}:${item.unit}`, item]))
    if (unique.size !== 1 || values.length !== measures.length) return { kind: 'ambiguous' }
    const item = [...unique.values()][0]
    const size: SizeValue = { kind: 'single', ...item }
    return { kind: 'known', value: size, key: sizeValueKey(size) }
  }
  if (counts.length > 0) {
    const values = [...new Set(counts.map((match) => Number(match[2])).filter((count) => Number.isSafeInteger(count) && count > 0))]
    if (values.length !== 1 || values.length !== counts.length) return { kind: 'ambiguous' }
    const size: SizeValue = { kind: 'count', unit: 'pcs', count: values[0] }
    return { kind: 'known', value: size, key: sizeValueKey(size) }
  }
  return { kind: 'unknown' }
}

export function resolveSize(...sources: Array<string | null | undefined>): NormalizedSize {
  const parsed = sources.map(parseSize)
  if (parsed.some((size) => size.kind === 'ambiguous')) return { kind: 'ambiguous' }
  const known = parsed.filter((size): size is Extract<NormalizedSize, { kind: 'known' }> => size.kind === 'known')
  if (known.length === 0) return { kind: 'unknown' }
  const keys = new Set(known.map((size) => size.key))
  return keys.size === 1 ? known[0] : { kind: 'ambiguous' }
}
