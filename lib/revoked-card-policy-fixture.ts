// Test-only fixture: a structurally valid revoked-card registry made of synthetic numbers.
// It is never imported by application code and contains no real client data.
import { computeRevokedCardChecksum, REVOKED_CARD_BATCH_SIZE, type RevokedCardEntry } from '@/lib/revoked-card-policy'

export const PRESERVED_OWNER_ID = 'u-preserved-5555'

/** `extra` maps card number → userId; card 5555 (preserveLogin) is always included. */
export function buildRevokedCardValue(extra: Record<string, string> = {}): Record<string, unknown> {
  const cards: Record<string, RevokedCardEntry> = {
    '5555': { userId: PRESERVED_OWNER_ID, preserveLogin: true },
  }
  for (const [cardNumber, userId] of Object.entries(extra)) cards[cardNumber] = { userId, preserveLogin: false }
  for (let n = 900001; Object.keys(cards).length < REVOKED_CARD_BATCH_SIZE; n++) {
    cards[String(n)] = { userId: `u-synthetic-${n}`, preserveLogin: false }
  }
  return { active: true, source: 'test-fixture', checksum: computeRevokedCardChecksum(cards), cards }
}

export function revokedCardRow(value: unknown, updatedAt = new Date('2026-11-16T10:00:00Z')): { value: unknown; updatedAt: Date } {
  return { value, updatedAt }
}

/** Value of the admin-panel revocation row: card number → former holder's userId. */
export function buildAdminRevocationValue(cards: Record<string, string>): { cards: Record<string, unknown> } {
  return {
    cards: Object.fromEntries(Object.entries(cards).map(([cardNumber, userId]) => [
      cardNumber, { userId, revokedAt: '2026-11-17T10:00:00.000Z', revokedBy: 'admin-1', reason: 'Card lost' },
    ])),
  }
}

/** keyValueSetting.findUnique answering the batch row and the admin-panel row by key. */
export function revokedCardRows(batch: unknown, admin: unknown): (args: { where: { key: string } }) => Promise<unknown> {
  return async ({ where }: { where: { key: string } }) => (where.key === 'revoked-client-cards:admin:v1' ? admin : batch)
}
