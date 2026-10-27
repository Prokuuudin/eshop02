export type NoCardRequest = {
  id: string
  email: string
  name: string | null
  phone: string | null
  requestType: string
  certificateName: string | null
  message: string | null
  language: string | null
  requestedAt: string
}

export type CardHolder = {
  id: string
  email: string
  name: string | null
  personName: string | null
  phone: string | null
  cardNumber: string | null
  bonusPoints: number
  companyName: string | null
  customerType: 'individual' | 'company' | null
  registrationNumber: string | null
  vatNumber: string | null
  legalAddress: string | null
  address: string | null
  bankName: string | null
  iban: string | null
  registered: boolean
  registeredAt: string | null
  updatedAt: string
}

export type NoCardDraft = {
  customerType: 'individual' | 'company'
  companyName: string
  registrationNumber: string
  cardNumber: string
}


export const normalizeCardDigits = (value: string): string => value.replace(/\D/g, '')
export const normalizeRegistrationNumber = (value: string): string => value.replace(/\D/g, '')
export const isValidCardNumber = (value: string): boolean => normalizeCardDigits(value).length >= 4 && normalizeCardDigits(value).length <= 6

export function createNoCardDraft(defaultName: string, cardNumber = ''): NoCardDraft {
  return { customerType: 'individual', companyName: defaultName, registrationNumber: '', cardNumber }
}

export function isValidCompanyDraft(draft: NoCardDraft): boolean {
  return draft.customerType !== 'company'
    || (!!draft.companyName.trim() && normalizeRegistrationNumber(draft.registrationNumber).length === 11)
}

/** Generated @client.local addresses are an internal login key, not a contact address. */
export function displayEmail(holder: Pick<CardHolder, 'email'>): string {
  return holder.email.endsWith('@client.local') ? '' : holder.email
}
