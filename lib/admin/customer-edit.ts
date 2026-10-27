import type { NextRequest } from 'next/server'
import { z } from 'zod'
import type { ExtendedTransactionClient } from '@/lib/prisma'
import type { ServerUser } from '@/lib/server-auth'
import { appendServerAudit } from '@/lib/server-audit'
import { isProtectedStaffAccount } from '@/lib/admin-permissions'
import { normalizeCardNumber } from '@/lib/card-number'
import {
  applyCustomerChanges,
  changedFields,
  customerChangesSchema,
  isSyntheticEmail,
  joinName,
  nextCheckoutProfile,
  normalizeSavedAddress,
  phoneMatchKey,
  readCustomerCanonical,
  readProfileDrift,
  savedAddressSchema,
  userColumnUpdates,
  type CanonicalField,
  type CustomerCanonical,
  type FieldError,
  type SavedAddressFields,
} from './customer-edit-model'

type Db = ExtendedTransactionClient

export const customerEditSchema = z.object({
  expectedUpdatedAt: z.iso.datetime(),
  reason: z.string().trim().min(5).max(1000),
  changes: customerChangesSchema.default({}),
  savedAddresses: z.array(z.object({
    id: z.string().min(1).max(200),
    expected: savedAddressSchema,
    next: savedAddressSchema,
  }).strict()).max(50).optional(),
  /** Required when a requisite change would also rewrite a Company other customers belong to. */
  companyScope: z.enum(['user_only', 'shared_company']).optional(),
  expectedCompanyUpdatedAt: z.iso.datetime().optional(),
  /** Staff saw the possible-duplicate list and keep both customers as separate records. */
  confirmDuplicates: z.boolean().optional(),
  /** Staff verified that guest orders placed with the new email were made by this customer. */
  guestOrdersBelongToCustomer: z.boolean().optional(),
  currentPassword: z.string().min(1).max(1024).optional(),
  mfaCode: z.string().regex(/^\d{6}$/u).optional(),
}).strict()

export type CustomerEditInput = z.infer<typeof customerEditSchema>

export class CustomerEditError extends Error {
  constructor(readonly code: string, readonly status: number, readonly details?: unknown) {
    super(code)
  }
}

const USER_SELECT = {
  id: true, email: true, name: true, phone: true, cardNumber: true, customerType: true,
  companyName: true, registrationNumber: true, vatNumber: true, legalAddress: true,
  checkoutProfile: true, updatedAt: true, platformRole: true, teamRole: true, superAdmin: true,
  companyId: true, bonusPoints: true, privacyAcknowledgedAt: true,
} as const

const ADDRESS_FIELDS = ['firstName', 'lastName', 'phone', 'address', 'city', 'postalCode'] as const

const addressOf = (row: SavedAddressFields): SavedAddressFields => ({
  firstName: row.firstName, lastName: row.lastName, phone: row.phone,
  address: row.address, city: row.city, postalCode: row.postalCode ?? null,
})

const sameAddress = (a: SavedAddressFields, b: SavedAddressFields): boolean =>
  ADDRESS_FIELDS.every((field) => (a[field] ?? null) === (b[field] ?? null))

/** Every customer other than `userId` attached to the company, via User.companyId or CompanyMember. */
async function otherCompanyMembers(db: Db, companyId: string, userId: string): Promise<number> {
  const users = await db.user.findMany({ where: { companyId, NOT: { id: userId } }, select: { id: true }, take: 100 })
  const members = await db.companyMember.findMany({ where: { companyId, NOT: { userId } }, select: { userId: true }, take: 100 })
  return new Set([...users.map((u) => u.id), ...members.map((m) => m.userId)]).size
}

export type CustomerRecord = {
  id: string
  updatedAt: string
  staffAccount: boolean
  registered: boolean
  bonusPoints: number
  emailIsSynthetic: boolean
  canonical: CustomerCanonical
  profileDrift: Partial<Record<CanonicalField, string>>
  savedAddresses: Array<SavedAddressFields & { id: string }>
  company: {
    id: string; companyName: string; registrationNumber: string | null; taxId: string | null
    address: string | null; cardNumber: string | null; updatedAt: string; otherMembers: number
  } | null
  linkedOrders: number
  history: Array<{ at: string; action: string; adminEmail: string; adminName: string | null; reason: string | null; before: unknown; after: unknown }>
}

