/**
 * Card numbers are numeric identifiers, not fixed-width display values.
 * Leading zeroes therefore do not carry meaning: 1, 01 and 0001 identify
 * the same card. Non-numeric legacy values are left intact for login
 * compatibility, but new/claimed cards must pass isValidCardNumber().
 */
export function normalizeCardNumber(value: string): string {
  const compact = value.trim().replace(/\s+/g, '').toUpperCase()
  if (!/^\d+$/.test(compact)) return compact
  return compact.replace(/^0+(?=\d)/, '')
}

export function isValidCardNumber(value: string): boolean {
  return /^\d{1,6}$/.test(normalizeCardNumber(value))
}
