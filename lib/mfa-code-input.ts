// Shared (client + server) rules for what a person types on the MFA step.
// 'app': the 6-digit code from the authenticator app.
// 'recovery': one of the 8 backup codes issued at setup — 10 lowercase hex characters
// (lib/mfa.ts generateBackupCodes). People copy them by hand or paste them from notes,
// so case and any non-alphanumeric character (spaces, hyphens, list bullets such as "•")
// are ignored; the result must still be exactly 10 hex characters. Digits are never
// dropped, so a numbered list entry ("1. a1b2…") is rejected rather than guessed at.
// The stored bcrypt hashes are always of the lowercase form.
export type MfaCodeMode = 'app' | 'recovery'

export const RECOVERY_CODE_LENGTH = 10
const RECOVERY_CODE_PATTERN = /^[0-9a-f]{10}$/
const NON_ALPHANUMERIC = /[^0-9a-z]+/gi

/** Canonical form of a typed backup code, or null when it cannot be one. */
export function normalizeRecoveryCode(raw: string): string | null {
  if (raw.length > 64) return null
  const compact = raw.replace(NON_ALPHANUMERIC, '').toLowerCase()
  return RECOVERY_CODE_PATTERN.test(compact) ? compact : null
}

/** Live input filter for the MFA field in the given mode. */
export function sanitizeMfaCodeInput(mode: MfaCodeMode, raw: string): string {
  if (mode === 'app') return raw.replace(/\D+/g, '').slice(0, 6)
  return raw.replace(NON_ALPHANUMERIC, '').toLowerCase().slice(0, RECOVERY_CODE_LENGTH)
}

/** Whether the field holds a complete code for its mode (enables the submit button). */
export function isMfaCodeComplete(mode: MfaCodeMode, value: string): boolean {
  return mode === 'app' ? /^\d{6}$/.test(value) : normalizeRecoveryCode(value) !== null
}
