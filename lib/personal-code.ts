// Last-3-characters only, by design: this is all the registration flow ever
// needs to verify, and storing the full personal code / registration number
// would needlessly widen the sensitive-data footprint (project is GDPR-scoped).
export function derivePkLast3(rawPk: string | null | undefined): string | null {
  if (!rawPk) return null
  const cleaned = rawPk.trim().replace(/[^0-9A-Za-z]/g, '')
  if (cleaned.length < 3) return null
  return cleaned.slice(-3).toUpperCase()
}
