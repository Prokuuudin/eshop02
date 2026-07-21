import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { TeamRole } from '@/lib/auth'

export type AccessRequestStatus = 'pending' | 'approved' | 'rejected'

export type AccessRequest = {
  id: string
  email: string
  password: string
  name?: string
  phone?: string
  companyId: string
  companyName: string
  cardNumber: string
  status: AccessRequestStatus
  requestedAt: Date
  reviewedAt?: Date
  reviewedByUserId?: string
  reviewedByEmail?: string
  approvedTeamRole?: TeamRole
  reviewNote?: string
  // No-card request fields
  requestType?: 'card' | 'no-card'
  certificateData?: string
  certificateName?: string
  message?: string
  language?: 'ru' | 'en' | 'lv'
  turnstileToken?: string
}

type AccessRequestReview = {
  reviewedByUserId?: string
  reviewedByEmail?: string
  reviewNote?: string
  approvedTeamRole?: TeamRole
}

type AccessRequestStore = {
  requests: AccessRequest[]
  createRequest: (request: Omit<AccessRequest, 'id' | 'status' | 'requestedAt'>) => AccessRequest
  approveRequest: (requestId: string, review?: AccessRequestReview) => void
  rejectRequest: (requestId: string, review?: AccessRequestReview) => void
  getRequest: (requestId: string) => AccessRequest | undefined
  getPendingRequests: () => AccessRequest[]
  getNoCardPendingRequests: () => AccessRequest[]
  getRequestsByCompany: (companyId: string) => AccessRequest[]
  getPendingRequestByEmail: (email: string) => AccessRequest | undefined
}

const hydrateRequest = (request: AccessRequest): AccessRequest => ({
  ...request,
  requestedAt: request.requestedAt instanceof Date ? request.requestedAt : new Date(request.requestedAt),
  reviewedAt: request.reviewedAt
    ? request.reviewedAt instanceof Date
      ? request.reviewedAt
      : new Date(request.reviewedAt)
    : undefined
})

export const useAccessRequestStore = create<AccessRequestStore>()(
  persist(
    (set, get) => ({
      requests: [],

      createRequest: (request) => {
        const createdRequest: AccessRequest = {
          ...request,
          id: `access_req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          status: 'pending',
          requestedAt: new Date()
        }

        set((state) => ({
          requests: [createdRequest, ...state.requests]
        }))

        // Sync to DB — password is hashed server-side; certificateData сжат
        // на клиенте и хранится в KV на время рассмотрения заявки
        if (typeof window !== 'undefined') {
          fetch('/api/access-requests', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: request.email,
              password: request.password,
              name: request.name,
              phone: request.phone,
              companyId: request.companyId,
              companyName: request.companyName,
              cardNumber: request.cardNumber,
              requestType: request.requestType,
              certificateName: request.certificateName,
              certificateData: request.certificateData,
              message: request.message,
              language: request.language,
              turnstileToken: request.turnstileToken,
            }),
          }).catch(() => {})
        }

        return createdRequest
      },

      approveRequest: (requestId, review) => {
        set((state) => ({
          requests: state.requests.map((request) =>
            request.id === requestId
              ? {
                  ...request,
                  status: 'approved',
                  reviewedAt: new Date(),
                  reviewedByUserId: review?.reviewedByUserId,
                  reviewedByEmail: review?.reviewedByEmail,
                  reviewNote: review?.reviewNote,
                  approvedTeamRole: review?.approvedTeamRole,
                  certificateData: undefined,
                }
              : request
          )
        }))
        if (typeof window !== 'undefined') {
          fetch(`/api/admin/access-requests/${encodeURIComponent(requestId)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'approved', reviewNote: review?.reviewNote, approvedTeamRole: review?.approvedTeamRole }),
          }).catch(() => {})
        }
      },

      rejectRequest: (requestId, review) => {
        set((state) => ({
          requests: state.requests.map((request) =>
            request.id === requestId
              ? {
                  ...request,
                  status: 'rejected',
                  reviewedAt: new Date(),
                  reviewedByUserId: review?.reviewedByUserId,
                  reviewedByEmail: review?.reviewedByEmail,
                  reviewNote: review?.reviewNote,
                  certificateData: undefined,
                }
              : request
          )
        }))
        if (typeof window !== 'undefined') {
          fetch(`/api/admin/access-requests/${encodeURIComponent(requestId)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'rejected', reviewNote: review?.reviewNote }),
          }).catch(() => {})
        }
      },

      getRequest: (requestId) => {
        return get().requests.find((request) => request.id === requestId)
      },

      getPendingRequests: () => {
        return get().requests
          .filter((request) => request.status === 'pending' && request.requestType !== 'no-card')
          .sort((a, b) => b.requestedAt.getTime() - a.requestedAt.getTime())
      },

      getNoCardPendingRequests: () => {
        return get().requests
          .filter((request) => request.status === 'pending' && request.requestType === 'no-card')
          .sort((a, b) => b.requestedAt.getTime() - a.requestedAt.getTime())
      },

      getRequestsByCompany: (companyId) => {
        return get().requests
          .filter((request) => request.companyId === companyId)
          .sort((a, b) => b.requestedAt.getTime() - a.requestedAt.getTime())
      },

      getPendingRequestByEmail: (email) => {
        const normalizedEmail = email.trim().toLowerCase()
        return get().requests.find(
          (request) => request.status === 'pending' && request.email.toLowerCase() === normalizedEmail
        )
      }
    }),
    {
      name: 'access-request-store',
      merge: (persistedState, currentState) => {
        const typedState = persistedState as Partial<AccessRequestStore> | undefined

        return {
          ...currentState,
          requests: (typedState?.requests ?? []).map(hydrateRequest)
        }
      }
    }
  )
)
