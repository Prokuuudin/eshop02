import crypto from 'crypto'
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@/generated/prisma/client'

export type WebhookEvent =
  | 'order.created'
  | 'order.shipped'
  | 'order.cancelled'
  | 'payment.recorded'
  | 'invoice.issued'

export type DeliveryStatus = 'success' | 'failed'

export type WebhookEndpoint = {
  id: string
  companyId: string
  url: string
  events: WebhookEvent[]
  isActive: boolean
  secret: string
  createdAt: string
}

export type WebhookDeliveryAttempt = {
  endpointId: string
  attempt: number
  status: DeliveryStatus
  statusCode?: number
  error?: string
  durationMs: number
}

export type WebhookDeliveryLog = {
  id: string
  companyId: string
  event: WebhookEvent
  payload: Record<string, unknown>
  createdAt: string
  attempts: WebhookDeliveryAttempt[]
}

const MAX_DELIVERY_LOGS_PER_COMPANY = 500

type DbWebhookEndpoint = {
  id: string
  companyId: string
  url: string
  events: unknown
  isActive: boolean
  secret: string
  createdAt: Date
}

type DbWebhookDeliveryLog = {
  id: string
  companyId: string
  event: string
  payload: unknown
  attempts: unknown
  createdAt: Date
}

function mapEndpoint(row: DbWebhookEndpoint): WebhookEndpoint {
  return {
    id: row.id,
    companyId: row.companyId,
    url: row.url,
    events: Array.isArray(row.events) ? (row.events as WebhookEvent[]) : [],
    isActive: row.isActive,
    secret: row.secret,
    createdAt: row.createdAt.toISOString(),
  }
}

function mapDeliveryLog(row: DbWebhookDeliveryLog): WebhookDeliveryLog {
  return {
    id: row.id,
    companyId: row.companyId,
    event: row.event as WebhookEvent,
    payload: (row.payload as Record<string, unknown>) ?? {},
    attempts: Array.isArray(row.attempts) ? (row.attempts as WebhookDeliveryAttempt[]) : [],
    createdAt: row.createdAt.toISOString(),
  }
}

export const listWebhookEndpoints = async (companyId: string): Promise<WebhookEndpoint[]> => {
  const rows = await prisma.webhookEndpoint.findMany({
    where: { companyId },
    orderBy: { createdAt: 'desc' },
  })
  return rows.map(mapEndpoint)
}

export const getWebhookEndpoint = async (id: string): Promise<WebhookEndpoint | undefined> => {
  const row = await prisma.webhookEndpoint.findUnique({ where: { id } })
  return row ? mapEndpoint(row) : undefined
}

export const createWebhookEndpoint = async (input: {
  companyId: string
  url: string
  events: WebhookEvent[]
}): Promise<WebhookEndpoint> => {
  const row = await prisma.webhookEndpoint.create({
    data: {
      id: `wh_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      companyId: input.companyId,
      url: input.url,
      events: input.events,
      isActive: true,
      secret: crypto.randomBytes(32).toString('hex'),
    },
  })
  return mapEndpoint(row)
}

export const maskWebhookSecret = (secret: string): string =>
  '•'.repeat(Math.max(secret.length - 4, 0)) + secret.slice(-4)

export const deleteWebhookEndpoint = async (companyId: string, endpointId: string): Promise<boolean> => {
  const { count } = await prisma.webhookEndpoint.deleteMany({
    where: { id: endpointId, companyId },
  })
  return count > 0
}

export const getActiveEndpointsForEvent = async (
  companyId: string,
  event: WebhookEvent
): Promise<WebhookEndpoint[]> => {
  const endpoints = await listWebhookEndpoints(companyId)
  return endpoints.filter((endpoint) => endpoint.isActive && endpoint.events.includes(event))
}

export const saveWebhookDeliveryLog = async (
  log: Omit<WebhookDeliveryLog, 'id' | 'createdAt'>
): Promise<WebhookDeliveryLog> => {
  const row = await prisma.webhookDeliveryLog.create({
    data: {
      id: `whd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      companyId: log.companyId,
      event: log.event,
      payload: log.payload as Prisma.InputJsonValue,
      attempts: log.attempts as unknown as Prisma.InputJsonValue,
    },
  })

  // Keep only the most recent MAX_DELIVERY_LOGS_PER_COMPANY rows per company.
  const excess = await prisma.webhookDeliveryLog.findMany({
    where: { companyId: log.companyId },
    orderBy: { createdAt: 'desc' },
    skip: MAX_DELIVERY_LOGS_PER_COMPANY,
    select: { id: true },
  })
  if (excess.length > 0) {
    await prisma.webhookDeliveryLog.deleteMany({
      where: { id: { in: excess.map((item) => item.id) } },
    })
  }

  return mapDeliveryLog(row)
}

export const listWebhookDeliveryLogs = async (
  companyId: string,
  limit = 100
): Promise<WebhookDeliveryLog[]> => {
  const rows = await prisma.webhookDeliveryLog.findMany({
    where: { companyId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  })
  return rows.map(mapDeliveryLog)
}
