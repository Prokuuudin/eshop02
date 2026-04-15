import { NextRequest } from 'next/server'
import { authenticateRequest, errorResponse, successResponse } from '@/lib/api-helpers'
import {
  createWebhookEndpoint,
  deleteWebhookEndpoint,
  listWebhookDeliveryLogs,
  listWebhookEndpoints,
  type WebhookEvent
} from '@/lib/webhooks-store'
import { triggerCompanyWebhook } from '@/lib/webhook-sender'

const ALLOWED_EVENTS: WebhookEvent[] = ['order.created', 'order.shipped', 'order.cancelled', 'payment.recorded', 'invoice.issued']

export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req)
  if (!auth.authenticated) {
    return errorResponse(auth.error || 'Unauthorized', auth.status || 401)
  }

  if (!auth.user.companyId) {
    return errorResponse('Company context required (x-company-id)', 400)
  }

  const endpoints = listWebhookEndpoints(auth.user.companyId)
  const deliveries = listWebhookDeliveryLogs(auth.user.companyId, 50)

  return successResponse({ endpoints, deliveries })
}

export async function POST(req: NextRequest) {
  const auth = await authenticateRequest(req)
  if (!auth.authenticated) {
    return errorResponse(auth.error || 'Unauthorized', auth.status || 401)
  }

  if (!auth.user.companyId) {
    return errorResponse('Company context required (x-company-id)', 400)
  }

  const body = await req.json()
  const { url, events, secret, testNow } = body as {
    url?: string
    events?: WebhookEvent[]
    secret?: string
    testNow?: boolean
  }

  if (!url || !/^https?:\/\//.test(url)) {
    return errorResponse('Valid webhook URL is required', 400)
  }

  if (!events || !Array.isArray(events) || events.length === 0) {
    return errorResponse('At least one webhook event is required', 400)
  }

  if (events.some((event) => !ALLOWED_EVENTS.includes(event))) {
    return errorResponse('Unsupported webhook event detected', 400)
  }

  const endpoint = createWebhookEndpoint({
    companyId: auth.user.companyId,
    url,
    events,
    secret
  })

  let testDelivery: { sent: number; success: number; failed: number } | undefined
  if (testNow) {
    testDelivery = await triggerCompanyWebhook(auth.user.companyId, 'order.created', {
      type: 'webhook.test',
      endpointId: endpoint.id,
      url: endpoint.url,
      createdAt: endpoint.createdAt
    })
  }

  return successResponse({ endpoint, testDelivery }, 201)
}

export async function DELETE(req: NextRequest) {
  const auth = await authenticateRequest(req)
  if (!auth.authenticated) {
    return errorResponse(auth.error || 'Unauthorized', auth.status || 401)
  }

  if (!auth.user.companyId) {
    return errorResponse('Company context required (x-company-id)', 400)
  }

  const { searchParams } = new URL(req.url)
  const endpointId = searchParams.get('id')

  if (!endpointId) {
    return errorResponse('Webhook endpoint id is required', 400)
  }

  const removed = deleteWebhookEndpoint(auth.user.companyId, endpointId)
  if (!removed) {
    return errorResponse('Webhook endpoint not found', 404)
  }

  return successResponse({ removed: true })
}
