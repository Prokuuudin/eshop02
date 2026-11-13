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
  deliveryAddress?: string | null
  deliveryCity?: string | null
  deliveryPostalCode?: string | null
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

export type CardHolderEdit = {
  name: string
  email: string
  phone: string
  customerType: 'individual' | 'company'
  registrationNumber: string
  vatNumber: string
  legalAddress: string
  bankName: string
  iban: string
  deliveryAddress: string
  deliveryCity: string
  deliveryPostalCode: string
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
    vatNumber: holder.vatNumber ?? '',
    legalAddress: holder.legalAddress ?? '',
    bankName: holder.bankName ?? '',
    iban: holder.iban ?? '',
    deliveryAddress: holder.deliveryAddress ?? '',
    deliveryCity: holder.deliveryCity ?? '',
    deliveryPostalCode: holder.deliveryPostalCode ?? '',
  }
}

/**
 * Why a client save failed, from the real API status and error code. The same 403 can mean a
 * missing permission, a staff account that only a Super Admin may edit, or a rejected request
 * origin; step-up codes mean "confirm with password, 2FA code and reason", not "no permission".
 */
export type ClientSaveFailure =
  | 'step_up_required'
  | 'step_up_failed'
  | 'session_expired'
  | 'staff_account'
  | 'forbidden'
  | 'origin_rejected'
  | 'email_taken'
  | 'invalid'
  | 'conflict'
  | 'not_found'
  | 'rate_limited'
  | 'unknown'

export function classifyClientSaveFailure(status: number, code: string | undefined): ClientSaveFailure {
  if (code === 'change_reason_required' || code === 'reauthentication_required') return 'step_up_required'
  if (code === 'reauthentication_failed') return 'step_up_failed'
  if (status === 401) return 'session_expired'
  if (code === 'super_admin_required') return 'staff_account'
  if (status === 403 && code === 'forbidden') return 'forbidden'
  if (status === 403 && code === 'Origin not allowed') return 'origin_rejected'
  if (code === 'email_taken') return 'email_taken'
  if (code === 'invalid_request') return 'invalid'
  if (code === 'optimistic_conflict' || code === 'concurrent_update') return 'conflict'
  if (status === 404) return 'not_found'
  if (status === 429) return 'rate_limited'
  return 'unknown'
}

export type ClientStepUp = { currentPassword: string; mfaCode: string; reason: string }

export const isCompleteClientStepUp = (stepUp: ClientStepUp): boolean =>
  stepUp.currentPassword.length > 0 && /^\d{6}$/u.test(stepUp.mfaCode.trim()) && stepUp.reason.trim().length >= 5
