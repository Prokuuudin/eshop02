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
    bankName: text('bankName') || null,
    iban: text('iban') || null,
  }
}

/**
 * The checkout profile to store with an admin edit of name/phone/type/registration number, so
 * the edit is what the admin lists and the customer's checkout show afterwards. Returns
 * undefined when the account has no checkout profile or the edit does not touch these fields.
 * Fields the admin cannot edit (address, bank, VAT, …) are kept as the customer entered them.
 */
export function syncCheckoutProfile(
  before: CustomerColumns & { checkoutProfile: unknown },
  updates: CustomerDetailUpdates & Record<string, unknown>,
): Record<string, unknown> | undefined {
  const profile = asCheckoutProfile(before.checkoutProfile)
  if (!profile) return undefined
  const touched = updates.name !== undefined || updates.phone !== undefined
    || updates.customerType !== undefined || updates.registrationNumber !== undefined
  if (!touched) return undefined

  const next: Record<string, unknown> = { ...profile }
  if (updates.customerType !== undefined) next.customerType = updates.customerType
  // Like the customer's own profile save: an individual keeps the number in the profile
  // (unused while individual), only a real number replaces it.
  if (updates.registrationNumber) next.regNumber = updates.registrationNumber
  if (updates.phone !== undefined) next.phone = updates.phone ?? ''

  if (updates.name !== undefined) {
    const wanted = updates.name ?? null
    const columnsAfter: CustomerColumns = {
      ...before,
      name: wanted,
      ...(updates.customerType !== undefined ? { customerType: updates.customerType } : {}),
    }
    const shown = readCustomerDetails(columnsAfter, next)
    if (shown.customerType === 'company') {
      next.companyName = wanted ?? ''
    } else if (shown.name !== wanted) {
      // Keep the customer's own first/last split unless the admin actually changed the name.
      const [firstName = '', ...rest] = (wanted ?? '').split(/\s+/u).filter(Boolean)
      next.firstName = firstName
      next.lastName = rest.join(' ')
    }
  }
  return next
}
