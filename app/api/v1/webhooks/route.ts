import { NextRequest } from 'next/server'
import { authenticateRequest, errorResponse, successResponse } from '@/lib/api-helpers'
import {
  createWebhookEndpoint,
  deleteWebhookEndpoint,
  listWebhookDeliveryLogs,
  listWebhookEndpoints,
  maskWebhookSecret,
  type WebhookEvent
} from '@/lib/webhooks-store'
import { triggerCompanyWebhook } from '@/lib/webhook-sender'
import { guardOrigin } from '@/lib/api-guard'

const ALLOWED_EVENTS: WebhookEvent[] = ['order.created', 'order.shipped', 'order.cancelled', 'payment.recorded', 'invoice.issued']

export async function GET(req: NextRequest): Promise<Response> {
  const auth = await authenticateRequest(req)
  if (!auth.authenticated) {
    return errorResponse(auth.error || 'Unauthorized', auth.status || 401)
  }

  if (!auth.user.companyId) {
    return errorResponse('Company context required (x-company-id)', 400)
  }

  const rawEndpoints = await listWebhookEndpoints(auth.user.companyId)
  const endpoints = rawEndpoints.map((endpoint) => ({
    ...endpoint,
    secret: maskWebhookSecret(endpoint.secret)
  }))
  const deliveries = await listWebhookDeliveryLogs(auth.user.companyId, 50)

  return successResponse({ endpoints, deliveries })
}

export async function POST(req: NextRequest): Promise<Response> {
  const blocked = guardOrigin(req, { allowApiKey: true })
  if (blocked) return blocked

  const auth = await authenticateRequest(req)
  if (!auth.authenticated) {
    return errorResponse(auth.error || 'Unauthorized', auth.status || 401)
  }

  if (!auth.user.companyId) {
    return errorResponse('Company context required (x-company-id)', 400)
  }

  const body = await req.json()
  const { url, events, testNow } = body as {
    url?: string
    events?: WebhookEvent[]
    testNow?: boolean
  }

  if (!url || !/^https:\/\//.test(url)) {
    return errorResponse('Valid https webhook URL is required', 400)
  }

  if (!events || !Array.isArray(events) || events.length === 0) {
    return errorResponse('At least one webhook event is required', 400)
  }

  if (events.some((event) => !ALLOWED_EVENTS.includes(event))) {
    return errorResponse('Unsupported webhook event detected', 400)
  }

  const endpoint = await createWebhookEndpoint({
    companyId: auth.user.companyId,
    url,
    events
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

export async function DELETE(req: NextRequest): Promise<Response> {
  const blocked = guardOrigin(req, { allowApiKey: true })
  if (blocked) return blocked

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

  const removed = await deleteWebhookEndpoint(auth.user.companyId, endpointId)
  if (!removed) {
    return errorResponse('Webhook endpoint not found', 404)
  }

  return successResponse({ removed: true })
}
