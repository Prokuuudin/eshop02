import { describe, it, expect, beforeAll, vi } from 'vitest'
import {
  encryptSecret,
  decryptSecret,
  generateTotpSecret,
  buildOtpauthUri,
  verifyTotpCode,
  generateBackupCodes,
  hashBackupCodes,
  consumeBackupCode,
} from './mfa'
import { generate } from 'otplib'

vi.mock('server-only', () => ({}))

beforeAll(() => {
  process.env.MFA_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64')
})

describe('encryptSecret / decryptSecret', () => {
  it('round-trips a secret', () => {
    const encrypted = encryptSecret('JBSWY3DPEHPK3PXP')
    expect(encrypted).not.toContain('JBSWY3DPEHPK3PXP')
    expect(decryptSecret(encrypted)).toBe('JBSWY3DPEHPK3PXP')
  })

  it('produces different ciphertext for the same secret each time (random IV)', () => {
    const a = encryptSecret('JBSWY3DPEHPK3PXP')
    const b = encryptSecret('JBSWY3DPEHPK3PXP')
    expect(a).not.toBe(b)
  })

  it('rejects tampered ciphertext, a truncated tag and legacy plaintext — never falls back to plaintext', () => {
    const [iv, tag, ct] = encryptSecret('JBSWY3DPEHPK3PXP').split('.')
    const flipped = Buffer.from(ct, 'base64')
    flipped[0] ^= 1
    expect(() => decryptSecret([iv, tag, flipped.toString('base64')].join('.'))).toThrow()
    const shortTag = Buffer.from(tag, 'base64').subarray(0, 4).toString('base64')
    expect(() => decryptSecret([iv, shortTag, ct].join('.'))).toThrow()
    expect(() => decryptSecret('JBSWY3DPEHPK3PXP')).toThrow()
  })

  it('fails closed when the key is missing, the wrong size, or a different key', () => {
    const encrypted = encryptSecret('JBSWY3DPEHPK3PXP')
    const original = process.env.MFA_ENCRYPTION_KEY
    try {
      delete process.env.MFA_ENCRYPTION_KEY
      expect(() => encryptSecret('x')).toThrow('MFA_ENCRYPTION_KEY is not configured')
      expect(() => decryptSecret(encrypted)).toThrow()
      process.env.MFA_ENCRYPTION_KEY = Buffer.alloc(16, 1).toString('base64')
      expect(() => encryptSecret('x')).toThrow('exactly 32 bytes')
      process.env.MFA_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString('base64')
      expect(() => decryptSecret(encrypted)).toThrow()
    } finally {
      process.env.MFA_ENCRYPTION_KEY = original
    }
  })
})

describe('generateTotpSecret / buildOtpauthUri', () => {
  it('generates a base32-looking secret', () => {
    const secret = generateTotpSecret()
    expect(secret.length).toBeGreaterThan(10)
    expect(secret).toMatch(/^[A-Z2-7]+=*$/)
  })

  it('builds an otpauth:// URI containing the issuer and email', () => {
    const uri = buildOtpauthUri('admin@test.com', 'JBSWY3DPEHPK3PXP')
    expect(uri).toMatch(/^otpauth:\/\/totp\//)
    expect(uri).toContain('admin%40test.com')
  })
})

describe('verifyTotpCode', () => {
  it('accepts the current valid code', async () => {
    const secret = generateTotpSecret()
    const code = await generate({ secret })
    expect(await verifyTotpCode(secret, code)).toBe(true)
  })

  it('rejects a wrong code', async () => {
    const secret = generateTotpSecret()
    expect(await verifyTotpCode(secret, '000000')).toBe(false)
  })

  it('rejects a non-6-digit input without touching otplib', async () => {
    const secret = generateTotpSecret()
    expect(await verifyTotpCode(secret, 'abcdef')).toBe(false)
    expect(await verifyTotpCode(secret, '12345')).toBe(false)
  })
})

describe('backup codes', () => {
  it('generates 8 unique codes', () => {
    const codes = generateBackupCodes()
    expect(codes).toHaveLength(8)
    expect(new Set(codes).size).toBe(8)
  })

  // bcryptjs is a pure-JS implementation (no native bindings); hashing 8
  // codes at cost 12 can exceed Vitest's 5s default on slower machines.
  it('hashes codes and later consumes exactly one, removing it from the list', async () => {
    const codes = generateBackupCodes()
    const hashes = await hashBackupCodes(codes)

    const { ok, remaining } = await consumeBackupCode(hashes, codes[3])
    expect(ok).toBe(true)
    expect(remaining).toHaveLength(7)

    const { ok: reuseOk } = await consumeBackupCode(remaining, codes[3])
    expect(reuseOk).toBe(false)
  }, 20000)

  it('rejects a code that was never issued', async () => {
    const codes = generateBackupCodes()
    const hashes = await hashBackupCodes(codes)
    const { ok } = await consumeBackupCode(hashes, 'not-a-real-code')
    expect(ok).toBe(false)
  }, 20000)
})
