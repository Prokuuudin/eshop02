import crypto from 'crypto'
import {
  getActiveEndpointsForEvent,
  saveWebhookDeliveryLog,
  type WebhookDeliveryAttempt,
  type WebhookEvent,
  type WebhookEndpoint
} from '@/lib/webhooks-store'

const MAX_RETRIES = 3

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

const signPayload = (secret: string, payload: string): string => {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex')
}

const sendToEndpoint = async (
  event: WebhookEvent,
  payload: Record<string, unknown>,
  endpoint: WebhookEndpoint
): Promise<WebhookDeliveryAttempt[]> => {
  const attempts: WebhookDeliveryAttempt[] = []
  const payloadText = JSON.stringify(payload)
  const signature = signPayload(endpoint.secret, payloadText)

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    const startedAt = Date.now()
    try {
      const response = await fetch(endpoint.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-webhook-event': event,
          'x-webhook-signature': signature,
          'x-webhook-delivery-attempt': String(attempt)
        },
        body: payloadText
      })

      const durationMs = Date.now() - startedAt

      if (response.ok) {
        attempts.push({
          endpointId: endpoint.id,
          attempt,
          status: 'success',
          statusCode: response.status,
          durationMs
        })
        break
      }

      attempts.push({
        endpointId: endpoint.id,
        attempt,
        status: 'failed',
        statusCode: response.status,
        error: `HTTP ${response.status}`,
        durationMs
      })
    } catch (error) {
      const durationMs = Date.now() - startedAt
      attempts.push({
        endpointId: endpoint.id,
        attempt,
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        durationMs
      })
    }

    if (attempt < MAX_RETRIES) {
      await wait(attempt * 300)
    }
  }

  return attempts
}

export const sendWebhook = async (
  event: WebhookEvent,
  payload: Record<string, unknown>,
  endpoints: WebhookEndpoint[]
): Promise<{ sent: number; success: number; failed: number }> => {
  let success = 0
  let failed = 0

  for (const endpoint of endpoints) {
    const attempts = await sendToEndpoint(event, payload, endpoint)
    const isSuccess = attempts.some((item) => item.status === 'success')

    if (isSuccess) {
      success += 1
    } else {
      failed += 1
    }

    saveWebhookDeliveryLog({
      companyId: endpoint.companyId,
      event,
      payload,
      attempts
    })
  }

  return {
    sent: endpoints.length,
    success,
    failed
  }
}

export const triggerCompanyWebhook = async (
  companyId: string,
  event: WebhookEvent,
  payload: Record<string, unknown>
): Promise<{ sent: number; success: number; failed: number }> => {
  const endpoints = getActiveEndpointsForEvent(companyId, event)
  if (endpoints.length === 0) {
    return { sent: 0, success: 0, failed: 0 }
  }

  return sendWebhook(event, payload, endpoints)
}
