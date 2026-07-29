import { parsePhoneNumber, type Country } from 'react-phone-number-input'

/** Convert saved/formatted or national phone input to the value expected by PhoneInput. */
export function normalizePhoneInputValue(value: string, defaultCountry: Country = 'LV'): string | undefined {
  const trimmed = value.trim()
  if (!trimmed) return undefined

  try {
    return parsePhoneNumber(trimmed, defaultCountry)?.number
  } catch {
    return undefined
  }
}
