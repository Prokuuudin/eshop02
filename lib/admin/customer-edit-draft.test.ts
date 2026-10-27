import { describe, expect, it } from 'vitest'
import type { CustomerRecord } from './customer-edit'
import { buildCustomerEditRequest, customerDraftFrom } from './customer-edit-draft'

const fields = { firstName: 'Anna', lastName: 'Example', phone: '+37120000001', address: 'Street 1', city: 'Riga', postalCode: null }
const record = (overrides: Partial<CustomerRecord> = {}): CustomerRecord => ({
  id: 'c1', updatedAt: '2026-10-27T10:00:00.000Z', staffAccount: false, registered: true, bonusPoints: 0,
  emailIsSynthetic: true, profileDrift: {}, company: null, linkedOrders: 0, history: [],
  savedAddresses: [{ id: 'a1', ...fields }],
  canonical: {
    email: '9001@client.local', firstName: 'Anna', lastName: 'Example', phone: '+37120000001', cardNumber: '9001',
    customerType: 'individual', companyName: '', registrationNumber: '', vatNumber: '', legalAddress: '',
    address: '', city: '', postalCode: '', bankName: '', iban: '',
  },
  ...overrides,
})

describe('customer edit draft', () => {
  it('sends nothing when nothing changed, and never the service email', () => {
    const base = record()
    expect(customerDraftFrom(base).fields.email).toBe('')
    expect(buildCustomerEditRequest(base, customerDraftFrom(base))).toEqual({ changes: {}, savedAddresses: [] })
  })

  it('sends only edited fields and edited addresses together with their original values', () => {
    const base = record()
    const draft = customerDraftFrom(base)
    draft.fields.phone = '+37120000009'
    draft.fields.email = 'anna@example.test'
    draft.savedAddresses[0].city = 'Jelgava'
    draft.savedAddresses[0].postalCode = ''
    expect(buildCustomerEditRequest(base, draft)).toEqual({
      changes: { phone: '+37120000009', email: 'anna@example.test' },
      savedAddresses: [{ id: 'a1', expected: fields, next: { ...fields, city: 'Jelgava' } }],
    })
  })

  it('sends a cleared real email so the server can reject it', () => {
    const base = record({ emailIsSynthetic: false, canonical: { ...record().canonical, email: 'anna@example.test' } })
    const draft = customerDraftFrom(base)
    draft.fields.email = ''
    expect(buildCustomerEditRequest(base, draft).changes).toEqual({ email: '' })
  })
})
