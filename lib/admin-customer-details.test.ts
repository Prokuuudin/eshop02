import { describe, expect, it } from 'vitest'
import { omitProfileOnlyFields, readCustomerDetails, syncCheckoutProfile } from './admin-customer-details'
import { buildCheckoutProfileFallback } from './checkout-address-prefill'
import type { CheckoutProfile } from './auth-types'

const columns: Parameters<typeof readCustomerDetails>[0] = {
  name: 'Column Name', phone: '+37100000000', companyName: null, customerType: 'individual',
  registrationNumber: null, vatNumber: null, legalAddress: null,
}
const profile = {
  customerType: 'individual', companyName: '', regNumber: '', vatNumber: '', legalAddress: '', bankName: '', iban: '',
  firstName: 'Anna Marija', lastName: 'Ozola', phone: '+37122222222', address: 'Brīvības 1', city: 'Rīga', postalCode: 'LV-1010',
}

/** What the admin list shows after a save: columns and profile as the PATCH would store them. */
const reloaded = (before: typeof columns & { checkoutProfile: unknown }, updates: Parameters<typeof syncCheckoutProfile>[1]) => {
  const nextProfile = syncCheckoutProfile(before, updates)
  return readCustomerDetails({ ...before, ...updates }, nextProfile === undefined ? before.checkoutProfile : nextProfile)
}

describe('readCustomerDetails', () => {
  it('prefers the customer checkout profile over the account columns', () => {
    const shown = readCustomerDetails(columns, profile)
    expect(shown).toMatchObject({ name: 'Anna Marija Ozola', phone: '+37122222222', customerType: 'individual' })
  })

  it('falls back to the columns without a profile', () => {
    expect(readCustomerDetails(columns, null)).toMatchObject({ name: 'Column Name', phone: '+37100000000', customerType: 'individual' })
    expect(readCustomerDetails(columns, ['not', 'an', 'object'])).toMatchObject({ name: 'Column Name' })
  })
})

describe('syncCheckoutProfile', () => {
  it('leaves accounts without a checkout profile alone', () => {
    expect(syncCheckoutProfile({ ...columns, checkoutProfile: null }, { name: 'New' })).toBeUndefined()
  })

  it('makes an individual → company switch survive a reload', () => {
    const before = { ...columns, checkoutProfile: profile }
    const updates = { name: 'SIA Salons', customerType: 'company' as const, registrationNumber: '40003000001', phone: '+37122222222' }
    expect(reloaded(before, updates)).toMatchObject({ name: 'SIA Salons', customerType: 'company', registrationNumber: '40003000001' })
    expect(syncCheckoutProfile(before, updates)).toMatchObject({
      customerType: 'company', companyName: 'SIA Salons', regNumber: '40003000001',
      // Customer-owned fields the admin did not edit stay as the customer entered them.
      firstName: 'Anna Marija', lastName: 'Ozola', address: 'Brīvības 1', bankName: '',
    })
  })

  it('makes a company → individual switch survive a reload', () => {
    const before = { ...columns, customerType: 'company', checkoutProfile: { ...profile, customerType: 'company', companyName: 'SIA Old', regNumber: '40003000001' } }
    const updates = { name: 'Jānis Bērziņš', customerType: 'individual' as const, registrationNumber: null, phone: '+37122222222' }
    expect(reloaded(before, updates)).toMatchObject({ name: 'Jānis Bērziņš', customerType: 'individual' })
  })

  it('keeps the customer first/last name split when the admin did not change the name', () => {
    const before = { ...columns, checkoutProfile: profile }
    const next = syncCheckoutProfile(before, { name: 'Anna Marija Ozola', phone: '+37133333333', customerType: 'individual', registrationNumber: null })
    expect(next).toMatchObject({ firstName: 'Anna Marija', lastName: 'Ozola', phone: '+37133333333' })
  })

  it('writes a changed individual name and phone so the reload shows them', () => {
    const before = { ...columns, checkoutProfile: profile }
    const updates = { name: 'Anna Kalniņa', phone: '+37144444444', customerType: 'individual' as const, registrationNumber: null }
    expect(reloaded(before, updates)).toMatchObject({ name: 'Anna Kalniņa', phone: '+37144444444' })
  })

  it('clears name and phone when the admin empties them', () => {
    const before = { ...columns, name: null, phone: null, checkoutProfile: profile }
    const updates = { name: null, phone: null, customerType: 'individual' as const, registrationNumber: null }
    expect(reloaded(before, updates)).toMatchObject({ name: null, phone: null })
  })

  it('does not copy the person name into an empty company name on an unrelated edit', () => {
    const before = { ...columns, customerType: 'company', checkoutProfile: { ...profile, customerType: 'company', companyName: '' } }
    const next = syncCheckoutProfile(before, { name: 'Column Name', phone: '+37155555555', customerType: 'company', registrationNumber: null })
    expect(next).toMatchObject({ companyName: '', phone: '+37155555555' })
  })

  it('does not touch the profile for email-only edits', () => {
    expect(syncCheckoutProfile({ ...columns, checkoutProfile: profile }, { email: 'new@example.com' })).toBeUndefined()
  })
})

