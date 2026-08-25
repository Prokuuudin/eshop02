import 'server-only'
import bcrypt from 'bcryptjs'
import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto'
import { generateSecret, verify, generateURI } from 'otplib'

const ISSUER = 'hairshoppro.lv'
const BACKUP_CODE_COUNT = 8
const BACKUP_CODE_BCRYPT_COST = 12
const EPOCH_TOLERANCE_SECONDS = 30 // +/- one 30s TOTP step, covers normal clock drift

function getEncryptionKey(): Buffer {
  const raw = process.env.MFA_ENCRYPTION_KEY
  if (!raw) throw new Error('MFA_ENCRYPTION_KEY is not configured')
  const key = Buffer.from(raw, 'base64')
  if (key.length !== 32) throw new Error('MFA_ENCRYPTION_KEY must decode to exactly 32 bytes')
  return key
}

/** AES-256-GCM, random 12-byte IV per call. Output: "iv.authTag.ciphertext", each base64. */
export function encryptSecret(secret: string): string {
  const key = getEncryptionKey()
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return [iv, authTag, ciphertext].map((b) => b.toString('base64')).join('.')
}

export function decryptSecret(encrypted: string): string {
  const [ivB64, authTagB64, ciphertextB64] = encrypted.split('.')
  const key = getEncryptionKey()
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'))
  decipher.setAuthTag(Buffer.from(authTagB64, 'base64'))
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextB64, 'base64')),
    decipher.final(),
  ])
  return plaintext.toString('utf8')
}

export function generateTotpSecret(): string {
  return generateSecret()
}

export function buildOtpauthUri(email: string, secret: string): string {
  return generateURI({ issuer: ISSUER, label: email, secret })
}

export async function verifyTotpCode(secret: string, code: string): Promise<boolean> {
  if (!/^\d{6}$/.test(code)) return false
  const result = await verify({ secret, token: code, epochTolerance: EPOCH_TOLERANCE_SECONDS })
  return result.valid
}

/** 8 codes, 10 hex chars each (40 bits of entropy) — shown once, never persisted in plaintext. */
export function generateBackupCodes(): string[] {
  return Array.from({ length: BACKUP_CODE_COUNT }, () => randomBytes(5).toString('hex'))
}

export async function hashBackupCodes(codes: string[]): Promise<string[]> {
  return Promise.all(codes.map((code) => bcrypt.hash(code, BACKUP_CODE_BCRYPT_COST)))
}

/** Single-use: on match, returns the hash list with that entry removed. */
export async function consumeBackupCode(
  hashes: string[],
  code: string
): Promise<{ ok: boolean; remaining: string[] }> {
  for (let i = 0; i < hashes.length; i++) {
    if (await bcrypt.compare(code, hashes[i])) {
      return { ok: true, remaining: [...hashes.slice(0, i), ...hashes.slice(i + 1)] }
    }
  }
  return { ok: false, remaining: hashes }
}
