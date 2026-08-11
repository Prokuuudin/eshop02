import { describe, it, expect } from 'vitest'
import {
  checkoutDefaultAddressId,
  pickPrefillAddress,
  splitName,
  mergeEmptyAddressFields,
  buildSaveBackAddress,
  buildPrefillFallback,
} from './checkout-address-prefill'
import type { SavedAddress } from './saved-addresses-store'

describe('checkoutDefaultAddressId', () => {
  it('builds a fixed id from the user id', () => {
    expect(checkoutDefaultAddressId('user_123')).toBe('checkout_default_user_123')
  })
})

describe('pickPrefillAddress', () => {
  const manual: SavedAddress = {
    id: 'addr_manual_1',
    firstName: 'Anna',
    lastName: 'Berzina',
    email: 'a@b.com',
    phone: '+37120000000',
    address: 'Brivibas 1',
    city: 'Riga',
    postalCode: 'LV-1010',
  }
  const checkoutDefault: SavedAddress = {
    id: 'checkout_default_user_123',
    firstName: 'Anna',
    lastName: 'Berzina',
    email: 'a@b.com',
    phone: '+37120000001',
    address: 'Krasta 5',
    city: 'Riga',
    postalCode: 'LV-1019',
  }

  it('prefers the checkout_default_<userId> entry when present', () => {
    const result = pickPrefillAddress([manual, checkoutDefault], 'user_123')
    expect(result).toBe(checkoutDefault)
  })

  it('falls back to the first saved address when no checkout-default entry exists', () => {
    const result = pickPrefillAddress([manual], 'user_123')
    expect(result).toBe(manual)
  })

  it('returns undefined when there are no saved addresses', () => {
    expect(pickPrefillAddress([], 'user_123')).toBeUndefined()
  })
})

describe('splitName', () => {
  it('splits on the first space', () => {
    expect(splitName('Ivan Petrov')).toEqual({ firstName: 'Ivan', lastName: 'Petrov' })
  })

  it('keeps multi-word last names intact', () => {
    expect(splitName('Anna De La Cruz')).toEqual({ firstName: 'Anna', lastName: 'De La Cruz' })
  })

  it('puts a single-word name entirely in firstName', () => {
    expect(splitName('Cher')).toEqual({ firstName: 'Cher', lastName: '' })
  })

  it('returns empty strings for undefined or blank input', () => {
    expect(splitName(undefined)).toEqual({ firstName: '', lastName: '' })
    expect(splitName('   ')).toEqual({ firstName: '', lastName: '' })
  })
})

describe('mergeEmptyAddressFields', () => {
  const empty = { firstName: '', lastName: '', email: '', phone: '', address: '', city: '', postalCode: '' }

  it('fills empty fields from the fallback', () => {
    const result = mergeEmptyAddressFields(empty, { firstName: 'Ivan', city: 'Riga' })
    expect(result.firstName).toBe('Ivan')
    expect(result.city).toBe('Riga')
    expect(result.lastName).toBe('')
  })

  it('never overwrites a field that already has a value (e.g. from a query param)', () => {
    const current = { ...empty, firstName: 'FromQueryParam' }
    const result = mergeEmptyAddressFields(current, { firstName: 'FromProfile' })
    expect(result.firstName).toBe('FromQueryParam')
  })

  it('ignores empty-string fallback values', () => {
    const result = mergeEmptyAddressFields(empty, { firstName: '' })
    expect(result.firstName).toBe('')
  })
})

