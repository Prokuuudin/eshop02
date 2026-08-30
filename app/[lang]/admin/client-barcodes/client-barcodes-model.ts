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
  personalCodeMasked: string | null
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

export type CardHolderEdit = {
  name: string
  email: string
  phone: string
  customerType: 'individual' | 'company'
  registrationNumber: string
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

export function getCardHolderEdit(holder: CardHolder): CardHolderEdit {
  return {
    name: holder.name ?? '',
    email: holder.email.endsWith('@client.local') ? '' : holder.email,
    phone: holder.phone ?? '',
    customerType: holder.customerType === 'company' ? 'company' : 'individual',
    registrationNumber: holder.registrationNumber ?? '',
  }
}
