const PRICE_FIELDS = new Set([
  'price',
  'oldPrice',
  'priceAdjustment',
  'pricePerUnit',
  'bulkPricingTiers',
  'bonusRate',
  'discount',
  'discountAmount',
  'discountPercent',
  'discountRate',
  'coefficient',
  'multiplier',
  'campaignOffers',
  'secondItemOffers',
])

/** Technical values: a link or a code is not prose, and rewriting it would break it. */
const NON_TEXT_FIELDS = new Set([
  'id', 'sku', 'barcode', 'externalId', 'titleKey', 'slug', 'category', 'badges',
  'image', 'images', 'ogImage', 'src', 'url', 'link', 'relatedProductIds', 'oftenBoughtTogether',
])

/** Variant groups are stored as a JSON string, so a walk over object keys alone never sees inside. */
const VARIANT_GROUPS_FIELD = '__variantGroupsJson'

const NUMBER = String.raw`\d{1,3}(?:[  ]?\d{3})*(?:[.,]\d{1,2})?`
const SYMBOL = String.raw`(?:€|&euro;|&#8364;|&#x20ac;)`
const CURRENCY_WORD = 'eur|euro|euros|eiro|евро'
// A number may touch its currency ("20EUR"), but a currency word needs its own boundaries: "Douceur
// 250ML" and "Euro Plug" are not prices. No lookbehind: this module also reaches the client bundle.
const PRICE_MENTION_SOURCE = [
  String.raw`${NUMBER}\s*(?:${SYMBOL}|(?:${CURRENCY_WORD})(?![\p{L}\d]))`,
  String.raw`${SYMBOL}\s*${NUMBER}`,
  String.raw`(^|[^\p{L}\d])eur\s*${NUMBER}(?![\p{L}\d])`,
].join('|')
const PRICE_MENTION = new RegExp(PRICE_MENTION_SOURCE, 'iu')
const PRICE_MENTIONS = new RegExp(PRICE_MENTION_SOURCE, 'giu')
const hasPriceMention = (text: string): boolean => PRICE_MENTION.test(text)

/**
 * Removes price mentions from free text. Legacy imports put amounts into product descriptions and SEO
 * fields ("tikai par 7.74 €"). A mentioning sentence goes as a whole, so no text like "only for" is
 * left dangling; when the whole text is one sentence, only the amount goes, so a name stays usable.
 */
export function stripPriceMentions(text: string): string {
  if (!hasPriceMention(text)) return text

  const parts = text.split(/([.!?…]\s+|\n+)/u)
  let kept = ''
  for (let index = 0; index < parts.length; index += 2) {
    const sentence = parts[index] ?? ''
    const delimiter = parts[index + 1] ?? ''
    if (!hasPriceMention(sentence)) kept += sentence + delimiter
  }
  if (kept.trim()) return kept.trim()

  return text
    .replace(PRICE_MENTIONS, (_match, prefix?: string) => prefix ?? '')
    .replace(/\s{2,}/gu, ' ')
    .trim()
}

function redactVariantGroups(json: string): string | undefined {
  try {
    return JSON.stringify(redactValue(JSON.parse(json)))
  } catch {
    // What cannot be read cannot be cleaned, so it does not cross the boundary.
    return undefined
  }
}

function redactValue(value: unknown, key?: string): unknown {
  if (typeof value === 'string') return key && NON_TEXT_FIELDS.has(key) ? value : stripPriceMentions(value)
  if (Array.isArray(value)) return value.map((item) => redactValue(item, key))
  if (!value || typeof value !== 'object' || value instanceof Date) return value

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([field]) => !PRICE_FIELDS.has(field))
      .flatMap(([field, nested]): Array<[string, unknown]> => {
        if (field !== VARIANT_GROUPS_FIELD || typeof nested !== 'string') return [[field, redactValue(nested, field)]]
        const redacted = redactVariantGroups(nested)
        return redacted === undefined ? [] : [[field, redacted]]
      })
  )
}

/**
 * Removes every monetary catalog field, and price mentions in free text, before data crosses a public
 * boundary. The recursive pass also covers variant price adjustments, nested both in product
 * configuration objects and in the JSON string technicalSpecs.__variantGroupsJson.
 */
export function redactProductPrices<T>(value: T): T {
  return redactValue(value) as T
}
