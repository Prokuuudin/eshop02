import { createRequire } from 'node:module'
import { createServer, type IncomingHttpHeaders } from 'node:http'
import { connect, type AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const { applyTrustedClientIp } = createRequire(import.meta.url)('../server-client-ip.js') as {
  applyTrustedClientIp: (headers: IncomingHttpHeaders) => IncomingHttpHeaders
}

describe('applyTrustedClientIp', () => {
  it('uses the iisnode-promoted REMOTE_ADDR as the only x-forwarded-for', () => {
    const headers = applyTrustedClientIp({ 'x-iisnode-remote_addr': '203.0.113.7' })
    expect(headers['x-forwarded-for']).toBe('203.0.113.7')
  })

  it('accepts IPv6 addresses', () => {
    expect(applyTrustedClientIp({ 'x-iisnode-remote_addr': '2001:db8::1' })['x-forwarded-for']).toBe('2001:db8::1')
  })

  it('discards every client-supplied IP header even when REMOTE_ADDR is present', () => {
    const headers = applyTrustedClientIp({
      'x-iisnode-remote_addr': '203.0.113.7',
      'x-forwarded-for': '1.2.3.4, 5.6.7.8',
      'cf-connecting-ip': '9.9.9.9',
      'x-real-ip': '8.8.8.8',
    })
    expect(headers['x-forwarded-for']).toBe('203.0.113.7')
    expect(headers['cf-connecting-ip']).toBeUndefined()
    expect(headers['x-real-ip']).toBeUndefined()
  })

  it('leaves no IP header without a promoted REMOTE_ADDR (web.config not yet changed)', () => {
    const headers = applyTrustedClientIp({ 'x-forwarded-for': '1.2.3.4', 'cf-connecting-ip': '9.9.9.9', 'x-real-ip': '8.8.8.8' })
    expect(headers['x-forwarded-for']).toBeUndefined()
    expect(headers['cf-connecting-ip']).toBeUndefined()
    expect(headers['x-real-ip']).toBeUndefined()
  })

  it.each(['1.2.3.4, 203.0.113.7', 'not-an-ip', '', '203.0.113.7:443'])('trusts nothing for a promoted value of %j', (value) => {
    const headers = applyTrustedClientIp({ 'x-iisnode-remote_addr': value, 'x-forwarded-for': '1.2.3.4' })
    expect(headers['x-forwarded-for']).toBeUndefined()
  })
})

// Exercises the real Node HTTP parser: raw client headers, including a duplicated
// x-iisnode-remote_addr (what a client copy would look like if iisnode appended rather
// than replaced it), go through the same hook server.js runs before Next handles the request.
describe('applyTrustedClientIp behind a real Node HTTP server', () => {
  let server: ReturnType<typeof createServer>
  let port: number

  beforeAll(async () => {
    server = createServer((request, response) => {
      applyTrustedClientIp(request.headers)
      response.setHeader('content-type', 'application/json')
      response.end(JSON.stringify({
        forwardedFor: request.headers['x-forwarded-for'] ?? null,
        cf: request.headers['cf-connecting-ip'] ?? null,
        realIp: request.headers['x-real-ip'] ?? null,
      }))
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    port = (server.address() as AddressInfo).port
  })

  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())))

  function rawRequest(headerLines: string[]): Promise<Record<string, string | null>> {
    return new Promise((resolve, reject) => {
      const socket = connect(port, '127.0.0.1', () => {
        socket.write(['GET / HTTP/1.1', 'Host: localhost', 'Connection: close', ...headerLines, '', ''].join('\r\n'))
      })
      let raw = ''
      socket.on('data', (chunk) => { raw += chunk.toString('utf8') })
      socket.on('end', () => resolve(JSON.parse(raw.slice(raw.indexOf('\r\n\r\n') + 4))))
      socket.on('error', reject)
    })
  }

  it('ignores spoofed forwarding headers and keeps the promoted address', async () => {
    const body = await rawRequest([
      'X-Forwarded-For: 1.2.3.4',
      'CF-Connecting-IP: 9.9.9.9',
      'X-Real-IP: 8.8.8.8',
      'X-iisnode-REMOTE_ADDR: 203.0.113.7',
    ])
    expect(body).toEqual({ forwardedFor: '203.0.113.7', cf: null, realIp: null })
  })

  it('trusts nothing when a client copy of the promoted header is merged with the real one', async () => {
    const body = await rawRequest([
      'X-iisnode-REMOTE_ADDR: 1.2.3.4',
      'X-iisnode-REMOTE_ADDR: 203.0.113.7',
      'X-Forwarded-For: 5.6.7.8',
    ])
    expect(body).toEqual({ forwardedFor: null, cf: null, realIp: null })
  })

  it('trusts nothing when only spoofable headers arrive', async () => {
    const body = await rawRequest(['X-Forwarded-For: 1.2.3.4', 'X-Real-IP: 8.8.8.8'])
    expect(body).toEqual({ forwardedFor: null, cf: null, realIp: null })
  })
})
