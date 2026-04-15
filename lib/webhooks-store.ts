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

const webhookEndpoints = new Map<string, WebhookEndpoint>()
const webhookDeliveryLogs: WebhookDeliveryLog[] = []

export const listWebhookEndpoints = (companyId: string): WebhookEndpoint[] => {
  return Array.from(webhookEndpoints.values())
    .filter((item) => item.companyId === companyId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export const getWebhookEndpoint = (id: string): WebhookEndpoint | undefined => {
  return webhookEndpoints.get(id)
}

export const createWebhookEndpoint = (input: {
  companyId: string
  url: string
  events: WebhookEvent[]
  secret?: string
}): WebhookEndpoint => {
  const endpoint: WebhookEndpoint = {
    id: `wh_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    companyId: input.companyId,
    url: input.url,
    events: input.events,
    isActive: true,
    secret: input.secret || `sec_${Math.random().toString(36).slice(2, 18)}`,
    createdAt: new Date().toISOString()
  }

  webhookEndpoints.set(endpoint.id, endpoint)
  return endpoint
}

export const deleteWebhookEndpoint = (companyId: string, endpointId: string): boolean => {
  const endpoint = webhookEndpoints.get(endpointId)
  if (!endpoint || endpoint.companyId !== companyId) {
    return false
  }

  return webhookEndpoints.delete(endpointId)
}

export const getActiveEndpointsForEvent = (companyId: string, event: WebhookEvent): WebhookEndpoint[] => {
  return listWebhookEndpoints(companyId).filter((endpoint) => endpoint.isActive && endpoint.events.includes(event))
}

export const saveWebhookDeliveryLog = (log: Omit<WebhookDeliveryLog, 'id' | 'createdAt'>): WebhookDeliveryLog => {
  const nextLog: WebhookDeliveryLog = {
    id: `whd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    ...log
  }

  webhookDeliveryLogs.unshift(nextLog)
  if (webhookDeliveryLogs.length > 500) {
    webhookDeliveryLogs.splice(500)
  }

  return nextLog
}

export const listWebhookDeliveryLogs = (companyId: string, limit = 100): WebhookDeliveryLog[] => {
  return webhookDeliveryLogs.filter((item) => item.companyId === companyId).slice(0, limit)
}
