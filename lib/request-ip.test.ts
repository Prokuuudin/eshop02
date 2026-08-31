import { describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { getClientIp } from './request-ip'

const request = (headers: Record<string, string>) =>
  new NextRequest('https://shop.test/api/test', { headers })

describe('getClientIp', () => {
  it('prefers the CDN address over forwarding headers', () => {
    expect(getClientIp(request({
      'cf-connecting-ip': ' 203.0.113.1 ',
      'x-forwarded-for': '198.51.100.1, 198.51.100.2',
    }))).toBe('203.0.113.1')
  })

  it('uses only the first forwarded address', () => {
    expect(getClientIp(request({ 'x-forwarded-for': '198.51.100.1, 198.51.100.2' })))
      .toBe('198.51.100.1')
  })

  it('falls back to x-real-ip and then unknown', () => {
    expect(getClientIp(request({ 'x-real-ip': '192.0.2.1' }))).toBe('192.0.2.1')
    expect(getClientIp(request({}))).toBe('unknown')
  })
})
