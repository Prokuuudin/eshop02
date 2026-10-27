import { z } from 'zod'
import { isValidCardNumber, normalizeCardNumber } from '@/lib/card-number'
import { classifyNameEncoding } from '@/lib/name-encoding'

/**
 * Single source of truth for customer data edited by staff (BUG-002).
 *
 * User columns own identity, contact and requisites. `checkoutProfile` owns the
 * customer's checkout defaults (delivery address, bank) and keeps a mirror of the
 * requisites so checkout prefill and the account form show the same values. A
 * column wins over its mirror; the mirror is only read when the column is empty
 * (legacy rows written before the columns were kept in sync).
 */

export const SYNTHETIC_EMAIL_DOMAIN = '@client.local'

export const isSyntheticEmail = (email: string): boolean => email.toLowerCase().endsWith(SYNTHETIC_EMAIL_DOMAIN)

export type CustomerType = 'individual' | 'company'

/** Canonical (column-owned) fields and the checkoutProfile key that mirrors each one. */
const MIRRORED = {
  phone: 'phone',
  customerType: 'customerType',
  companyName: 'companyName',
  registrationNumber: 'regNumber',
  vatNumber: 'vatNumber',
  legalAddress: 'legalAddress',
} as const

/** Fields owned by checkoutProfile only. */
const PROFILE_OWNED = ['address', 'city', 'postalCode', 'bankName', 'iban'] as const
type ProfileOwnedField = (typeof PROFILE_OWNED)[number]

const PROFILE_KEYS = [
  'customerType', 'companyName', 'regNumber', 'vatNumber', 'legalAddress', 'bankName', 'iban',
  'firstName', 'lastName', 'phone', 'address', 'city', 'postalCode',
] as const

export type CustomerUserRow = {
  id: string
  email: string
  name: string | null
  phone: string | null
  cardNumber: string | null
  customerType: string | null
  companyName: string | null
  registrationNumber: string | null
  vatNumber: string | null
  legalAddress: string | null
  checkoutProfile: unknown
  updatedAt: Date
}

/** The editable state of one customer, as staff see it and as the edit endpoint compares it. */
export type CustomerCanonical = {
  email: string
  firstName: string
  lastName: string
  phone: string
  cardNumber: string
  customerType: CustomerType
  companyName: string
  registrationNumber: string
  vatNumber: string
  legalAddress: string
  address: string
  city: string
  postalCode: string
  bankName: string
  iban: string
}

export type CanonicalField = keyof CustomerCanonical

type ProfileObject = Record<string, unknown>

export function profileObject(value: unknown): ProfileObject | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as ProfileObject : null
}

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

export function splitFullName(fullName: string): { firstName: string; lastName: string } {
  const trimmed = fullName.trim().replace(/\s+/gu, ' ')
  const space = trimmed.indexOf(' ')
  return space === -1
    ? { firstName: trimmed, lastName: '' }
    : { firstName: trimmed.slice(0, space), lastName: trimmed.slice(space + 1) }
}

export const joinName = (firstName: string, lastName: string): string => [firstName, lastName].map((part) => part.trim()).filter(Boolean).join(' ')

function canonicalName(user: CustomerUserRow, profile: ProfileObject | null): { firstName: string; lastName: string } {
  const column = text(user.name)
  const profileFirst = text(profile?.firstName)
  const profileLast = text(profile?.lastName)
  // The profile split is kept when it spells the same full name (e.g. a two-word first name).
  if (column && joinName(profileFirst, profileLast) === column.replace(/\s+/gu, ' ')) return { firstName: profileFirst, lastName: profileLast }
  if (column) return splitFullName(column)
  return { firstName: profileFirst, lastName: profileLast }
}

export function readCustomerCanonical(user: CustomerUserRow): CustomerCanonical {
  const profile = profileObject(user.checkoutProfile)
  const mirrored = (field: keyof typeof MIRRORED): string => text(user[field]) || text(profile?.[MIRRORED[field]])
  const columnType = user.customerType === 'company' || user.customerType === 'individual' ? user.customerType : null
  const profileType = profile?.customerType === 'company' || profile?.customerType === 'individual' ? profile.customerType : null
  return {
    email: user.email,
    ...canonicalName(user, profile),
    phone: mirrored('phone'),
    cardNumber: user.cardNumber ?? '',
    customerType: columnType ?? profileType ?? 'individual',
    companyName: mirrored('companyName'),
    registrationNumber: mirrored('registrationNumber').replace(/\D/gu, ''),
    vatNumber: mirrored('vatNumber'),
    legalAddress: mirrored('legalAddress'),
    address: text(profile?.address),
    city: text(profile?.city),
    postalCode: text(profile?.postalCode),
    bankName: text(profile?.bankName),
    iban: text(profile?.iban),
  }
}

