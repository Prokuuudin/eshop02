import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { TeamRole } from '@/lib/auth'

export type AccessRequestStatus = 'pending' | 'approved' | 'rejected'

export type AccessRequest = {
  id: string
  email: string
  password: string
  name?: string
  companyId: string
  companyName: string
  barcode: string
  status: AccessRequestStatus
  requestedAt: Date
  reviewedAt?: Date
  reviewedByUserId?: string
  reviewedByEmail?: string
  approvedTeamRole?: TeamRole
  reviewNote?: string
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
                  approvedTeamRole: review?.approvedTeamRole
                }
              : request
          )
        }))
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
                  reviewNote: review?.reviewNote
                }
              : request
          )
        }))
      },

      getRequest: (requestId) => {
        return get().requests.find((request) => request.id === requestId)
      },

      getPendingRequests: () => {
        return get().requests
          .filter((request) => request.status === 'pending')
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