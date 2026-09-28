export type NormalizationType = 'LEADING_ZERO_NORMALIZATION' | 'DOT_NORMALIZATION' | 'INTERNAL_SPACE_NORMALIZATION'

export type NormalizedSkuRelation = {
  type: NormalizationType
  normalizedKey: string
}

const trim = (value: string) => value.trim()

export function leadingZeroKey(value: string): string | null {
  const exact = trim(value)
  if (!/^\d+$/u.test(exact)) return null
  return exact.replace(/^0+(?=\d)/u, '')
}

export function dotKey(value: string): string {
  return trim(value).replace(/\./gu, '')
}

export function internalSpaceKey(value: string): string {
  return trim(value).replace(/[ \u00a0]+/gu, '')
}

export function typedNormalizedRelation(localSku: string, xmlSku: string): NormalizedSkuRelation | null {
  const local = trim(localSku)
  const xml = trim(xmlSku)
  if (!local || !xml || local === xml || local.toLocaleLowerCase('en-US') === xml.toLocaleLowerCase('en-US')) return null

  const matches: NormalizedSkuRelation[] = []
  const localLeading = leadingZeroKey(local)
  const xmlLeading = leadingZeroKey(xml)
  if (localLeading !== null && xmlLeading !== null && localLeading === xmlLeading) {
    matches.push({ type: 'LEADING_ZERO_NORMALIZATION', normalizedKey: localLeading })
  }
  if ((local.includes('.') || xml.includes('.')) && dotKey(local) === dotKey(xml)) {
    matches.push({ type: 'DOT_NORMALIZATION', normalizedKey: dotKey(local) })
  }
  if ((/[ \u00a0]/u.test(local) || /[ \u00a0]/u.test(xml)) && internalSpaceKey(local) === internalSpaceKey(xml)) {
    matches.push({ type: 'INTERNAL_SPACE_NORMALIZATION', normalizedKey: internalSpaceKey(local) })
  }
  return matches.length === 1 ? matches[0] : null
}

export function normalizedKey(type: NormalizationType, value: string): string | null {
  if (type === 'LEADING_ZERO_NORMALIZATION') return leadingZeroKey(value)
  if (type === 'DOT_NORMALIZATION') return dotKey(value)
  return internalSpaceKey(value)
}

const fold = (value: string) => value.normalize('NFKC').toLocaleLowerCase('en-US')
const tokens = (value: string) => [...new Set(fold(value).replace(/[^\p{L}\p{N}]+/gu, ' ').split(/\s+/u).filter(token => token.length > 1))]

export function nameSimilarity(a: string, b: string): number {
  const aa = new Set(tokens(a))
  const bb = new Set(tokens(b))
  if (!aa.size || !bb.size) return 0
  let common = 0
  for (const token of aa) if (bb.has(token)) common++
  return (2 * common) / (aa.size + bb.size)
}

export function extractMeasures(value: string): string[] {
  const result = new Set<string>()
  const pattern = /(\d+(?:[.,]\d+)?)\s*(ml|мл|g|gr|гр|kg|кг|l|л)\b/giu
  for (const match of value.matchAll(pattern)) {
    const amount = Number(match[1].replace(',', '.'))
    const unit = match[2].toLocaleLowerCase('en-US')
    if (['l', 'л'].includes(unit)) result.add(`${amount * 1000}ml`)
    else if (['kg', 'кг'].includes(unit)) result.add(`${amount * 1000}g`)
    else if (['ml', 'мл'].includes(unit)) result.add(`${amount}ml`)
    else result.add(`${amount}g`)
  }
  return [...result].sort()
}

export function hasMeasureConflict(localName: string, xmlName: string): boolean {
  const local = extractMeasures(localName)
  const xml = extractMeasures(xmlName)
  return local.length > 0 && xml.length > 0 && !local.some(value => xml.includes(value))
}

export type IdentityGateInput = {
  relation: NormalizedSkuRelation | null
  localNormalizedCount: number
  xmlNormalizedCount: number
  exactLocalXmlSkuCount: number
  existingExternalIdClaimants: number
  competingUnlinkedProducts: number
  deferredIntersection: boolean
  alreadyResolved: boolean
  localEan: string
  xmlEan: string
  localEanCount: number
  xmlEanCount: number
  localName: string
  xmlName: string
}

export type IdentityClassification = 'FIFTH_WAVE_SAFE_CANDIDATE' | 'MANUAL_REVIEW' | 'REJECTED_MATCH' | 'ALREADY_RESOLVED'

export function classifyNormalizedIdentity(input: IdentityGateInput): { classification: IdentityClassification; reasons: string[] } {
  if (input.alreadyResolved) return { classification: 'ALREADY_RESOLVED', reasons: ['Product already has externalId'] }
  if (!input.relation) return { classification: 'MANUAL_REVIEW', reasons: ['No single typed normalization explains the pair'] }
  if (input.deferredIntersection) return { classification: 'MANUAL_REVIEW', reasons: ['Intersects a deferred/manual/rejected group'] }
  if (input.localNormalizedCount !== 1 || input.xmlNormalizedCount !== 1 || input.exactLocalXmlSkuCount || input.existingExternalIdClaimants || input.competingUnlinkedProducts) {
    return { classification: 'MANUAL_REVIEW', reasons: ['Normalized key or target has competing claims'] }
  }
  if (input.localEan && input.xmlEan) {
    if (input.localEan !== input.xmlEan) return { classification: 'REJECTED_MATCH', reasons: ['Local barcode contradicts XML EAN'] }
    if (input.localEanCount !== 1 || input.xmlEanCount !== 1) return { classification: 'MANUAL_REVIEW', reasons: ['EAN is not globally unique'] }
  }
  if (hasMeasureConflict(input.localName, input.xmlName)) return { classification: 'REJECTED_MATCH', reasons: ['Volume/size contradicts XML product'] }
  const similarity = nameSimilarity(input.localName, input.xmlName)
  if (similarity < 0.25) return { classification: 'REJECTED_MATCH', reasons: [`Product identity conflicts with XML name (similarity ${similarity.toFixed(3)})`] }
  if (!input.localEan && similarity < 0.4) return { classification: 'MANUAL_REVIEW', reasons: [`No EAN and name evidence is not strong enough (similarity ${similarity.toFixed(3)})`] }
  return { classification: 'FIFTH_WAVE_SAFE_CANDIDATE', reasons: [input.localEan ? 'Unique exact EAN and compatible identity' : `Unique normalized direction and strong name/size evidence (similarity ${similarity.toFixed(3)})`] }
}