/** Profile values that disagree with their canonical column (shown to staff as legacy drift). */
export function readProfileDrift(user: CustomerUserRow): Partial<Record<CanonicalField, string>> {
  const profile = profileObject(user.checkoutProfile)
  if (!profile) return {}
  const drift: Partial<Record<CanonicalField, string>> = {}
  for (const [field, key] of Object.entries(MIRRORED) as Array<[keyof typeof MIRRORED, string]>) {
    const column = text(user[field])
    const mirror = text(profile[key])
    if (column && mirror && column !== mirror) drift[field] = mirror
  }
  return drift
}

// ── Input validation ────────────────────────────────────────────────────────

const CONTROL_CHARS = /[\p{Cc}\p{Cf}]/u
const optionalText = (max: number) => z.string().max(max).optional()

export const customerChangesSchema = z.object({
  firstName: optionalText(100),
  lastName: optionalText(100),
  email: optionalText(320),
  phone: optionalText(50),
  cardNumber: optionalText(20),
  customerType: z.enum(['individual', 'company']).optional(),
  companyName: optionalText(300),
  registrationNumber: optionalText(50),
  vatNumber: optionalText(50),
  legalAddress: optionalText(500),
  address: optionalText(300),
  city: optionalText(120),
  postalCode: optionalText(20),
  bankName: optionalText(300),
  iban: optionalText(50),
}).strict()

export type CustomerChanges = z.infer<typeof customerChangesSchema>

export const savedAddressSchema = z.object({
  firstName: z.string().max(100),
  lastName: z.string().max(100),
  phone: z.string().max(50),
  address: z.string().max(300),
  city: z.string().max(120),
  postalCode: z.string().max(20).nullable(),
}).strict()

export type SavedAddressFields = z.infer<typeof savedAddressSchema>

export type FieldError = { field: string; code: string }

const VAT_PATTERN = /^[A-Z]{2}[0-9A-Z]{2,13}$/u
const IBAN_PATTERN = /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/u
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u

/**
 * E.164 form of a phone number, or `undefined` when it cannot be one. Server-side and
 * dependency-free (react-phone-number-input ships React components and cannot load in a
 * route handler). A bare 8-digit number is Latvian, like the storefront's phone input default.
 */
export function normalizePhone(raw: string): string | undefined {
  const compact = raw.trim().replace(/[\s().-]/gu, '').replace(/^00/u, '+')
  if (/^\+\d{8,15}$/u.test(compact)) return compact
  if (/^\d{8}$/u.test(compact)) return `+371${compact}`
  if (/^371\d{8}$/u.test(compact)) return `+${compact}`
  return undefined
}

function cleanText(value: string): string {
  return value.trim().replace(/\s+/gu, ' ')
}

function checkName(field: string, value: string, errors: FieldError[]): void {
  if (CONTROL_CHARS.test(value)) errors.push({ field, code: 'invalid_characters' })
  // BUG-001: a cp1257 name read as cp1251 must not be typed back in by hand either.
  const verdict = classifyNameEncoding(value)
  if (verdict.kind === 'repairable' || verdict.kind === 'suspicious') errors.push({ field, code: 'name_encoding_suspect' })
}

/**
 * Applies `changes` to `current` and validates the result. Only fields present in
 * `changes` are normalized; requisites rules are enforced when any requisite or the
 * customer type changes, so an unrelated edit of a legacy row is never blocked.
 */
export function applyCustomerChanges(
  current: CustomerCanonical,
  changes: CustomerChanges,
): { next: CustomerCanonical; errors: FieldError[] } {
  const errors: FieldError[] = []
  const next: CustomerCanonical = { ...current }

  if (changes.firstName !== undefined) next.firstName = cleanText(changes.firstName)
  if (changes.lastName !== undefined) next.lastName = cleanText(changes.lastName)
  if (changes.firstName !== undefined || changes.lastName !== undefined) {
    if (!next.firstName) errors.push({ field: 'firstName', code: 'required' })
    checkName('firstName', next.firstName, errors)
    checkName('lastName', next.lastName, errors)
  }

  if (changes.email !== undefined) {
    const email = changes.email.trim().toLowerCase()
    if (!EMAIL_PATTERN.test(email)) errors.push({ field: 'email', code: 'invalid_email' })
    else if (isSyntheticEmail(email)) errors.push({ field: 'email', code: 'synthetic_email_forbidden' })
    next.email = email
  }

  if (changes.phone !== undefined) {
    const raw = changes.phone.trim()
    const phone = raw ? normalizePhone(raw) : ''
    if (phone === undefined) errors.push({ field: 'phone', code: 'invalid_phone' })
    next.phone = phone ?? raw
  }

  if (changes.cardNumber !== undefined) {
    const card = normalizeCardNumber(changes.cardNumber)
    if (!isValidCardNumber(card)) errors.push({ field: 'cardNumber', code: 'invalid_card_number' })
    next.cardNumber = card
  }

  if (changes.customerType !== undefined) next.customerType = changes.customerType
  if (changes.companyName !== undefined) next.companyName = cleanText(changes.companyName)
  if (changes.registrationNumber !== undefined) next.registrationNumber = changes.registrationNumber.replace(/\D/gu, '')
  if (changes.vatNumber !== undefined) next.vatNumber = changes.vatNumber.replace(/\s+/gu, '').toUpperCase()
  if (changes.legalAddress !== undefined) next.legalAddress = cleanText(changes.legalAddress)

  const requisitesTouched = ['customerType', 'companyName', 'registrationNumber', 'vatNumber', 'legalAddress']
    .some((field) => changes[field as keyof CustomerChanges] !== undefined)
  if (next.customerType === 'individual') {
    // Same rule as the account form: an individual carries no company requisites.
    next.companyName = ''
    next.registrationNumber = ''
    next.vatNumber = ''
    next.legalAddress = ''
  } else if (requisitesTouched) {
    if (!next.companyName) errors.push({ field: 'companyName', code: 'required' })
    if (next.registrationNumber.length !== 11) errors.push({ field: 'registrationNumber', code: 'invalid_registration_number' })
    if (next.vatNumber && !VAT_PATTERN.test(next.vatNumber)) errors.push({ field: 'vatNumber', code: 'invalid_vat_number' })
    if (CONTROL_CHARS.test(next.companyName)) errors.push({ field: 'companyName', code: 'invalid_characters' })
  }

  for (const field of ['address', 'city', 'postalCode', 'bankName'] as const) {
    if (changes[field] !== undefined) next[field] = cleanText(changes[field])
  }
  if (changes.iban !== undefined) {
    next.iban = changes.iban.replace(/\s+/gu, '').toUpperCase()
    if (next.iban && !IBAN_PATTERN.test(next.iban)) errors.push({ field: 'iban', code: 'invalid_iban' })
  }

  return { next, errors }
}

