export type ClientType = 'individual' | 'company'

export type ClientTypeSourceRow = {
  cardNumber: string | null
  sourceType: string | null
  registrationNumber: string | null
}

export type ClientTypeImportRow = {
  cardNumber: string
  customerType: ClientType
  registrationNumber: string | null
}

export const normalizeRegistrationNumber = (value: unknown): string | null => {
  if (value === null || value === undefined) return null
  const digits = String(value).replace(/\D/gu, '')
  return digits || null
}

export const mapClientTypeRow = (row: ClientTypeSourceRow): ClientTypeImportRow | null => {
  if (!row.cardNumber) return null
  const sourceType = row.sourceType?.trim().toLocaleLowerCase('ru-RU')
  if (sourceType !== 'юр' && sourceType !== 'физ') return null
  const customerType: ClientType = sourceType === 'юр' ? 'company' : 'individual'
  return {
    cardNumber: row.cardNumber,
    customerType,
    registrationNumber: customerType === 'company'
      ? normalizeRegistrationNumber(row.registrationNumber)
      : null,
  }
}