export async function loadCustomerRecord(db: Db, id: string): Promise<CustomerRecord | null> {
  const user = await db.user.findUnique({ where: { id }, select: USER_SELECT })
  if (!user) return null
  const savedAddresses = await db.savedAddress.findMany({ where: { userId: id }, orderBy: { id: 'asc' } })
  const company = user.companyId ? await db.company.findUnique({ where: { id: user.companyId } }) : null
  const otherMembers = company ? await otherCompanyMembers(db, company.id, id) : 0
  const linkedOrders = await db.order.count({ where: { userId: id } })
  const history = await db.auditLog.findMany({
    where: { entityType: 'user', entityId: id, action: { startsWith: 'customer.' } },
    orderBy: { sequence: 'desc' },
    take: 20,
    select: { at: true, action: true, adminEmail: true, adminName: true, reason: true, before: true, after: true },
  })
  return {
    id: user.id,
    updatedAt: user.updatedAt.toISOString(),
    staffAccount: isProtectedStaffAccount(user),
    registered: user.privacyAcknowledgedAt !== null,
    bonusPoints: user.bonusPoints,
    emailIsSynthetic: isSyntheticEmail(user.email),
    canonical: readCustomerCanonical(user),
    profileDrift: readProfileDrift(user),
    savedAddresses: savedAddresses.map((row) => ({ id: row.id, ...addressOf(row) })),
    company: company ? {
      id: company.id, companyName: company.companyName, registrationNumber: company.registrationNumber,
      taxId: company.taxId, address: company.address, cardNumber: company.cardNumber,
      updatedAt: company.updatedAt.toISOString(), otherMembers,
    } : null,
    linkedOrders,
    history: history.map((entry) => ({ ...entry, at: entry.at.toISOString() })),
  }
}

type Duplicate = { field: 'registrationNumber' | 'vatNumber' | 'phone'; userId: string; cardNumber: string | null }

async function findPossibleDuplicates(db: Db, id: string, next: CustomerCanonical, changed: CanonicalField[]): Promise<Duplicate[]> {
  const duplicates: Duplicate[] = []
  if (changed.includes('registrationNumber') && next.registrationNumber) {
    const rows = await db.user.findMany({ where: { registrationNumber: next.registrationNumber, NOT: { id } }, select: { id: true, cardNumber: true }, take: 10 })
    duplicates.push(...rows.map((row) => ({ field: 'registrationNumber' as const, userId: row.id, cardNumber: row.cardNumber })))
  }
  if (changed.includes('vatNumber') && next.vatNumber) {
    const rows = await db.user.findMany({ where: { vatNumber: { equals: next.vatNumber, mode: 'insensitive' }, NOT: { id } }, select: { id: true, cardNumber: true }, take: 10 })
    duplicates.push(...rows.map((row) => ({ field: 'vatNumber' as const, userId: row.id, cardNumber: row.cardNumber })))
  }
  const phoneKey = changed.includes('phone') ? phoneMatchKey(next.phone) : ''
  if (phoneKey.length === 8) {
    const rows = await db.$queryRaw<Array<{ id: string; cardNumber: string | null }>>`
      SELECT id, "cardNumber" FROM "User"
      WHERE id <> ${id} AND right(regexp_replace(coalesce(phone, ''), '\\D', '', 'g'), 8) = ${phoneKey}
      LIMIT 10`
    duplicates.push(...rows.map((row) => ({ field: 'phone' as const, userId: row.id, cardNumber: row.cardNumber })))
  }
  return duplicates
}

async function assertCardAvailable(db: Db, id: string, companyId: string | null, cardNumber: string): Promise<void> {
  const card = { equals: cardNumber, mode: 'insensitive' as const }
  const holder = await db.user.findFirst({ where: { cardNumber: card, NOT: { id } }, select: { id: true } })
  const company = await db.company.findFirst({ where: { cardNumber: card, ...(companyId ? { NOT: { id: companyId } } : {}) }, select: { id: true } })
  // A card promised to someone else by a live invitation or a pending application is not free either.
  const invitation = await db.invitationToken.findFirst({ where: { cardNumber, status: 'sent', expiresAt: { gt: new Date() }, NOT: { userId: id } }, select: { id: true } })
  const application = await db.accessRequest.findFirst({ where: { cardNumber, status: 'pending' }, select: { id: true } })
  if (holder || company || invitation || application) throw new CustomerEditError('card_taken', 409)
}

