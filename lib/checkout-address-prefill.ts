import type { SavedAddress } from './saved-addresses-store'

export type CheckoutAddressFields = {
  firstName: string
  lastName: string
  email: string
  phone: string
  address: string
  city: string
  postalCode: string
}

export function checkoutDefaultAddressId(userId: string): string {
  return `checkout_default_${userId}`
}

export function pickPrefillAddress(
  savedAddresses: SavedAddress[],
  userId: string
): SavedAddress | undefined {
  const defaultId = checkoutDefaultAddressId(userId)
  return savedAddresses.find((candidate) => candidate.id === defaultId) ?? savedAddresses[0]
}

export function splitName(fullName: string | undefined): { firstName: string; lastName: string } {
  const trimmed = (fullName ?? '').trim()
  if (!trimmed) return { firstName: '', lastName: '' }

  const spaceIndex = trimmed.indexOf(' ')
  if (spaceIndex === -1) return { firstName: trimmed, lastName: '' }

  return {
    firstName: trimmed.slice(0, spaceIndex),
    lastName: trimmed.slice(spaceIndex + 1).trim(),
  }
}

export function mergeEmptyAddressFields(
  current: CheckoutAddressFields,
  fallback: Partial<CheckoutAddressFields>
): CheckoutAddressFields {
  const result = { ...current }
  for (const key of Object.keys(current) as Array<keyof CheckoutAddressFields>) {
    const fallbackValue = fallback[key]
    if (!result[key] && fallbackValue) {
      result[key] = fallbackValue
    }
  }
  return result
}

export function buildSaveBackAddress(
  user: { id: string; email: string } | null | undefined,
  fields: CheckoutAddressFields
): SavedAddress | null {
  if (!user) return null

  return {
    id: checkoutDefaultAddressId(user.id),
    firstName: fields.firstName,
    lastName: fields.lastName,
    // The account's canonical email, not fields.email — see test comment for why.
    email: user.email,
    phone: fields.phone,
    address: fields.address,
    city: fields.city,
    postalCode: fields.postalCode,
  }
}
