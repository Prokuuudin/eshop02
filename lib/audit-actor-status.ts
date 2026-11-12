import { isStaffSubject } from '@/lib/admin-permissions'

/**
 * Current standing of an audit-log actor. AuditLog keeps the e-mail as it was when the action
 * happened (and is never rewritten), so the admin filter lists former and deleted actors too;
 * this lets the UI label them without touching the log.
 *   staff   - the account still has admin-panel access
 *   former  - the account exists but no longer has admin-panel access
 *   deleted - the recorded actor account no longer exists
 *   unknown - no actor id was recorded and no account has that e-mail
 */
export type AuditActorStatus = 'staff' | 'former' | 'deleted' | 'unknown'

export type AuditActorEntry = { adminEmail: string; actorUserId: string | null }
export type AuditActorUser = { id: string; email: string; platformRole: string; teamRole: string | null }

const RANK: Record<AuditActorStatus, number> = { unknown: 0, deleted: 1, former: 2, staff: 3 }

/** One e-mail can cover several actor accounts; the most privileged standing wins. */
export function mergeAuditActorStatuses(
  ...maps: Array<Record<string, AuditActorStatus> | undefined>
): Record<string, AuditActorStatus> {
  const merged: Record<string, AuditActorStatus> = {}
  for (const map of maps) {
    for (const [email, status] of Object.entries(map ?? {})) {
      const current = merged[email]
      if (!current || RANK[status] > RANK[current]) merged[email] = status
    }
  }
  return merged
}

/** Lookups needed to classify these entries: actor ids, and e-mails only where no id was recorded. */
export function auditActorLookups(entries: AuditActorEntry[]): { ids: string[]; emails: string[] } {
  const ids = new Set<string>()
  const emails = new Set<string>()
  for (const entry of entries) {
    if (entry.actorUserId) ids.add(entry.actorUserId)
    else emails.add(entry.adminEmail.toLowerCase())
  }
  return { ids: [...ids], emails: [...emails] }
}

export function classifyAuditActors(
  entries: AuditActorEntry[],
  users: AuditActorUser[],
): Record<string, AuditActorStatus> {
  const byId = new Map(users.map((user) => [user.id, user]))
  const byEmail = new Map(users.map((user) => [user.email.toLowerCase(), user]))
  const result: Record<string, AuditActorStatus> = {}
  for (const entry of entries) {
    // A recorded actor id is authoritative: its e-mail may since belong to someone else.
    const user = entry.actorUserId ? byId.get(entry.actorUserId) : byEmail.get(entry.adminEmail.toLowerCase())
    const status: AuditActorStatus = user
      ? (isStaffSubject(user) ? 'staff' : 'former')
      : (entry.actorUserId ? 'deleted' : 'unknown')
    Object.assign(result, mergeAuditActorStatuses(result, { [entry.adminEmail]: status }))
  }
  return result
}