describe('syncCheckoutProfile — VAT number and legal address', () => {
  const company = { ...columns, customerType: 'company', companyName: 'SIA Salons', registrationNumber: '40003000001' }
  const companyProfile = { ...profile, customerType: 'company', companyName: 'SIA Salons', regNumber: '40003000001', vatNumber: 'LV40003000001', legalAddress: 'Rīga, Old 1' }
  const legalSave = { name: 'SIA Salons', phone: '+37122222222', customerType: 'company' as const, registrationNumber: '40003000001' }

  it('writes an edited VAT number and legal address so the reload shows them', () => {
    const before = { ...company, checkoutProfile: companyProfile }
    const updates = { ...legalSave, vatNumber: 'LV40003999999', legalAddress: 'Rīga, New 2' }
    expect(reloaded(before, updates)).toMatchObject({ vatNumber: 'LV40003999999', legalAddress: 'Rīga, New 2', name: 'SIA Salons' })
    expect(syncCheckoutProfile(before, updates)).toMatchObject({
      vatNumber: 'LV40003999999', legalAddress: 'Rīga, New 2', companyName: 'SIA Salons', bankName: '', address: 'Brīvības 1',
    })
  })

  it('lets a company clear its VAT number and legal address', () => {
    const before = { ...company, checkoutProfile: companyProfile }
    expect(syncCheckoutProfile(before, { ...legalSave, vatNumber: null, legalAddress: null })).toMatchObject({ vatNumber: '', legalAddress: '' })
  })

  it('keeps the stored VAT number when the account becomes an individual', () => {
    const before = { ...company, checkoutProfile: companyProfile }
    const next = syncCheckoutProfile(before, { name: 'Anna Ozola', phone: null, customerType: 'individual', registrationNumber: null, vatNumber: null, legalAddress: null })
    expect(next).toMatchObject({ customerType: 'individual', vatNumber: 'LV40003000001', legalAddress: 'Rīga, Old 1' })
  })

  it('creates a minimal profile so checkout prefills an admin-entered VAT number', () => {
    const before = { ...company, checkoutProfile: null }
    const next = syncCheckoutProfile(before, { ...legalSave, vatNumber: 'LV40003000001', legalAddress: 'Rīga, Iela 3' })
    expect(next).toEqual({
      customerType: 'company', regNumber: '40003000001', phone: '+37122222222', vatNumber: 'LV40003000001', legalAddress: 'Rīga, Iela 3',
    })
    // The checkout form (and so the order's legal details on the invoice) is prefilled from it.
    const prefill = buildCheckoutProfileFallback({ email: 'salon@example.com', name: 'SIA Salons', checkoutProfile: next as unknown as CheckoutProfile })
    expect(prefill).toMatchObject({ customerType: 'company', regNumber: '40003000001', vatNumber: 'LV40003000001', legalAddress: 'Rīga, Iela 3' })
    // The admin list keeps showing the same company after the reload.
    expect(readCustomerDetails({ ...before, vatNumber: 'LV40003000001', legalAddress: 'Rīga, Iela 3' }, next))
      .toMatchObject({ name: 'Column Name', companyName: 'SIA Salons', vatNumber: 'LV40003000001', legalAddress: 'Rīga, Iela 3' })
  })

  it('still leaves profile-less accounts alone when no VAT number or legal address is set', () => {
    expect(syncCheckoutProfile({ ...company, checkoutProfile: null }, { ...legalSave, vatNumber: null, legalAddress: null })).toBeUndefined()
  })
})

