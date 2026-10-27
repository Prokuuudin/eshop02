import type { CustomerCanonical, CustomerChanges, SavedAddressFields } from '@/lib/admin/customer-edit-model'
import type { CustomerRecord } from '@/lib/admin/customer-edit'

export type DraftAddress = SavedAddressFields & { id: string }
export type CustomerDraft = { fields: CustomerCanonical; savedAddresses: DraftAddress[] }

const ADDRESS_FIELDS = ['firstName', 'lastName', 'phone', 'address', 'city', 'postalCode'] as const

/** A synthetic card account address is shown as empty: staff can set a real one, not edit it. */
const baseFields = (record: CustomerRecord): CustomerCanonical =>
  ({ ...record.canonical, email: record.emailIsSynthetic ? '' : record.canonical.email })

export function customerDraftFrom(record: CustomerRecord): CustomerDraft {
  return {
    fields: baseFields(record),
    savedAddresses: record.savedAddresses.map((address) => ({ ...address })),
  }
}

const addressFields = (address: SavedAddressFields): SavedAddressFields => ({
  firstName: address.firstName, lastName: address.lastName, phone: address.phone,
  address: address.address, city: address.city, postalCode: address.postalCode || null,
})

/** Only what staff actually changed is sent; the server re-validates and re-diffs. */
export function buildCustomerEditRequest(record: CustomerRecord, draft: CustomerDraft): {
  changes: CustomerChanges
  savedAddresses: Array<{ id: string; expected: SavedAddressFields; next: SavedAddressFields }>
} {
  const base = baseFields(record)
  const changes: Record<string, string> = {}
  for (const field of Object.keys(base) as Array<keyof CustomerCanonical>) {
    if (draft.fields[field] === base[field]) continue
    if (field === 'email' && record.emailIsSynthetic && !draft.fields.email.trim()) continue
    changes[field] = draft.fields[field]
  }
  const savedAddresses = draft.savedAddresses.flatMap((address) => {
    const original = record.savedAddresses.find((item) => item.id === address.id)
    if (!original) return []
    const expected = addressFields(original)
    const next = addressFields(address)
    return ADDRESS_FIELDS.some((field) => expected[field] !== next[field]) ? [{ id: address.id, expected, next }] : []
  })
  return { changes: changes as CustomerChanges, savedAddresses }
}
