import { describe, expect, it } from 'vitest'
import {
  applyCustomerChanges,
  changedFields,
  nextCheckoutProfile,
  normalizePhone,
  readCustomerCanonical,
  readProfileDrift,
  userColumnUpdates,
  type CustomerUserRow,
} from './customer-edit-model'

const row = (fields: Partial<CustomerUserRow> = {}): CustomerUserRow => ({
  id: 'u1', email: '9001@client.local', name: 'Anna Example', phone: '+37120000001', cardNumber: '9001',
  customerType: 'individual', companyName: null, registrationNumber: null, vatNumber: null, legalAddress: null,
  checkoutProfile: null, updatedAt: new Date('2026-10-27T10:00:00.000Z'), ...fields,
})

describe('readCustomerCanonical', () => {
  it('lets a column win over its checkoutProfile mirror', () => {
    const canonical = readCustomerCanonical(row({
      phone: '+37120000001', customerType: 'company', companyName: 'SIA Correct', registrationNumber: '40000000001',
      checkoutProfile: { phone: '+37129999999', companyName: 'SIA Stale', regNumber: '40000000009', address: 'Street 1' },
    }))
    expect(canonical).toMatchObject({ phone: '+37120000001', companyName: 'SIA Correct', registrationNumber: '40000000001', address: 'Street 1' })
  })

  it('falls back to the mirror only when the column is empty (legacy rows)', () => {
    expect(readCustomerCanonical(row({ phone: null, checkoutProfile: { phone: '+37120000002' } })).phone).toBe('+37120000002')
  })

  it('keeps a multi-word first name from the profile when it spells the stored full name', () => {
    const canonical = readCustomerCanonical(row({ name: 'Anna Marija Example', checkoutProfile: { firstName: 'Anna Marija', lastName: 'Example' } }))
    expect(canonical).toMatchObject({ firstName: 'Anna Marija', lastName: 'Example' })
    expect(readCustomerCanonical(row({ name: 'Anna Example', checkoutProfile: { firstName: 'Old', lastName: 'Name' } })))
      .toMatchObject({ firstName: 'Anna', lastName: 'Example' })
  })

  it('reports mirror drift for staff', () => {
    expect(readProfileDrift(row({ checkoutProfile: { phone: '+37129999999' } }))).toEqual({ phone: '+37129999999' })
    expect(readProfileDrift(row())).toEqual({})
  })
})

describe('applyCustomerChanges', () => {
  const current = readCustomerCanonical(row())

  it('normalizes email, phone, card and names', () => {
    const { next, errors } = applyCustomerChanges(current, {
      email: ' Anna@Example.TEST ', phone: '20 000 003', cardNumber: ' 0042 ', firstName: '  Anna  ', lastName: ' New  Name ',
    })
    expect(errors).toEqual([])
    expect(next).toMatchObject({ email: 'anna@example.test', phone: '+37120000003', cardNumber: '42', firstName: 'Anna', lastName: 'New Name' })
  })

  it.each([
    [{ email: 'not-an-email' }, 'email', 'invalid_email'],
    [{ email: '1234@client.local' }, 'email', 'synthetic_email_forbidden'],
    [{ phone: '123' }, 'phone', 'invalid_phone'],
    [{ cardNumber: '1234567' }, 'cardNumber', 'invalid_card_number'],
    [{ cardNumber: '' }, 'cardNumber', 'invalid_card_number'],
    [{ firstName: '' }, 'firstName', 'required'],
    [{ firstName: 'Anna\u0000' }, 'firstName', 'invalid_characters'],
    [{ firstName: 'Jeпena' }, 'firstName', 'name_encoding_suspect'],
    [{ iban: 'LV12' }, 'iban', 'invalid_iban'],
  ])('rejects %o', (changes, field, code) => {
    expect(applyCustomerChanges(current, changes).errors).toContainEqual({ field, code })
  })

  it('accepts genuine Cyrillic and Latvian names', () => {
    expect(applyCustomerChanges(current, { firstName: 'Анна', lastName: 'Bērziņa' }).errors).toEqual([])
  })

  it('requires company name and an 11-digit registration number for a company', () => {
    const { errors } = applyCustomerChanges(current, { customerType: 'company', registrationNumber: '123' })
    expect(errors).toEqual(expect.arrayContaining([
      { field: 'companyName', code: 'required' },
      { field: 'registrationNumber', code: 'invalid_registration_number' },
    ]))
    const valid = applyCustomerChanges(current, { customerType: 'company', companyName: 'SIA Test', registrationNumber: 'LV 4000-0000-001', vatNumber: 'lv 40000000001' })
    expect(valid.errors).toEqual([])
    expect(valid.next).toMatchObject({ registrationNumber: '40000000001', vatNumber: 'LV40000000001' })
  })

  it('clears company requisites for an individual', () => {
    const company = readCustomerCanonical(row({ customerType: 'company', companyName: 'SIA Test', registrationNumber: '40000000001', vatNumber: 'LV40000000001', legalAddress: 'Riga' }))
    const { next } = applyCustomerChanges(company, { customerType: 'individual' })
    expect(next).toMatchObject({ companyName: '', registrationNumber: '', vatNumber: '', legalAddress: '' })
  })

  it('does not block an unrelated edit of a legacy company row with incomplete requisites', () => {
    const legacy = readCustomerCanonical(row({ customerType: 'company', companyName: 'SIA Legacy', registrationNumber: null }))
    expect(applyCustomerChanges(legacy, { phone: '+37120000004' }).errors).toEqual([])
  })
})

describe('writes', () => {
  const current = readCustomerCanonical(row({ checkoutProfile: { firstName: 'Anna', lastName: 'Example', phone: '+37129999999', address: 'Street 1' } }))

  it('writes only changed columns', () => {
    const { next } = applyCustomerChanges(current, { lastName: 'Changed' })
    expect(userColumnUpdates(next, changedFields(current, next))).toEqual({ name: 'Anna Changed' })
  })

  it('re-writes every mirror of an existing profile, healing drift', () => {
    const { next } = applyCustomerChanges(current, { lastName: 'Changed' })
    const profile = nextCheckoutProfile({ firstName: 'Anna', lastName: 'Example', phone: '+37129999999', address: 'Street 1', extra: 'kept' }, next, changedFields(current, next))
    expect(profile).toMatchObject({ lastName: 'Changed', phone: '+37120000001', address: 'Street 1', extra: 'kept' })
  })

  it('does not create a profile for a contact edit, but does for a delivery address', () => {
    const plain = readCustomerCanonical(row())
    const contact = applyCustomerChanges(plain, { phone: '+37120000005' }).next
    expect(nextCheckoutProfile(null, contact, changedFields(plain, contact))).toBeUndefined()
    const address = applyCustomerChanges(plain, { address: 'Street 9', city: 'Riga' }).next
    expect(nextCheckoutProfile(null, address, changedFields(plain, address))).toMatchObject({ address: 'Street 9', city: 'Riga', firstName: 'Anna', phone: '+37120000001' })
  })
})

describe('normalizePhone', () => {
  it.each([
    ['20 000 003', '+37120000003'],
    ['+371 2000-0003', '+37120000003'],
    ['00371 20000003', '+37120000003'],
    ['37120000003', '+37120000003'],
    ['+49 (30) 1234567', '+49301234567'],
  ])('normalizes %s', (raw, expected) => {
    expect(normalizePhone(raw)).toBe(expected)
  })

  it.each(['123', '+12', 'phone', '2000000', '+1234567890123456'])('rejects %s', (raw) => {
    expect(normalizePhone(raw)).toBeUndefined()
  })
})
