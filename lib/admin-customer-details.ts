/**
 * A customer's contact and legal details live in two places: the account columns (User.name,
 * phone, customerType, registrationNumber, …) and the checkout profile the customer saves from
 * their account page (User.checkoutProfile). The admin client lists show the checkout profile
 * first, so an admin edit that only updated the columns was hidden again on the next reload —
 * and the customer's checkout kept using the old values.
 */

type CustomerColumns = {
  name: string | null
  phone: string | null
  companyName: string | null
  customerType: string | null
  registrationNumber: string | null
  vatNumber: string | null
  legalAddress: string | null
}

export type CustomerDetailUpdates = {
  name?: string | null
  phone?: string | null
  customerType?: 'individual' | 'company'
  registrationNumber?: string | null
  vatNumber?: string | null
  legalAddress?: string | null
  bankName?: string | null
  iban?: string | null
  deliveryAddress?: string | null
  deliveryCity?: string | null
  deliveryPostalCode?: string | null
}

/** Admin-editable details stored only in the checkout profile: there are no User columns for them. */
const PROFILE_ONLY_FIELDS = ['bankName', 'iban', 'deliveryAddress', 'deliveryCity', 'deliveryPostalCode'] as const

/** The update without the profile-only fields, i.e. what may be written to the User columns. */
export function omitProfileOnlyFields<T extends Record<string, unknown>>(updates: T): Omit<T, typeof PROFILE_ONLY_FIELDS[number]> {
  const columns: Record<string, unknown> = { ...updates }
  for (const field of PROFILE_ONLY_FIELDS) delete columns[field]
  return columns as Omit<T, typeof PROFILE_ONLY_FIELDS[number]>
}

export type CustomerDetails = {
  name: string | null
  phone: string | null
  companyName: string | null
  customerType: string | null
  registrationNumber: string | null
  vatNumber: string | null
  legalAddress: string | null
  address: string | null
  deliveryAddress: string | null
  deliveryCity: string | null
  deliveryPostalCode: string | null
  bankName: string | null
  iban: string | null
}

export function asCheckoutProfile(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

/** The details an admin sees: the checkout profile wins, the account columns are the fallback. */
export function readCustomerDetails(columns: CustomerColumns, checkoutProfile: unknown): CustomerDetails {
  const profile = asCheckoutProfile(checkoutProfile)
  const text = (field: string): string => typeof profile?.[field] === 'string' ? String(profile[field]).trim() : ''
  const profileType = text('customerType')
  const customerType = profileType === 'company' || profileType === 'individual' ? profileType : columns.customerType
  const profileName = customerType === 'company'
    ? text('companyName')
    : [text('firstName'), text('lastName')].filter(Boolean).join(' ')
  return {
    name: profileName || columns.name,
    phone: text('phone') || columns.phone,
    companyName: text('companyName') || columns.companyName,
    customerType,
    registrationNumber: text('regNumber').replace(/\D/gu, '') || columns.registrationNumber,
    vatNumber: text('vatNumber') || columns.vatNumber,
    legalAddress: text('legalAddress') || columns.legalAddress,
    address: [text('address'), text('city'), text('postalCode')].filter(Boolean).join(', ') || columns.legalAddress,
    deliveryAddress: text('address') || null,
    deliveryCity: text('city') || null,
    deliveryPostalCode: text('postalCode') || null,
    bankName: text('bankName') || null,
    iban: text('iban') || null,
  }
}

/**
 * The checkout profile to store with an admin edit of the customer details (name, phone, type,
 * registration/VAT number, legal address, bank, IBAN, delivery address), so the edit is what the
 * admin lists and the customer's checkout (and so the next invoice) show afterwards. Returns
 * undefined when the edit does not touch these fields, or when the account has no checkout
 * profile and the edit sets none of the profile-backed legal/bank/delivery fields. Profile keys
 * the admin does not edit are kept as the customer entered them.
 */
export function syncCheckoutProfile(
  before: CustomerColumns & { checkoutProfile: unknown },
  updates: CustomerDetailUpdates & Record<string, unknown>,
): Record<string, unknown> | undefined {
  const stored = asCheckoutProfile(before.checkoutProfile)
  // Checkout prefills VAT number, legal address, bank, IBAN and delivery address from the
  // checkout profile only, never from the account columns: without a profile an admin-entered
  // VAT number would never reach an order. Such an account gets a minimal profile holding just
  // its type and the edited fields.
  const profileBacked = ['vatNumber', 'legalAddress', ...PROFILE_ONLY_FIELDS] as const
  const setsProfileDetails = profileBacked.some((field) => !!updates[field])
  const profile = stored ?? (setsProfileDetails ? { customerType: before.customerType === 'company' ? 'company' : 'individual' } : null)
  if (!profile) return undefined
  const touched = updates.name !== undefined || updates.phone !== undefined
    || updates.customerType !== undefined || updates.registrationNumber !== undefined
    || profileBacked.some((field) => updates[field] !== undefined)
  if (!touched) return undefined

  const next: Record<string, unknown> = { ...profile }
  if (updates.customerType !== undefined) next.customerType = updates.customerType
  // Like the customer's own profile save: an individual keeps the number in the profile
  // (unused while individual), only a real number replaces it.
  if (updates.registrationNumber) next.regNumber = updates.registrationNumber
  if (updates.phone !== undefined) next.phone = updates.phone ?? ''
  // Same rule for the company-only checkout fields (VAT number, legal address, bank, IBAN),
  // except that a company may also clear them.
  const companyAfter = readCustomerDetails(
    { ...before, ...(updates.customerType !== undefined ? { customerType: updates.customerType } : {}) },
    next,
  ).customerType === 'company'
  for (const field of ['vatNumber', 'legalAddress', 'bankName', 'iban'] as const) {
    const value = updates[field]
    if (value !== undefined && (value || companyAfter)) next[field] = value ?? ''
  }
  // The delivery address is used by individuals and companies alike.
  if (updates.deliveryAddress !== undefined) next.address = updates.deliveryAddress ?? ''
  if (updates.deliveryCity !== undefined) next.city = updates.deliveryCity ?? ''
  if (updates.deliveryPostalCode !== undefined) next.postalCode = updates.deliveryPostalCode ?? ''

  if (updates.name !== undefined) {
    const wanted = updates.name ?? null
    const columnsAfter: CustomerColumns = {
      ...before,
      name: wanted,
      ...(updates.customerType !== undefined ? { customerType: updates.customerType } : {}),
    }
    const shown = readCustomerDetails(columnsAfter, next)
    if (shown.customerType === 'company') {
      // Only an actual rename or a switch to company sets the company name: an unrelated edit
      // must not copy the person's name into an empty company name used by the checkout.
      const switchedToCompany = readCustomerDetails(before, profile).customerType !== 'company'
      if (switchedToCompany || shown.name !== wanted) next.companyName = wanted ?? ''
    } else if (shown.name !== wanted) {
      // Keep the customer's own first/last split unless the admin actually changed the name.
      const [firstName = '', ...rest] = (wanted ?? '').split(/\s+/u).filter(Boolean)
      next.firstName = firstName
      next.lastName = rest.join(' ')
    }
  }
  return next
}
