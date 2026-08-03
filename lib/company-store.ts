import { create } from 'zustand'
import { normalizeCardNumber } from '@/lib/card-number'

export type TeamMemberRole = 'viewer' | 'buyer' | 'manager' | 'admin'

export interface TeamMember {
  userId: string
  email: string
  role: TeamMemberRole
  name: string
  addedAt: Date
  addedBy?: string // User ID who invited this member
}
export interface CompanyProfile {
  companyId: string
  companyName: string
  cardNumber?: string // Номер карты клиента
  taxId?: string // ИНН
  registrationNumber?: string // Регистрационный номер
  address?: string
  city?: string
  country?: string
  contactPhone?: string
  contactEmail?: string
  accountManagerId?: string // ID of assigned account manager
  paymentTermDays: 30 | 60 | 90 | 0 // 0 = prepay
  creditLimit?: number // Maximum credit amount
  usedCredit: number // Current used credit
  teamMembers: TeamMember[]
  createdAt: Date
  approvalWorkflowEnabled: boolean // Требует ли одобрения заказов
}

type CompanyStore = {
  companies: Map<string, CompanyProfile>
  currentCompanyId?: string

  // Company management
  getCompanies: () => CompanyProfile[]
  createCompany: (profile: Omit<CompanyProfile, 'teamMembers' | 'usedCredit' | 'createdAt'>) => void
  upsertCompany: (profile: Omit<CompanyProfile, 'teamMembers' | 'usedCredit' | 'createdAt'>, opts?: { localOnly?: boolean }) => void
  deleteCompany: (companyId: string) => void
  getCompany: (companyId: string) => CompanyProfile | undefined
  getCompanyByCardNumber: (cardNumber: string) => CompanyProfile | undefined
  updateCompany: (companyId: string, updates: Partial<CompanyProfile>, opts?: { localOnly?: boolean }) => void
  setCurrentCompany: (companyId: string) => void
  getCurrentCompany: () => CompanyProfile | undefined

  // Team management
  addTeamMember: (companyId: string, member: TeamMember, opts?: { localOnly?: boolean }) => void
  removeTeamMember: (companyId: string, userId: string) => void
  updateTeamMemberRole: (companyId: string, userId: string, role: TeamMemberRole) => void
  getTeamMember: (companyId: string, userId: string) => TeamMember | undefined
  getTeamMembers: (companyId: string) => TeamMember[]

  // Credit management
  increaseUsedCredit: (companyId: string, amount: number) => void
  decreaseUsedCredit: (companyId: string, amount: number) => void
  getAvailableCredit: (companyId: string) => number

  // DB sync
  syncFromDb: () => Promise<void>
}

function apiPost(url: string, body: unknown) {
  if (typeof window === 'undefined') return
  fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => {})
}
function apiPatch(url: string, body: unknown) {
  if (typeof window === 'undefined') return
  fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => {})
}
function apiDelete(url: string) {
  if (typeof window === 'undefined') return
  fetch(url, { method: 'DELETE' }).catch(() => {})
}

const toHydratedTeamMember = (member: TeamMember): TeamMember => ({
  ...member,
  addedAt: member.addedAt instanceof Date ? member.addedAt : new Date(member.addedAt)
})

const toHydratedCompany = (company: CompanyProfile): CompanyProfile => ({
  ...company,
  cardNumber: company.cardNumber,
  createdAt: company.createdAt instanceof Date ? company.createdAt : new Date(company.createdAt),
  teamMembers: (company.teamMembers ?? []).map(toHydratedTeamMember)
})

