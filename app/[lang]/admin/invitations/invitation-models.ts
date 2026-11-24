export type Holder = {
  userId: string
  name: string | null
  email: string
  phone: string | null
  cardNumber: string
  status: 'none' | 'sent' | 'accepted' | 'expired' | 'error'
  sentAt: string | null
  inviteUrl: string | null
  /** «Рассылки запрещены»: no email or phone invitation may be sent (the server enforces it). */
  marketingSuppressed?: boolean
}

export type CampaignState = {
  sentCount: number
  errorCount: number
  cursor: string | null
  lastRunAt: string | null
  finished: boolean
  runningSince: string | null
}

export type EligibleUser = { id: string; name: string | null; email: string; marketingSuppressed?: boolean }
export type HolderSortKey = 'name' | 'email' | 'cardNumber' | 'status'
export type EligibleSortKey = 'name' | 'email' | 'status'
export type SortDir = 'asc' | 'desc'
export type HolderContactFilter = 'all' | 'emailOnly' | 'phoneOnly' | 'complete' | 'none'
export type HolderInvitationFilter = 'all' | 'invited' | 'notInvited'
export type HolderMailingFilter = 'all' | 'suppressed' | 'allowed'

export const isTechEmail = (email: string): boolean => email.toLowerCase().endsWith('@client.local')
export const HOLDER_STATUS_RANK: Record<Holder['status'], number> = { none: 0, sent: 1, accepted: 2, expired: 3, error: 4 }
export const INVITATIONS_PAGE_SIZE = 50
export const INVITE_BATCH_SIZE = 20
// Email chunks stay small: each request holds one DB transaction (~7 round-trips
// per client to Neon) and then mails every client of the chunk over SMTP.
export const EMAIL_INVITE_BATCH_SIZE = 5

export type BulkInviteTally = { sent: number; skipped: number; failed: number; suppressed: number }

/**
 * Counts one chunk's response. `suppressed` = left out because of «Рассылки запрещены».
 * Ids the server did not return (no email, staff) count as skipped.
 */
export function tallyInviteChunk(requested: number, results: Array<{ status: string }>): BulkInviteTally {
  const sent = results.filter((r) => r.status === 'sent').length
  const failed = results.filter((r) => r.status === 'error').length
  const suppressed = results.filter((r) => r.status === 'suppressed').length
  return { sent, failed, suppressed, skipped: requested - sent - failed - suppressed }
}

export type BulkInviteOutcome = 'done' | 'partial' | 'failed' | 'stopped'

/** 'done' only when nothing failed and every chunk got an answer. */
export function bulkInviteOutcome(tally: Omit<BulkInviteTally, 'suppressed'> & { suppressed?: number }, opts: { requestFailed: boolean; stopped: boolean }): BulkInviteOutcome {
  if (opts.requestFailed || tally.failed > 0) return tally.sent > 0 ? 'partial' : 'failed'
  if (opts.stopped) return 'stopped'
  return 'done'
}

export function nextSort<Key extends string>(
  current: { key: Key; dir: SortDir } | null,
  key: Key
): { key: Key; dir: SortDir } | null {
  if (!current || current.key !== key) return { key, dir: 'asc' }
  if (current.dir === 'asc') return { key, dir: 'desc' }
  return null
}

export function sortHoldersByStatus(holders: Holder[], direction: SortDir): Holder[] {
  const multiplier = direction === 'asc' ? 1 : -1
  return [...holders].sort(
    (left, right) => (HOLDER_STATUS_RANK[left.status] - HOLDER_STATUS_RANK[right.status]) * multiplier
  )
}

export function isEligibleUserSent(userId: string, cursor: string | null | undefined): boolean {
  return !!cursor && userId <= cursor
}

export function sortEligibleByStatus(
  users: EligibleUser[],
  cursor: string | null | undefined,
  direction: SortDir
): EligibleUser[] {
  const multiplier = direction === 'asc' ? 1 : -1
  return [...users].sort(
    (left, right) => (Number(isEligibleUserSent(left.id, cursor)) - Number(isEligibleUserSent(right.id, cursor))) * multiplier
  )
}
