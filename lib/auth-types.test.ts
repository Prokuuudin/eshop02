import { describe, it, expect } from 'vitest'
import { isPasswordChangeSoft } from './auth-types'

describe('isPasswordChangeSoft', () => {
  it('is false when mustChangePassword is not set', () => {
    expect(isPasswordChangeSoft({ mustChangePassword: false, pkLast3: 'ABC', companyId: null })).toBe(false)
  })

  it('is true for a verified individual card+PK login', () => {
    expect(isPasswordChangeSoft({ mustChangePassword: true, pkLast3: 'ABC', companyId: null })).toBe(true)
  })

  it('is false when there is no personal code on file', () => {
    expect(isPasswordChangeSoft({ mustChangePassword: true, pkLast3: null, companyId: null })).toBe(false)
  })

  it('is false for a B2B company member even if pkLast3 happens to be set', () => {
    expect(isPasswordChangeSoft({ mustChangePassword: true, pkLast3: 'ABC', companyId: 'company_1' })).toBe(false)
  })

  it('is false for the access-request Welcome1! shape (no pkLast3, no company)', () => {
    expect(isPasswordChangeSoft({ mustChangePassword: true, pkLast3: undefined, companyId: undefined })).toBe(false)
  })
})