describe('syncCheckoutProfile — bank, IBAN and delivery address', () => {
  const company = { ...columns, customerType: 'company', companyName: 'SIA Salons', registrationNumber: '40003000001' }
  const companyProfile = { ...profile, customerType: 'company', companyName: 'SIA Salons', regNumber: '40003000001', bankName: 'Old Bank', iban: 'LV00OLD0000000000000' }
  const save = { name: 'SIA Salons', phone: '+37122222222', customerType: 'company' as const, registrationNumber: '40003000001' }

  it('writes bank, IBAN and the delivery address to the checkout profile keys', () => {
    const before = { ...company, checkoutProfile: companyProfile }
    const updates = { ...save, bankName: 'Swedbank', iban: 'LV80HABA0551000000001', deliveryAddress: 'Tērbatas 5', deliveryCity: 'Rīga', deliveryPostalCode: 'LV-1011' }
    expect(syncCheckoutProfile(before, updates)).toMatchObject({
      bankName: 'Swedbank', iban: 'LV80HABA0551000000001', address: 'Tērbatas 5', city: 'Rīga', postalCode: 'LV-1011',
    })
    expect(reloaded(before, updates)).toMatchObject({
      bankName: 'Swedbank', iban: 'LV80HABA0551000000001', address: 'Tērbatas 5, Rīga, LV-1011',
      deliveryAddress: 'Tērbatas 5', deliveryCity: 'Rīga', deliveryPostalCode: 'LV-1011',
    })
  })

  it('clears bank, IBAN and delivery address for a company when emptied', () => {
    const before = { ...company, checkoutProfile: companyProfile }
    expect(syncCheckoutProfile(before, { ...save, bankName: null, iban: null, deliveryAddress: null, deliveryCity: null, deliveryPostalCode: null }))
      .toMatchObject({ bankName: '', iban: '', address: '', city: '', postalCode: '' })
  })

  it('keeps bank and IBAN for an individual but lets the admin edit the delivery address', () => {
    const before = { ...company, checkoutProfile: companyProfile }
    const next = syncCheckoutProfile(before, { name: 'Anna Ozola', phone: null, customerType: 'individual', registrationNumber: null, bankName: null, iban: null, deliveryAddress: 'Elizabetes 2' })
    expect(next).toMatchObject({ customerType: 'individual', bankName: 'Old Bank', iban: 'LV00OLD0000000000000', address: 'Elizabetes 2' })
  })

  it('creates a minimal profile for a delivery address on a profile-less account', () => {
    const next = syncCheckoutProfile({ ...columns, checkoutProfile: null }, { deliveryAddress: 'Elizabetes 2', deliveryCity: 'Rīga', deliveryPostalCode: 'LV-1010' })
    expect(next).toEqual({ customerType: 'individual', address: 'Elizabetes 2', city: 'Rīga', postalCode: 'LV-1010' })
    expect(buildCheckoutProfileFallback({ email: 'anna@example.com', name: 'Anna Ozola', checkoutProfile: next as unknown as CheckoutProfile }))
      .toMatchObject({ firstName: 'Anna', lastName: 'Ozola', address: 'Elizabetes 2', city: 'Rīga', postalCode: 'LV-1010' })
  })
})

describe('omitProfileOnlyFields', () => {
  it('drops the fields that have no User column', () => {
    expect(omitProfileOnlyFields({ vatNumber: 'LV1', bankName: 'B', iban: 'I', deliveryAddress: 'A', deliveryCity: 'C', deliveryPostalCode: 'P', email: 'e@x.lv' }))
      .toEqual({ vatNumber: 'LV1', email: 'e@x.lv' })
  })
})