export function normalizeSavedAddress(value: SavedAddressFields): { next: SavedAddressFields; errors: FieldError[] } {
  const next: SavedAddressFields = {
    firstName: cleanText(value.firstName),
    lastName: cleanText(value.lastName),
    phone: value.phone.trim(),
    address: cleanText(value.address),
    city: cleanText(value.city),
    postalCode: value.postalCode?.trim() || null,
  }
  const errors: FieldError[] = []
  for (const field of ['firstName', 'lastName', 'phone', 'address', 'city'] as const) {
    if (!next[field]) errors.push({ field, code: 'required' })
  }
  if (next.phone && normalizePhone(next.phone) === undefined) errors.push({ field: 'phone', code: 'invalid_phone' })
  return { next, errors }
}

export function changedFields(before: CustomerCanonical, after: CustomerCanonical): CanonicalField[] {
  return (Object.keys(after) as CanonicalField[]).filter((field) => before[field] !== after[field])
}

/** Column values to write for the changed canonical fields. */
export function userColumnUpdates(next: CustomerCanonical, changed: CanonicalField[]): Record<string, string | null> {
  const data: Record<string, string | null> = {}
  const has = (field: CanonicalField) => changed.includes(field)
  if (has('firstName') || has('lastName')) data.name = joinName(next.firstName, next.lastName) || null
  if (has('email')) data.email = next.email
  if (has('cardNumber')) data.cardNumber = next.cardNumber
  if (has('customerType')) data.customerType = next.customerType
  for (const field of ['phone', 'companyName', 'registrationNumber', 'vatNumber', 'legalAddress'] as const) {
    if (has(field)) data[field] = next[field] || null
  }
  return data
}

/**
 * The checkoutProfile to store after an edit, or `undefined` to leave the column as is.
 * An existing profile always gets every mirror re-written from the canonical state, which
 * also heals legacy drift. A missing profile is only created when a profile-owned field
 * (delivery address, bank) is set, never for a plain contact edit.
 */
export function nextCheckoutProfile(
  current: unknown,
  next: CustomerCanonical,
  changed: CanonicalField[],
): Record<string, string> | undefined {
  const existing = profileObject(current)
  const profileOwnedChanged = changed.some((field) => (PROFILE_OWNED as readonly string[]).includes(field))
  if (!existing && !profileOwnedChanged) return undefined
  if (existing && changed.length === 0) return undefined

  const result: Record<string, string> = {}
  for (const key of PROFILE_KEYS) result[key] = text(existing?.[key])
  for (const [key, value] of Object.entries(existing ?? {})) {
    if (!(key in result) && typeof value === 'string') result[key] = value
  }
  result.customerType = next.customerType
  result.companyName = next.companyName
  result.regNumber = next.registrationNumber
  result.vatNumber = next.vatNumber
  result.legalAddress = next.legalAddress
  result.firstName = next.firstName
  result.lastName = next.lastName
  result.phone = next.phone
  for (const field of PROFILE_OWNED as readonly ProfileOwnedField[]) result[field] = next[field]
  return result
}

/** Last eight digits: the subscriber part of a Latvian number, independent of +371 formatting. */
export const phoneMatchKey = (phone: string): string => phone.replace(/\D/gu, '').slice(-8)
