import { describe, expect, it } from 'vitest'
import { isMfaCodeComplete, normalizeRecoveryCode, sanitizeMfaCodeInput } from './mfa-code-input'

describe('normalizeRecoveryCode', () => {
  it('returns the issued lowercase form for case, space and hyphen variants', () => {
    expect(normalizeRecoveryCode('a1b2c3d4e5')).toBe('a1b2c3d4e5')
    expect(normalizeRecoveryCode(' A1B2C 3D4E5 ')).toBe('a1b2c3d4e5')
    expect(normalizeRecoveryCode('a1b2c-3d4e5')).toBe('a1b2c3d4e5')
  })

  it('ignores a list bullet and a space pasted from notes (owner Preview case)', () => {
    expect(normalizeRecoveryCode('• a1b2c3d4e5')).toBe('a1b2c3d4e5')
    expect(normalizeRecoveryCode('• A1B2C3D4E5\n')).toBe('a1b2c3d4e5')
    expect(normalizeRecoveryCode('* a1b2c3d4e5')).toBe('a1b2c3d4e5')
    expect(sanitizeMfaCodeInput('recovery', '• a1b2c3d4e5')).toBe('a1b2c3d4e5')
    expect(isMfaCodeComplete('recovery', sanitizeMfaCodeInput('recovery', '• a1b2c3d4e5'))).toBe(true)
  })

  it('keeps the format strict after cleaning: numbered entries and wrong lengths are rejected', () => {
    expect(normalizeRecoveryCode('1. a1b2c3d4e5')).toBeNull()
    expect(normalizeRecoveryCode('• a1b2c3d4')).toBeNull()
    expect(normalizeRecoveryCode('• a1b2c3d4e5 b')).toBeNull()
  })

  it('rejects anything that cannot be an issued code', () => {
    for (const input of ['123456', '', 'a1b2c3d4e', 'a1b2c3d4e5f', 'g1b2c3d4e5', 'a1b2c3d4e5'.padEnd(80, ' x')]) {
      expect(normalizeRecoveryCode(input)).toBeNull()
    }
  })
})

describe('MFA field: app code vs backup code mode', () => {
  it('app mode keeps only digits, at most 6, and needs exactly 6 to submit', () => {
    expect(sanitizeMfaCodeInput('app', '12 34-56')).toBe('123456')
    expect(sanitizeMfaCodeInput('app', '1234567')).toBe('123456')
    expect(sanitizeMfaCodeInput('app', 'abc')).toBe('')
    expect(isMfaCodeComplete('app', '12345')).toBe(false)
    expect(isMfaCodeComplete('app', '123456')).toBe(true)
  })

  it('backup mode keeps letters, lowercases, drops spaces/hyphens, at most 10 characters', () => {
    expect(sanitizeMfaCodeInput('recovery', 'A1B2C 3D4E5')).toBe('a1b2c3d4e5')
    expect(sanitizeMfaCodeInput('recovery', 'a1b2c-3d4e5-ff')).toBe('a1b2c3d4e5')
    expect(isMfaCodeComplete('recovery', 'a1b2c3d4e5')).toBe(true)
    expect(isMfaCodeComplete('recovery', 'a1b2c3d4')).toBe(false)
  })

  it('a 6-digit app code is not a complete backup code, and a backup code is not an app code', () => {
    expect(isMfaCodeComplete('recovery', '123456')).toBe(false)
    expect(isMfaCodeComplete('app', 'a1b2c3d4e5')).toBe(false)
    // Switching modes re-filters what was typed: letters never reach the app-code field.
    expect(sanitizeMfaCodeInput('app', sanitizeMfaCodeInput('recovery', 'a1b2c3d4e5'))).toBe('12345')
  })
})