describe('buildSaveBackAddress', () => {
  const fields = {
    firstName: 'Ivan',
    lastName: 'Petrov',
    email: 'typed-in-form@maybe-different.com',
    phone: '+37120000000',
    address: 'Brivibas 1',
    city: 'Riga',
    postalCode: 'LV-1010',
  }

  it('returns null for a guest (no user)', () => {
    expect(buildSaveBackAddress(null, fields)).toBeNull()
    expect(buildSaveBackAddress(undefined, fields)).toBeNull()
  })

  it('builds a SavedAddress keyed by the fixed checkout-default id', () => {
    const result = buildSaveBackAddress({ id: 'user_123', email: 'account@real.com' }, fields)
    expect(result?.id).toBe('checkout_default_user_123')
  })

  it("uses the account's canonical email, not whatever was typed in the form", () => {
    // SavedAddress rows are looked up by exact User.email match (GET /api/user/addresses
    // filters `where: { email: user.email }`) — saving a form-typed email that differs
    // from the account's would make the row invisible to that lookup.
    const result = buildSaveBackAddress({ id: 'user_123', email: 'account@real.com' }, fields)
    expect(result?.email).toBe('account@real.com')
  })

  it('carries over the rest of the submitted fields unchanged', () => {
    const result = buildSaveBackAddress({ id: 'user_123', email: 'account@real.com' }, fields)
    expect(result).toEqual({
      id: 'checkout_default_user_123',
      firstName: 'Ivan',
      lastName: 'Petrov',
      email: 'account@real.com',
      phone: '+37120000000',
      address: 'Brivibas 1',
      city: 'Riga',
      postalCode: 'LV-1010',
    })
  })
})

describe('buildPrefillFallback', () => {
  const saved: SavedAddress = {
    id: 'checkout_default_user_123',
    firstName: 'SavedFirst',
    lastName: 'SavedLast',
    email: 'a@b.com',
    phone: '+37120000001',
    address: 'Krasta 5',
    city: 'Riga',
    postalCode: 'LV-1019',
  }

  it('omits email when the user email is a synthetic @client.local address (saved-address branch)', () => {
    const result = buildPrefillFallback(
      { name: 'Ivan Petrov', phone: '+37100000000', email: 'card.1234@client.local' },
      saved,
      false
    )
    expect(result.email).toBeUndefined()
  })

  it('omits email when the user email is a synthetic @client.local address (profile branch)', () => {
    const result = buildPrefillFallback(
      { name: 'Ivan Petrov', phone: '+37100000000', email: 'card.1234@client.local' },
      undefined,
      false
    )
    expect(result.email).toBeUndefined()
  })

  it('returns the real email unchanged when it is not synthetic', () => {
    const result = buildPrefillFallback(
      { name: 'Ivan Petrov', phone: '+37100000000', email: 'real@example.com' },
      saved,
      false
    )
    expect(result.email).toBe('real@example.com')
  })

  it('uses the saved address fields when saved is present and there is no explicit address selection', () => {
    const result = buildPrefillFallback(
      { name: 'Ivan Petrov', phone: '+37100000000', email: 'real@example.com' },
      saved,
      false
    )
    expect(result).toEqual({
      firstName: 'SavedFirst',
      lastName: 'SavedLast',
      phone: '+37120000001',
      address: 'Krasta 5',
      city: 'Riga',
      postalCode: 'LV-1019',
      email: 'real@example.com',
    })
  })

  it('falls back to "" for a missing postalCode on the saved address', () => {
    const savedNoPostal: SavedAddress = { ...saved, postalCode: undefined as unknown as string }
    const result = buildPrefillFallback(
      { name: 'Ivan Petrov', phone: '+37100000000', email: 'real@example.com' },
      savedNoPostal,
      false
    )
    expect(result.postalCode).toBe('')
  })

  it('falls through to the profile branch when an explicit address was selected via query params, ignoring the saved address entirely', () => {
    const result = buildPrefillFallback(
      { name: 'Ivan Petrov', phone: '+37199999999', email: 'real@example.com' },
      saved,
      true
    )
    expect(result.firstName).toBe('Ivan')
    expect(result.lastName).toBe('Petrov')
    expect(result.phone).toBe('+37199999999')
    expect(result.city).toBeUndefined()
    expect(result.address).toBeUndefined()
    expect(result.postalCode).toBeUndefined()
    expect(result).not.toHaveProperty('city', saved.city)
    expect(result.email).toBe('real@example.com')
  })

  it('uses the profile branch when there is no saved address at all', () => {
    const result = buildPrefillFallback(
      { name: 'Ivan Petrov', phone: '+37199999999', email: 'real@example.com' },
      undefined,
      false
    )
    expect(result).toEqual({
      firstName: 'Ivan',
      lastName: 'Petrov',
      phone: '+37199999999',
      email: 'real@example.com',
    })
  })
})
