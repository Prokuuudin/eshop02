import type { DateFormatOption } from '@/lib/locale-config'

const pad2 = (n: number): string => String(n).padStart(2, '0')

function applyPattern(day: string, month: string, year: string, pattern: DateFormatOption): string {
  if (pattern === 'MM/DD/YYYY') return `${month}/${day}/${year}`
  if (pattern === 'YYYY-MM-DD') return `${year}-${month}-${day}`
  return `${day}.${month}.${year}`
}

/**
 * Renders a date using a fixed, language-independent numeric pattern (admin-configured).
 * Without `timeZone`, uses the Date object's own local getters — correct for client-side
 * rendering, where "local" is the visitor's own browser timezone. Pass `timeZone` (IANA
 * name) for server-rendered artifacts (e.g. order emails) that need one consistent
 * business timezone regardless of where the Node process itself runs.
 */
export function formatDateWithPattern(date: Date, pattern: DateFormatOption, timeZone?: string): string {
  if (timeZone) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date)
    const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? '00'
    return applyPattern(get('day'), get('month'), get('year'), pattern)
  }

  return applyPattern(pad2(date.getDate()), pad2(date.getMonth() + 1), String(date.getFullYear()), pattern)
}
