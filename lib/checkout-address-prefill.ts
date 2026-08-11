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

// Card-registered customers get a synthetic User.email like `card.1234@client.local`
// when no real address is known — treated as "no email" everywhere it's surfaced
// (see hooks/useAccountProfile.ts and the account page's contact-email handling).
function isInternalEmail(email: string): boolean {
  return email.endsWith('@client.local')
}

/**
 * Decides what the checkout form's prefill effect should fall back to, on top of
 * whatever the URL query params already filled in.
 *
 * - Never surfaces a synthetic `@client.local` email — that's not a real inbox.
 * - Only pulls from `saved` (a *different* stored address than what the user may have
 *   just explicitly selected via a "Use this address" link) when there's no explicit
 *   address selection in play; otherwise falls through to the profile branch so a
 *   missing field on the explicitly-selected address is never silently backfilled
 *   from an unrelated saved address.
 */
export function buildPrefillFallback(
  user: { name?: string; phone?: string; email: string },
  saved: SavedAddress | undefined,
  hasExplicitAddress: boolean
): Partial<CheckoutAddressFields> {
  const email = isInternalEmail(user.email) ? undefined : user.email

  if (saved && !hasExplicitAddress) {
    return {
      firstName: saved.firstName,
      lastName: saved.lastName,
      phone: saved.phone,
      address: saved.address,
      city: saved.city,
      postalCode: saved.postalCode ?? '',
      email,
    }
  }

  return {
    ...splitName(user.name),
    phone: user.phone ?? '',
    email,
  }
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
