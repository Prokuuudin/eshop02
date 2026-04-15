import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type AuditAction =
  | 'order_created'
  | 'order_approved'
  | 'order_cancelled'
  | 'order_shipped'
  | 'payment_recorded'
  | 'invoice_issued'
  | 'user_invited'
  | 'user_removed'
  | 'user_role_changed'
  | 'company_profile_updated'
  | 'team_member_login'
  | 'team_member_logout'
  | 'api_key_generated'
  | string

export interface AuditEntry {
  id: string
  companyId: string
  userId: string
  userName?: string
  userEmail?: string
  action: AuditAction
  details: Record<string, any> // Flexible for different action types
  timestamp: Date
  ipAddress?: string
}

type AuditLogStore = {
  entries: Map<string, AuditEntry>
  
  // Log management
  logAction: (entry: Omit<AuditEntry, 'id' | 'timestamp'>) => void
  getEntriesByCompany: (companyId: string, limit?: number) => AuditEntry[]
  getEntriesByUser: (companyId: string, userId: string, limit?: number) => AuditEntry[]
  getEntriesByAction: (companyId: string, action: AuditAction, limit?: number) => AuditEntry[]
  getEntriesByDateRange: (companyId: string, startDate: Date, endDate: Date) => AuditEntry[]
  clearOldEntries: (olderThanDays: number) => void // GDPR compliance
}

export const useAuditLogStore = create<AuditLogStore>()(
  persist(
    (set, get) => ({
      entries: new Map(),
      
      logAction: (entry) => {
        set(state => {
          const entryId = `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
          const newEntry: AuditEntry = {
            ...entry,
            id: entryId,
            timestamp: new Date()
          }
          
          const newEntries = new Map(state.entries)
          newEntries.set(entryId, newEntry)
          return { entries: newEntries }
        })
      },
      
      getEntriesByCompany: (companyId, limit = 100) => {
        const entries = Array.from(get().entries.values())
        return entries
          .filter(e => e.companyId === companyId)
          .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
          .slice(0, limit)
      },
      
      getEntriesByUser: (companyId, userId, limit = 50) => {
        const entries = Array.from(get().entries.values())
        return entries
          .filter(e => e.companyId === companyId && e.userId === userId)
          .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
          .slice(0, limit)
      },
      
      getEntriesByAction: (companyId, action, limit = 50) => {
        const entries = Array.from(get().entries.values())
        return entries
          .filter(e => e.companyId === companyId && e.action === action)
          .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
          .slice(0, limit)
      },
      
      getEntriesByDateRange: (companyId, startDate, endDate) => {
        const entries = Array.from(get().entries.values())
        return entries
          .filter(e =>
            e.companyId === companyId &&
            e.timestamp >= startDate &&
            e.timestamp <= endDate
          )
          .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      },
      
      clearOldEntries: (olderThanDays) => {
        set(state => {
          const cutoffDate = new Date()
          cutoffDate.setDate(cutoffDate.getDate() - olderThanDays)
          
          const newEntries = new Map(state.entries)
          Array.from(newEntries.entries()).forEach(([id, entry]) => {
            if (entry.timestamp < cutoffDate) {
              newEntries.delete(id)
            }
          })
          
          return { entries: newEntries }
        })
      }
    }),
    {
      name: 'audit-log-store',
      partialize: (state) => ({
        entries: Array.from(state.entries.entries())
      }),
      merge: (persistedState: any, currentState) => ({
        ...currentState,
        entries: new Map(persistedState.entries || [])
      })
    }
  )
)

// Helper function to log actions from anywhere
export const logAuditAction = (
  companyId: string,
  userId: string,
  action: AuditAction,
  details: Record<string, any>,
  options?: { userName?: string; userEmail?: string; ipAddress?: string }
) => {
  const store = useAuditLogStore.getState()
  store.logAction({
    companyId,
    userId,
    action,
    details,
    userName: options?.userName,
    userEmail: options?.userEmail,
    ipAddress: options?.ipAddress
  })
}
