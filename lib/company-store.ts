import { create } from 'zustand'
import { persist } from 'zustand/middleware'

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
  upsertCompany: (profile: Omit<CompanyProfile, 'teamMembers' | 'usedCredit' | 'createdAt'>) => void
  deleteCompany: (companyId: string) => void
  getCompany: (companyId: string) => CompanyProfile | undefined
  getCompanyByCardNumber: (cardNumber: string) => CompanyProfile | undefined
  updateCompany: (companyId: string, updates: Partial<CompanyProfile>) => void
  setCurrentCompany: (companyId: string) => void
  getCurrentCompany: () => CompanyProfile | undefined
  
  // Team management
  addTeamMember: (companyId: string, member: TeamMember) => void
  removeTeamMember: (companyId: string, userId: string) => void
  updateTeamMemberRole: (companyId: string, userId: string, role: TeamMemberRole) => void
  getTeamMember: (companyId: string, userId: string) => TeamMember | undefined
  getTeamMembers: (companyId: string) => TeamMember[]
  
  // Credit management
  increaseUsedCredit: (companyId: string, amount: number) => void
  decreaseUsedCredit: (companyId: string, amount: number) => void
  getAvailableCredit: (companyId: string) => number
}

const normalizeCardNumber = (cardNumber: string | undefined): string => (cardNumber ?? '').replace(/\s+/g, '').toUpperCase()

const DEFAULT_COMPANIES: CompanyProfile[] = [
  {
    companyId: 'company_miks_plus',
    companyName: 'SIA MIKS PLUS',
    cardNumber: '1234567890123456',
    taxId: 'LV40003123456',
    registrationNumber: '40103123456',
    city: 'Riga',
    country: 'Latvia',
    paymentTermDays: 30,
    usedCredit: 0,
    approvalWorkflowEnabled: false,
    teamMembers: [],
    createdAt: new Date('2025-01-15T09:00:00.000Z')
  },
  {
    companyId: 'company_beauty_supply',
    companyName: 'Beauty Supply Pro',
    cardNumber: '2345678901234567',
    taxId: 'LV50004567891',
    registrationNumber: '50004567891',
    city: 'Daugavpils',
    country: 'Latvia',
    paymentTermDays: 60,
    usedCredit: 0,
    approvalWorkflowEnabled: true,
    teamMembers: [],
    createdAt: new Date('2025-02-03T10:30:00.000Z')
  },
  {
    companyId: 'company_salon_group',
    companyName: 'Baltic Salon Group',
    cardNumber: '3456789012345678',
    taxId: 'LV40107890123',
    registrationNumber: '40107890123',
    city: 'Jurmala',
    country: 'Latvia',
    paymentTermDays: 0,
    usedCredit: 0,
    approvalWorkflowEnabled: false,
    teamMembers: [],
    createdAt: new Date('2025-03-12T08:15:00.000Z')
  }
]

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

const createDefaultCompaniesMap = (): Map<string, CompanyProfile> => {
  return new Map(DEFAULT_COMPANIES.map((company) => [company.companyId, toHydratedCompany(company)]))
}

const mergeCompanies = (persistedCompanies: Array<[string, CompanyProfile]> | undefined): Map<string, CompanyProfile> => {
  const companies = createDefaultCompaniesMap()

  for (const entry of persistedCompanies ?? []) {
    const [companyId, company] = entry
    companies.set(companyId, toHydratedCompany(company))
  }

  return companies
}

export const useCompanyStore = create<CompanyStore>()(
  persist(
    (set, get) => ({
      companies: createDefaultCompaniesMap(),

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
      },

      upsertCompany: (profile) => {
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
      },
      
      getCompany: (companyId) => {
        return get().companies.get(companyId)
      },

      getCompanyByCardNumber: (cardNumber) => {
        const normalizedCardNumber = normalizeCardNumber(cardNumber)
        if (!normalizedCardNumber) return undefined
        return Array.from(get().companies.values()).find(
          (company) => normalizeCardNumber(company.cardNumber) === normalizedCardNumber
        )
      },
      
      updateCompany: (companyId, updates) => {
        set(state => {
          const company = state.companies.get(companyId)
          if (!company) return state
          
          const newCompanies = new Map(state.companies)
          newCompanies.set(companyId, { ...company, ...updates })
          return { companies: newCompanies }
        })
      },
      
      setCurrentCompany: (companyId) => {
        set(() => ({ currentCompanyId: companyId }))
      },
      
      getCurrentCompany: () => {
        const state = get()
        if (!state.currentCompanyId) return undefined
        return state.companies.get(state.currentCompanyId)
      },
      
      addTeamMember: (companyId, member) => {
        set(state => {
          const company = state.companies.get(companyId)
          if (!company) return state
          
          // Check if user already exists
          const exists = company.teamMembers.some(m => m.userId === member.userId)
          if (exists) return state
          
          const newCompanies = new Map(state.companies)
          newCompanies.set(companyId, {
            ...company,
            teamMembers: [...company.teamMembers, member]
          })
          return { companies: newCompanies }
        })
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
      },
      
      updateTeamMemberRole: (companyId, userId, role) => {
        set(state => {
          const company = state.companies.get(companyId)
          if (!company) return state
          
          const newCompanies = new Map(state.companies)
          newCompanies.set(companyId, {
            ...company,
            teamMembers: company.teamMembers.map(m =>
              m.userId === userId ? { ...m, role } : m
            )
          })
          return { companies: newCompanies }
        })
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
          
          const newCompanies = new Map(state.companies)
          newCompanies.set(companyId, {
            ...company,
            usedCredit: company.usedCredit + amount
          })
          return { companies: newCompanies }
        })
      },
      
      decreaseUsedCredit: (companyId, amount) => {
        set(state => {
          const company = state.companies.get(companyId)
          if (!company) return state
          
          const newCompanies = new Map(state.companies)
          newCompanies.set(companyId, {
            ...company,
            usedCredit: Math.max(0, company.usedCredit - amount)
          })
          return { companies: newCompanies }
        })
      },
      
      getAvailableCredit: (companyId) => {
        const company = get().companies.get(companyId)
        if (!company || !company.creditLimit) return 0
        return Math.max(0, company.creditLimit - company.usedCredit)
      }
    }),
    {
      name: 'company-store',
      partialize: (state) => ({
        companies: Array.from(state.companies.entries()),
        currentCompanyId: state.currentCompanyId
      }),
      merge: (persistedState: any, currentState) => ({
        ...currentState,
        companies: mergeCompanies(persistedState?.companies),
        currentCompanyId: persistedState.currentCompanyId
      })
    }
  )
)