export type CustomerEditEffects = {
  sessionsRevoked: number
  resetTokensRevoked: number
  mfaChallengesRevoked: number
  invitationsRevoked: number
  companyMembersUpdated: number
  savedAddressEmailsUpdated: number
  savedAddressesUpdated: number
  companyUpdated: boolean
  companySkipped: boolean
  guestOrdersAcknowledged: number
}

/**
 * Applies one staff edit of a customer atomically. Must run inside a Serializable
 * transaction: the user row is compared against `expectedUpdatedAt` and written with
 * a conditional update, so a concurrent edit by staff or by the customer is rejected.
 */
export async function applyCustomerEdit(
  tx: Db,
  request: NextRequest,
  actor: ServerUser,
  id: string,
  input: CustomerEditInput,
  stepUpVerified: boolean,
): Promise<CustomerEditEffects> {
  const user = await tx.user.findUnique({ where: { id }, select: USER_SELECT })
  if (!user) throw new CustomerEditError('not_found', 404)
  if (isProtectedStaffAccount(user)) throw new CustomerEditError('staff_account', 403)
  if (user.updatedAt.getTime() !== new Date(input.expectedUpdatedAt).getTime()) throw new CustomerEditError('optimistic_conflict', 409)

  const current = readCustomerCanonical(user)
  const { next, errors } = applyCustomerChanges(current, input.changes)

  const addressEdits: Array<{ id: string; before: SavedAddressFields; after: SavedAddressFields }> = []
  const addressErrors: FieldError[] = []
  for (const edit of input.savedAddresses ?? []) {
    const normalized = normalizeSavedAddress(edit.next)
    addressErrors.push(...normalized.errors.map((error) => ({ ...error, field: `savedAddresses.${edit.id}.${error.field}` })))
    const row = await tx.savedAddress.findUnique({ where: { id: edit.id } })
    if (!row || row.userId !== id) throw new CustomerEditError('address_not_found', 404, { id: edit.id })
    const stored = addressOf(row)
    if (!sameAddress(stored, addressOf(edit.expected))) throw new CustomerEditError('address_conflict', 409, { id: edit.id })
    if (!sameAddress(stored, normalized.next)) addressEdits.push({ id: edit.id, before: stored, after: normalized.next })
  }
  if (errors.length || addressErrors.length) throw new CustomerEditError('validation_failed', 400, [...errors, ...addressErrors])

  const changed = changedFields(current, next)
  if (changed.length === 0 && addressEdits.length === 0) throw new CustomerEditError('no_changes', 400)

  const emailChanged = changed.includes('email')
  const cardChanged = changed.includes('cardNumber')
  const nameChanged = changed.includes('firstName') || changed.includes('lastName')
  if (emailChanged && !stepUpVerified) throw new CustomerEditError('reauthentication_required', 401)

  let guestOrdersAcknowledged = 0
  if (emailChanged) {
    const owner = await tx.user.findFirst({ where: { email: { equals: next.email, mode: 'insensitive' }, NOT: { id } }, select: { id: true } })
    if (owner) throw new CustomerEditError('email_taken', 409)
    // Guest orders are readable by whoever holds their email (canAccessOrder, /api/orders/my).
    const guestOrders = await tx.order.count({ where: { userId: null, email: { equals: next.email, mode: 'insensitive' } } })
    if (guestOrders > 0 && input.guestOrdersBelongToCustomer !== true) {
      throw new CustomerEditError('guest_orders_confirmation_required', 409, { guestOrders })
    }
    guestOrdersAcknowledged = guestOrders
  }
  if (cardChanged) await assertCardAvailable(tx, id, user.companyId, next.cardNumber)

  const duplicates = await findPossibleDuplicates(tx, id, next, changed)
  if (duplicates.length > 0 && input.confirmDuplicates !== true) {
    throw new CustomerEditError('duplicate_confirmation_required', 409, { duplicates })
  }

  // Company: only its own requisites/card follow the customer, and a company shared with
  // other customers is changed only on explicit confirmation.
  const company = user.companyId ? await tx.company.findUnique({ where: { id: user.companyId } }) : null
  const companyData: Record<string, string | null> = {}
  if (company && next.customerType === 'company') {
    if (changed.includes('companyName') && next.companyName) companyData.companyName = next.companyName
    if (changed.includes('registrationNumber')) companyData.registrationNumber = next.registrationNumber || null
    if (changed.includes('vatNumber')) companyData.taxId = next.vatNumber || null
    if (changed.includes('legalAddress')) companyData.address = next.legalAddress || null
  }
  if (company && cardChanged && company.cardNumber && normalizeCardNumber(company.cardNumber) === normalizeCardNumber(current.cardNumber)) {
    companyData.cardNumber = next.cardNumber
  }
  let companyUpdated = false
  let companySkipped = false
  if (company && Object.keys(companyData).length > 0) {
    if (input.companyScope === 'user_only') {
      companySkipped = true
    } else {
      const others = await otherCompanyMembers(tx, company.id, id)
      if (others > 0 && input.companyScope !== 'shared_company') {
        throw new CustomerEditError('company_scope_required', 409, { otherMembers: others })
      }
      if (!input.expectedCompanyUpdatedAt || company.updatedAt.getTime() !== new Date(input.expectedCompanyUpdatedAt).getTime()) {
        throw new CustomerEditError('company_conflict', 409)
      }
      const result = await tx.company.updateMany({ where: { id: company.id, updatedAt: company.updatedAt }, data: companyData })
      if (result.count !== 1) throw new CustomerEditError('company_conflict', 409)
      companyUpdated = true
    }
  }

  const profile = nextCheckoutProfile(user.checkoutProfile, next, changed)
  const userUpdate = await tx.user.updateMany({
    where: { id, updatedAt: user.updatedAt },
    data: {
      ...userColumnUpdates(next, changed),
      ...(profile ? { checkoutProfile: profile } : {}),
      // Address-only edits still bump the version the customer's account form compares against.
      updatedAt: new Date(),
    },
  })
  if (userUpdate.count !== 1) throw new CustomerEditError('optimistic_conflict', 409)

  for (const edit of addressEdits) {
    await tx.savedAddress.update({ where: { id: edit.id }, data: edit.after })
  }

  const effects: CustomerEditEffects = {
    sessionsRevoked: 0, resetTokensRevoked: 0, mfaChallengesRevoked: 0, invitationsRevoked: 0,
    companyMembersUpdated: 0, savedAddressEmailsUpdated: 0, savedAddressesUpdated: addressEdits.length,
    companyUpdated, companySkipped, guestOrdersAcknowledged,
  }
  if (nameChanged || emailChanged) {
    const members = await tx.companyMember.updateMany({
      where: { userId: id },
      data: {
        ...(nameChanged ? { name: joinName(next.firstName, next.lastName) || next.email } : {}),
        ...(emailChanged ? { email: next.email } : {}),
      },
    })
    effects.companyMembersUpdated = members.count
  }
  if (emailChanged) {
    effects.savedAddressEmailsUpdated = (await tx.savedAddress.updateMany({ where: { userId: id }, data: { email: next.email } })).count
    // Everything issued against the old address stops working: open sessions, reset links,
    // pending MFA challenges and unaccepted card invitations.
    effects.sessionsRevoked = (await tx.session.deleteMany({ where: { userId: id } })).count
    effects.resetTokensRevoked = (await tx.passwordResetToken.deleteMany({ where: { userId: id } })).count
    effects.mfaChallengesRevoked = (await tx.mfaChallenge.deleteMany({ where: { userId: id } })).count
  }
  if (emailChanged || cardChanged) {
    // An unaccepted invitation carries the old email and card; accepting it later must not
    // activate the account or restore the previous card number.
    effects.invitationsRevoked = (await tx.invitationToken.deleteMany({ where: { userId: id, status: { not: 'accepted' } } })).count
  }

  const pick = (state: CustomerCanonical) => Object.fromEntries(changed.map((field) => [field, state[field]]))
  await appendServerAudit(tx, request, actor, {
    action: emailChanged ? 'customer.email_changed' : 'customer.updated',
    entityType: 'user',
    entityId: id,
    entityTitle: user.email,
    before: {
      fields: pick(current),
      ...(addressEdits.length ? { savedAddresses: addressEdits.map((edit) => ({ id: edit.id, ...edit.before })) } : {}),
      ...(companyUpdated && company ? { company: { id: company.id, ...Object.fromEntries(Object.keys(companyData).map((key) => [key, company[key as keyof typeof company] ?? null])) } } : {}),
    },
    after: {
      fields: pick(next),
      ...(addressEdits.length ? { savedAddresses: addressEdits.map((edit) => ({ id: edit.id, ...edit.after })) } : {}),
      ...(companyUpdated && company ? { company: { id: company.id, ...companyData } } : {}),
    },
    details: JSON.stringify({ ...effects, stepUp: stepUpVerified, duplicatesConfirmed: duplicates.length }),
    reason: input.reason,
  })

  return effects
}
