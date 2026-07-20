import crypto from 'crypto'
import dns from 'node:dns/promises'
import net from 'node:net'
import {
  getActiveEndpointsForEvent,
  saveWebhookDeliveryLog,
  type WebhookDeliveryAttempt,
  type WebhookEvent,
  type WebhookEndpoint
} from '@/lib/webhooks-store'

const MAX_RETRIES = 3
const FETCH_TIMEOUT_MS = 10_000

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

const signPayload = (secret: string, payload: string): string => {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex')
}

const ipv4ToLong = (ip: string): number =>
  ip.split('.').reduce((acc, octet) => (acc << 8) + Number(octet), 0) >>> 0

// Loopback / private / link-local / multicast / reserved ranges — includes 169.254.169.254 (cloud metadata).
const isPrivateIPv4 = (ip: string): boolean => {
  const long = ipv4ToLong(ip)
  const ranges: Array<[string, number]> = [
    ['0.0.0.0', 8],
    ['10.0.0.0', 8],
    ['100.64.0.0', 10],
    ['127.0.0.0', 8],
    ['169.254.0.0', 16],
    ['172.16.0.0', 12],
    ['192.0.0.0', 24],
    ['192.0.2.0', 24],
    ['192.88.99.0', 24],
    ['192.168.0.0', 16],
    ['198.18.0.0', 15],
    ['198.51.100.0', 24],
    ['203.0.113.0', 24],
    ['224.0.0.0', 4],
    ['240.0.0.0', 4]
  ]
  return ranges.some(([base, bits]) => {
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0
    return (long & mask) === (ipv4ToLong(base) & mask)
  })
}

// DNS-resolved IPv6 addresses come back canonicalized, so leading-hextet prefix checks are reliable
// (fe80::/10, fc00::/7, ff00::/8 all have a non-zero first hextet and are never compressed away).
const isPrivateIPv6 = (ipRaw: string): boolean => {
  const ip = ipRaw.toLowerCase().split('%')[0]
  if (ip === '::1' || ip === '::') return true
  if (ip.startsWith('fe8') || ip.startsWith('fe9') || ip.startsWith('fea') || ip.startsWith('feb')) return true // fe80::/10
  if (ip.startsWith('fc') || ip.startsWith('fd')) return true // fc00::/7 (ULA)
  if (ip.startsWith('ff')) return true // ff00::/8 (multicast)

  const mapped = ip.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/)
  if (mapped) return isPrivateIPv4(mapped[1])

  return false
}

const isBlockedIp = (ip: string): boolean => {
  if (net.isIPv4(ip)) return isPrivateIPv4(ip)
  if (net.isIPv6(ip)) return isPrivateIPv6(ip)
  return true // unrecognized address format — fail closed
}

/**
 * SSRF guard: only https, and every DNS-resolved address must be public.
 * Note: this is a pre-flight check, not IP-pinning — a DNS-rebinding attacker who changes
 * the record between this lookup and the fetch() below could still slip through.
 */
const ensureSafeWebhookUrl = async (rawUrl: string): Promise<void> => {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    throw new Error('Invalid webhook URL')
  }

  if (parsed.protocol !== 'https:') {
    throw new Error('Webhook URL must use https')
  }

  const addresses = await dns.lookup(parsed.hostname, { all: true, verbatim: true })
  if (addresses.length === 0) {
    throw new Error('Webhook host does not resolve')
  }
  const blocked = addresses.find(({ address }) => isBlockedIp(address))
  if (blocked) {
    throw new Error(`Webhook host resolves to a blocked address (${blocked.address})`)
  }
}

const sendToEndpoint = async (
  event: WebhookEvent,
  payload: Record<string, unknown>,
  endpoint: WebhookEndpoint
): Promise<WebhookDeliveryAttempt[]> => {
  const attempts: WebhookDeliveryAttempt[] = []
  const payloadText = JSON.stringify(payload)
  const signature = signPayload(endpoint.secret, payloadText)

  try {
    await ensureSafeWebhookUrl(endpoint.url)
  } catch (error) {
    attempts.push({
      endpointId: endpoint.id,
      attempt: 1,
      status: 'failed',
      error: error instanceof Error ? error.message : 'Blocked webhook URL',
      durationMs: 0
    })
    return attempts
  }

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
        body: payloadText,
        redirect: 'manual',
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
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

    await saveWebhookDeliveryLog({
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
  const endpoints = await getActiveEndpointsForEvent(companyId, event)
  if (endpoints.length === 0) {
    return { sent: 0, success: 0, failed: 0 }
  }

  return sendWebhook(event, payload, endpoints)
}
