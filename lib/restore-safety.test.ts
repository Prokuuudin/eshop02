import { describe, expect, it } from 'vitest'
import { assertSafeRestoreUrl } from './restore-safety'

describe('restore safety', () => {
  it('requires a restore database', () => {
    expect(() => assertSafeRestoreUrl(undefined, 'postgres://production')).toThrow('RESTORE_DATABASE_URL is required')
  })

  it('refuses to inspect production as a restore target', () => {
    expect(() => assertSafeRestoreUrl('postgres://same', 'postgres://same')).toThrow('must not equal')
  })

  it('accepts a distinct isolated restore target', () => {
    expect(assertSafeRestoreUrl('postgres://restore', 'postgres://production')).toBe('postgres://restore')
  })
})
