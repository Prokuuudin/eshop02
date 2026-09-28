// Product ↔ ERP SKU pairs proven to be different goods. They look like exact matches
// (same SKU and even the same internal 2xx barcode), so any externalId writer must refuse
// them explicitly instead of relying on matching evidence. Add entries only after an audit.
export const KNOWN_WRONG_EXTERNAL_ID_LINKS: ReadonlyArray<{ productId: string; externalId: string; reason: string }> = [
  {
    productId: '19073',
    externalId: 'BLK',
    reason: 'ERP BLK is "BLACK Sintesis Krāsu Katalogs" (colour catalogue, price2=0); Product 19073 is the 5-variant BLACK PROFESSIONAL LINE oxidant card (audit 2026-09-28)',
  },
]

export function isKnownWrongExternalIdLink(productId: string, externalId: string): boolean {
  return KNOWN_WRONG_EXTERNAL_ID_LINKS.some(link => link.productId === productId && link.externalId === externalId)
}

export function assertNoKnownWrongExternalIdLinks(links: ReadonlyArray<{ productId: string; externalId: string }>): void {
  const blocked = links.filter(link => isKnownWrongExternalIdLink(link.productId, link.externalId))
  if (blocked.length) {
    throw new Error(`Refusing known-wrong externalId link(s): ${blocked.map(link => `${link.productId}→${link.externalId}`).join(', ')}`)
  }
}
