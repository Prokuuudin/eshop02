import { describe, expect, it } from 'vitest'
import { redactTelemetryText } from './telemetry-redaction'

describe('telemetry redaction', () => {
  it('removes email addresses, payment secrets and sensitive query values', () => {
    const value = redactTelemetryText(
      'buyer@example.com sk_live_abc123 /order/1?session_id=cs_secret&code=reset-me',
      500,
    )
    expect(value).not.toContain('buyer@example.com')
    expect(value).not.toContain('sk_live_abc123')
    expect(value).not.toContain('cs_secret')
    expect(value).not.toContain('reset-me')
    expect(value).toContain('[redacted-email]')
  })

  it('removes credentials embedded in error messages and headers', () => {
    const value = redactTelemetryText(
      'password=secret authorization: Bearer abc.def cookie=session-value api_key=private',
      500,
    )
    expect(value).not.toContain('password=secret')
    expect(value).not.toContain('abc.def')
    expect(value).not.toContain('session-value')
    expect(value).not.toContain('api_key=private')
  })
})
