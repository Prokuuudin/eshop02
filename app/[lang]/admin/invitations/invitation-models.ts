export type Holder = {
  userId: string
  name: string | null
  email: string
  phone: string | null
  cardNumber: string
  status: 'none' | 'sent' | 'accepted' | 'expired' | 'error'
  sentAt: string | null
  inviteUrl: string | null
}

export type CampaignState = {
  sentCount: number
  errorCount: number
  cursor: string | null
  lastRunAt: string | null
  finished: boolean
  runningSince: string | null
}

export type EligibleUser = { id: string; name: string | null; email: string }
export type HolderSortKey = 'name' | 'email' | 'cardNumber' | 'status'
export type EligibleSortKey = 'name' | 'email' | 'status'
export type SortDir = 'asc' | 'desc'

export const isTechEmail = (email: string): boolean => email.toLowerCase().endsWith('@client.local')
export const HOLDER_STATUS_RANK: Record<Holder['status'], number> = { none: 0, sent: 1, accepted: 2, expired: 3, error: 4 }
export const INVITATIONS_PAGE_SIZE = 50
export const INVITE_BATCH_SIZE = 20