export const useCompanyStore = create<CompanyStore>()(
    (set, get) => ({
      companies: new Map<string, CompanyProfile>(),

      getCompanies: () => {
        return Array.from(get().companies.values()).sort((a, b) => a.companyName.localeCompare(b.companyName))
      },
      
      createCompany: (profile) => {
        set(state => {
          const newCompany: CompanyProfile = {
            ...profile,
            teamMembers: [],
            usedCredit: 0,
            createdAt: new Date(),
          }
          const newCompanies = new Map(state.companies)
          newCompanies.set(profile.companyId, newCompany)
          return { companies: newCompanies }
        })
        apiPost('/api/companies', profile)
      },

      upsertCompany: (profile, opts) => {
        set(state => {
          const existing = state.companies.get(profile.companyId)
          const nextCompany: CompanyProfile = {
            ...existing,
            ...profile,
            teamMembers: existing?.teamMembers ?? [],
            usedCredit: existing?.usedCredit ?? 0,
            createdAt: existing?.createdAt ?? new Date()
          }
          const newCompanies = new Map(state.companies)
          newCompanies.set(profile.companyId, nextCompany)
          return { companies: newCompanies }
        })
        if (opts?.localOnly) return
        // Try PATCH first, fall back to POST on 404
        if (typeof window !== 'undefined') {
          fetch(`/api/companies/${profile.companyId}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(profile)
          }).then(async (r) => {
            if (r.status === 404) apiPost('/api/companies', profile)
          }).catch(() => {})
        }
      },

      deleteCompany: (companyId) => {
        set(state => {
          if (!state.companies.has(companyId)) return state
          const newCompanies = new Map(state.companies)
          newCompanies.delete(companyId)
          return {
            companies: newCompanies,
            currentCompanyId: state.currentCompanyId === companyId ? undefined : state.currentCompanyId
          }
        })
        apiDelete(`/api/companies/${companyId}`)
      },
      
      getCompany: (companyId) => {
        return get().companies.get(companyId)
      },

      getCompanyByCardNumber: (cardNumber) => {
        const normalizedCardNumber = normalizeCardNumber(cardNumber)
        if (!normalizedCardNumber) return undefined
        return Array.from(get().companies.values()).find(
          (company) => normalizeCardNumber(company.cardNumber ?? '') === normalizedCardNumber
        )
      },
      
      updateCompany: (companyId, updates, opts) => {
        set(state => {
          const company = state.companies.get(companyId)
          if (!company) return state
          const newCompanies = new Map(state.companies)
          newCompanies.set(companyId, { ...company, ...updates })
          return { companies: newCompanies }
        })
        if (opts?.localOnly) return
        apiPatch(`/api/companies/${companyId}`, updates)
      },
      
      setCurrentCompany: (companyId) => {
        set(() => ({ currentCompanyId: companyId }))
      },
      
      getCurrentCompany: () => {
        const state = get()
        if (!state.currentCompanyId) return undefined
        return state.companies.get(state.currentCompanyId)
      },
      
      addTeamMember: (companyId, member, opts) => {
        set(state => {
          const company = state.companies.get(companyId)
          if (!company) return state
          const exists = company.teamMembers.some(m => m.userId === member.userId)
          if (exists) return state
          const newCompanies = new Map(state.companies)
          newCompanies.set(companyId, { ...company, teamMembers: [...company.teamMembers, member] })
          return { companies: newCompanies }
        })
        if (opts?.localOnly) return
        apiPost(`/api/companies/${companyId}/members`, member)
      },

      removeTeamMember: (companyId, userId) => {
        set(state => {
          const company = state.companies.get(companyId)
          if (!company) return state
          const newCompanies = new Map(state.companies)
          newCompanies.set(companyId, {
            ...company,
            teamMembers: company.teamMembers.filter(m => m.userId !== userId)
          })
          return { companies: newCompanies }
        })
        apiDelete(`/api/companies/${companyId}/members/${userId}`)
      },

      updateTeamMemberRole: (companyId, userId, role) => {
        set(state => {
          const company = state.companies.get(companyId)
          if (!company) return state
          const newCompanies = new Map(state.companies)
          newCompanies.set(companyId, {
            ...company,
            teamMembers: company.teamMembers.map(m => m.userId === userId ? { ...m, role } : m)
          })
          return { companies: newCompanies }
        })
        apiPatch(`/api/companies/${companyId}/members/${userId}`, { role })
      },
      
      getTeamMember: (companyId, userId) => {
        const company = get().companies.get(companyId)
        if (!company) return undefined
        return company.teamMembers.find(m => m.userId === userId)
      },
      
      getTeamMembers: (companyId) => {
        const company = get().companies.get(companyId)
        return company?.teamMembers || []
      },
      
      increaseUsedCredit: (companyId, amount) => {
        set(state => {
          const company = state.companies.get(companyId)
          if (!company) return state
          const newUsedCredit = company.usedCredit + amount
          const newCompanies = new Map(state.companies)
          newCompanies.set(companyId, { ...company, usedCredit: newUsedCredit })
          return { companies: newCompanies }
        })
        const updated = get().companies.get(companyId)
        if (updated) apiPatch(`/api/companies/${companyId}`, { usedCredit: updated.usedCredit })
      },

      decreaseUsedCredit: (companyId, amount) => {
        set(state => {
          const company = state.companies.get(companyId)
          if (!company) return state
          const newUsedCredit = Math.max(0, company.usedCredit - amount)
          const newCompanies = new Map(state.companies)
          newCompanies.set(companyId, { ...company, usedCredit: newUsedCredit })
          return { companies: newCompanies }
        })
        const updated = get().companies.get(companyId)
        if (updated) apiPatch(`/api/companies/${companyId}`, { usedCredit: updated.usedCredit })
      },

      getAvailableCredit: (companyId) => {
        const company = get().companies.get(companyId)
        if (!company || !company.creditLimit) return 0
        return Math.max(0, company.creditLimit - company.usedCredit)
      },

      syncFromDb: async () => {
        try {
          const res = await fetch('/api/companies')
          if (!res.ok) return
          const { companies: dbCompanies } = await res.json()
          if (!Array.isArray(dbCompanies)) return
          set(() => {
            const newMap = new Map<string, CompanyProfile>()
            for (const c of dbCompanies) {
              newMap.set(c.companyId, toHydratedCompany({
                ...c,
                createdAt: new Date(c.createdAt),
                teamMembers: (c.teamMembers ?? []).map(toHydratedTeamMember),
              }))
            }
            return { companies: newMap }
          })
        } catch { /* ignore */ }
      },
    })
)
