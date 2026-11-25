/**
 * Every place that refers to a User, and what an account merge does with it. Pure data:
 * shared by lib/admin-account-merge (server) and the schema test that keeps it complete.
 *
 * Roles:
 *  - `owner`   — the row belongs to the customer (their order, address, wishlist…).
 *  - `actor`   — staff history: who reviewed, resolved, approved, wrote, triggered something.
 *                A customer account to be merged must never be such an actor; if it is, the
 *                account is not a plain legacy customer and the merge is refused.
 *  - `subject` — immutable history about the account (the audit hash chain). Never rewritten:
 *                it keeps pointing at the old id, which the recovery record maps to the target.
 *
 * Policies:
 *  - `move`  — rows are re-pointed at the kept account (owner data, restorable by id).
 *  - `block` — any row refuses the merge (first stage resolves such cases by hand).
 *  - `keep`  — rows stay untouched and are counted in the preview and the recovery record.
 *
 * `fk: false` marks plain columns without a foreign key: their writers must take the owner
 * lock (lib/account-owner-lock) so a merge cannot leave rows that point at a deleted account.
 */

export type ReferenceRole = 'owner' | 'actor' | 'subject'
export type ReferencePolicy = 'move' | 'block' | 'keep'
/** How the column stores the account: its id, its id or email, `user:<id>`, or an audit subject. */
export type ReferenceMatch = 'id' | 'idOrEmail' | 'voterKey' | 'auditSubject'

export type MergeBlocker =
  | 'same_account'
  | 'staff_account'
  | 'not_customer'
  | 'source_has_card'
  | 'source_no_email'
  | 'source_erased'
  | 'source_revoked_card'
  | 'source_activated'
  | 'source_secrets'
  | 'source_company'
  | 'source_legal_details'
  | 'source_bonus_balance'
  | 'source_bonus_history'
  | 'source_sessions'
  | 'source_invitations'
  | 'source_pending_tokens'
  | 'source_open_orders'
  | 'source_site_activity'
  | 'source_staff_history'
  | 'source_settings_reference'
  | 'profile_conflict'
  | 'target_no_card'
  | 'target_card_revoked'
  | 'target_erased'
  | 'target_pending_tokens'

export type UserReference = {
  table: string
  column: string
  role: ReferenceRole
  policy: ReferencePolicy
  match: ReferenceMatch
  fk: boolean
  /** Owner rows unique per (userId, productId): a source row for a product the target has is dropped. */
  uniqueWith?: 'productId'
  blocker?: MergeBlocker
}

const owner = (table: string, column: string, fk: boolean, extra: Partial<UserReference> = {}): UserReference =>
  ({ table, column, role: 'owner', policy: 'move', match: 'id', fk, ...extra })
const ownerBlock = (table: string, column: string, fk: boolean, blocker: MergeBlocker, match: ReferenceMatch = 'id'): UserReference =>
  ({ table, column, role: 'owner', policy: 'block', match, fk, blocker })
const actor = (table: string, column: string, fk: boolean): UserReference =>
  ({ table, column, role: 'actor', policy: 'block', match: 'idOrEmail', fk, blocker: 'source_staff_history' })

export const USER_REFERENCES: readonly UserReference[] = [
  // Customer data that follows the person.
  owner('Order', 'userId', false),
  owner('SavedAddress', 'userId', true),
  owner('WishlistItem', 'userId', false, { uniqueWith: 'productId' }),
  owner('ProductNewsSubscription', 'userId', true, { uniqueWith: 'productId' }),
  owner('PromoCodeRedemption', 'userId', false),
  owner('UserNotification', 'userId', true),
  // Customer data that only exists once the account was used in the new shop, or that cannot be
  // restored exactly (tokens are secrets, bonus ledgers are balance chains).
  ownerBlock('Session', 'userId', true, 'source_sessions'),
  ownerBlock('PasswordResetToken', 'userId', true, 'source_pending_tokens'),
  ownerBlock('MfaChallenge', 'userId', true, 'source_pending_tokens'),
  ownerBlock('InvitationToken', 'userId', true, 'source_invitations'),
  ownerBlock('InvitationDelivery', 'userId', true, 'source_invitations'),
  ownerBlock('BonusTransaction', 'userId', true, 'source_bonus_history'),
  ownerBlock('CompanyMember', 'userId', false, 'source_company'),
  ownerBlock('CompanyActivityLog', 'userId', false, 'source_company'),
  ownerBlock('RFQRequest', 'createdByUserId', false, 'source_company'),
  ownerBlock('ReviewHelpfulVote', 'voterKey', false, 'source_site_activity', 'voterKey'),
  ownerBlock('AdminRoleChangeRequest', 'targetUserId', false, 'source_staff_history'),
  // Staff history: who did something. Never rewritten.
  actor('AuditLog', 'actorUserId', false),
  actor('BonusTransaction', 'actorUserId', false),
  actor('AccessRequest', 'reviewedByUserId', false),
  actor('AccountManagerMessage', 'authorId', true),
  actor('CompanyMember', 'addedBy', false),
  actor('OrderOperationalException', 'resolvedBy', false),
  actor('StockAllocation', 'acknowledgedBy', false),
  actor('ContactMessage', 'answeredById', false),
  actor('SyncRun', 'triggeredBy', false),
  actor('BrandLineReviewItem', 'resolvedBy', false),
  actor('AdminRoleChangeRequest', 'requestedByUserId', false),
  actor('AdminRoleChangeRequest', 'approvedByUserId', false),
  // Audit rows about the account (entityType 'user'): the hash chain must stay intact.
  { table: 'AuditLog', column: 'entityId', role: 'subject', policy: 'keep', match: 'auditSubject', fk: false },
]

export const referenceKey = (ref: Pick<UserReference, 'table' | 'column'>): string => `${ref.table}.${ref.column}`

export const MOVED_REFERENCES = USER_REFERENCES.filter((ref) => ref.policy === 'move')
export const KEPT_REFERENCES = USER_REFERENCES.filter((ref) => ref.policy === 'keep')

/** Columns found by name or relation in the schema test that are not user references. */
export const NOT_USER_REFERENCES: readonly string[] = [
  // Names of people as plain text (not account links).
  'Review.author', 'BlogPost.author', 'BlogPost.authorRole', 'BlogPost.authorBio',
  'CompanyActivityLog.userName', 'CompanyActivityLog.userEmail',
  // Staff identity copies inside the audit row itself (the id is AuditLog.actorUserId).
  'AuditLog.adminEmail', 'AuditLog.adminName', 'AuditLog.userAgent',
  'AccessRequest.reviewedByEmail',
  // Free text / unrelated keys.
  'Order.customerComment', 'ContactMessage.subject', 'BrandLineReviewItem.subjectKey', 'User.customerType',
]

/**
 * Data stored on the User row itself that a merge must not lose silently. `legal` fields refuse
 * the merge when the old account has them (two legal entities are never folded together).
 */
export const PROFILE_FIELDS = [
  'name', 'phone', 'avatarUrl', 'checkoutProfile',
  'marketingConsent', 'marketingConsentAt', 'notificationChannel', 'notificationsSubscribed',
] as const
export const LEGAL_FIELDS = ['companyName', 'registrationNumber', 'vatNumber', 'legalAddress'] as const

export type ProfileField = (typeof PROFILE_FIELDS)[number]
