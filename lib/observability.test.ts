import { afterEach, describe, expect, it, vi } from 'vitest'
import { getCorrelationId, logOperationalEvent } from './observability'

afterEach(() => vi.restoreAllMocks())

describe('observability', () => {
  it('accepts a safe caller correlation id', () => {
    const request = new Request('https://example.test', { headers: { 'x-correlation-id': 'checkout-12345678' } })
    expect(getCorrelationId(request)).toBe('checkout-12345678')
  })

  it('replaces unsafe or too-short ids', () => {
    const request = new Request('https://example.test', { headers: { 'x-correlation-id': 'bad id' } })
    expect(getCorrelationId(request)).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('writes structured alert events without an error stack', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    logOperationalEvent({ event: 'test_failed', level: 'error', alert: true, correlationId: 'test-12345678' }, new Error('secret failure'))
    const payload = JSON.parse(String(spy.mock.calls[0][0]))
    expect(payload).toMatchObject({ event: 'test_failed', level: 'error', alert: true, correlationId: 'test-12345678', errorType: 'Error', errorMessage: 'secret failure' })
    expect(payload).not.toHaveProperty('stack')
  })
})
