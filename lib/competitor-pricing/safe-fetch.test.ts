import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import https from 'node:https'
import type { AddressInfo } from 'node:net'
import os from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { isBlockedIp, type ResolvedAddress } from '@/lib/net-ip-guard'

// No external network: production-transport tests fail before connecting (DNS is mocked),
// all other tests talk to loopback servers through the test-only transport.
const dnsMock = vi.hoisted(() => ({ lookup: vi.fn() }))
vi.mock('node:dns/promises', () => ({ default: { lookup: dnsMock.lookup } }))

import {
  MAX_REDIRECTS,
  PRICE_MONITOR_USER_AGENT,
  SafeFetchError,
  checkTargetUrl,
  createTestSafeFetch,
  parseContentEncoding,
  parseContentType,
  resolveLimits,
  resolveRedirectTarget,
  safeFetch,
  sanitizeUrlForLog,
  type SafeFetchRequest,
} from './safe-fetch'

const HOSTS = ['shop.example', 'www.shop.example']
const LOOPBACK = '127.0.0.1'

type Handler = (req: http.IncomingMessage, res: http.ServerResponse) => void
type TestServer = { port: number; requests: http.IncomingMessage[]; connections: number; close: () => Promise<void> }

const servers: TestServer[] = []

async function listen(server: http.Server | https.Server, handler: Handler): Promise<TestServer> {
  const state: TestServer = { port: 0, requests: [], connections: 0, close: async () => undefined }
  server.on('request', (req, res) => {
    state.requests.push(req)
    handler(req, res)
  })
  server.on('connection', () => { state.connections += 1 })
  server.on('secureConnection', () => undefined)
  await new Promise<void>((resolve) => server.listen(0, LOOPBACK, resolve))
  state.port = (server.address() as AddressInfo).port
  state.close = () => new Promise<void>((resolve) => {
    server.closeAllConnections()
    server.close(() => resolve())
  })
  servers.push(state)
  return state
}

const startHttp = (handler: Handler) => listen(http.createServer(), handler)

/** Loopback test server is the only "public" address; every other address uses the real guard. */
const testIsBlocked = (ip: string) => (ip === LOOPBACK ? false : isBlockedIp(ip))

function resolverFor(map: Record<string, string[] | string[][]>) {
  const calls: Record<string, number> = {}
  const resolve = vi.fn(async (hostname: string): Promise<ResolvedAddress[]> => {
    const entry = map[hostname]
    if (!entry) throw Object.assign(new Error('not found'), { code: 'ENOTFOUND' })
    calls[hostname] = (calls[hostname] ?? 0) + 1
    // A list of lists = successive DNS answers (rebinding simulation); the last one repeats.
    const answer = Array.isArray(entry[0]) ? (entry as string[][])[Math.min(calls[hostname] - 1, entry.length - 1)] : (entry as string[])
    return answer.map((address) => ({ address, family: address.includes(':') ? 6 : 4 }))
  })
  return resolve
}

function httpFetcher(port: number, resolve = resolverFor({ 'shop.example': [LOOPBACK], 'www.shop.example': [LOOPBACK] }), isBlocked = testIsBlocked) {
  return createTestSafeFetch({ resolve, isBlocked, allowHttp: true, portOverride: port })
}

const req = (url: string, extra: Partial<SafeFetchRequest> = {}): SafeFetchRequest => ({ url, allowedHosts: HOSTS, contentPolicy: 'html', ...extra })

async function expectCode(promise: Promise<unknown>, code: string): Promise<SafeFetchError> {
  const error = await promise.then(() => null, (e: unknown) => e)
  expect(error).toBeInstanceOf(SafeFetchError)
  expect((error as SafeFetchError).code).toBe(code)
  return error as SafeFetchError
}

const html = (res: http.ServerResponse, body: string | Buffer, headers: http.OutgoingHttpHeaders = {}) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', ...headers })
  res.end(body)
}

beforeEach(() => {
  dnsMock.lookup.mockReset()
  dnsMock.lookup.mockRejectedValue(new Error('production DNS must not be reached in this test'))
})

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()))
})

describe('URL policy', () => {
  it('rejects http with the production transport before any DNS lookup', async () => {
    await expectCode(safeFetch(req('http://shop.example/p/1')), 'unsupported_scheme')
    expect(dnsMock.lookup).not.toHaveBeenCalled()
  })

  it.each([
    ['file', 'file:///etc/passwd'],
    ['ftp', 'ftp://shop.example/p'],
    ['data', 'data:text/html,<b>x</b>'],
    ['javascript', 'javascript:alert(1)'],
    ['gopher', 'gopher://shop.example/'],
  ])('rejects %s scheme', async (_label, url) => {
    await expectCode(safeFetch(req(url)), 'unsupported_scheme')
  })

  it.each([
    ['embedded credentials', 'https://user:pass@shop.example/p', 'credentials_in_url'],
    ['deceptive prefix competitor@evil', 'https://shop.example@evil.com/p', 'credentials_in_url'],
    ['malicious suffix', 'https://shop.example.evil.com/p', 'host_not_allowed'],
    ['unexpected subdomain', 'https://cdn.shop.example/p', 'host_not_allowed'],
    ['lookalike', 'https://evilshop.example/p', 'host_not_allowed'],
    ['IPv4 literal', 'https://127.0.0.1/p', 'host_not_allowed'],
    ['IPv6 literal', 'https://[::1]/p', 'host_not_allowed'],
    ['decimal IP', 'https://2130706433/p', 'host_not_allowed'],
    ['explicit port', 'https://shop.example:8443/p', 'port_not_allowed'],
    ['garbage', 'not a url', 'invalid_url'],
  ])('rejects %s', async (_label, url, code) => {
    await expectCode(safeFetch(req(url)), code)
    expect(dnsMock.lookup).not.toHaveBeenCalled()
  })

  it('accepts exact allowlisted hosts only (www is separate)', () => {
    expect(checkTargetUrl('https://shop.example/p?x=1#frag', HOSTS).href).toBe('https://shop.example/p?x=1')
    expect(checkTargetUrl('https://WWW.Shop.Example/p', HOSTS).hostname).toBe('www.shop.example')
    expect(() => checkTargetUrl('https://www.shop.example/p', ['shop.example'])).toThrow(SafeFetchError)
  })
})

describe('IP policy (DNS answers)', () => {
  it.each([
    ['loopback', '127.0.0.2'],
    ['RFC1918', '10.1.2.3'],
    ['RFC1918 192.168', '192.168.0.10'],
    ['link-local', '169.254.10.10'],
    ['metadata', '169.254.169.254'],
    ['IPv6 loopback', '::1'],
    ['IPv6 link-local', 'fe80::1'],
    ['IPv6 ULA', 'fd00:ec2::254'],
    ['IPv4-mapped private', '::ffff:10.0.0.1'],
  ])('production transport blocks %s before connecting', async (_label, address) => {
    dnsMock.lookup.mockResolvedValue([{ address, family: address.includes(':') ? 6 : 4 }])
    const error = await expectCode(safeFetch(req('https://shop.example/p')), 'unsafe_address')
    expect(error.blocking).toBe(true)
    expect(dnsMock.lookup).toHaveBeenCalledWith('shop.example', { all: true, verbatim: true })
  })

  it('rejects a host whose DNS answers mix public and private (no "pick the public one")', async () => {
    const server = await startHttp((_q, res) => html(res, 'ok'))
    const fetcher = httpFetcher(server.port, resolverFor({ 'shop.example': [LOOPBACK, '10.0.0.5'] }))
    await expectCode(fetcher(req('http://shop.example/p')), 'unsafe_address')
    expect(server.connections).toBe(0)
  })

  it('allows a public address and reports the connected peer', async () => {
    const server = await startHttp((_q, res) => html(res, '<p>ok</p>'))
    const result = await httpFetcher(server.port)(req('http://shop.example/p'))
    expect(result).toMatchObject({ status: 200, body: '<p>ok</p>', remoteAddress: LOOPBACK, redirectCount: 0 })
  })
})

describe('DNS rebinding / connection-time validation', () => {
  it('resolves once per hop and connects to that validated address (no second, unvalidated lookup)', async () => {
    const server = await startHttp((_q, res) => html(res, 'ok'))
    // Second answer would be private: it must never be used for the first hop's connection.
    const resolve = resolverFor({ 'shop.example': [[LOOPBACK], ['10.0.0.1']] })
    await httpFetcher(server.port, resolve)(req('http://shop.example/p'))
    expect(resolve).toHaveBeenCalledTimes(1)
  })

  it('blocks when the answer turns private at connection time of a later hop', async () => {
    const server = await startHttp((q, res) => {
      if (q.url === '/start') {
        res.writeHead(302, { location: '/next' })
        res.end()
      } else html(res, 'should not be reached')
    })
    const resolve = resolverFor({ 'shop.example': [[LOOPBACK], ['10.0.0.1']] })
    await expectCode(httpFetcher(server.port, resolve)(req('http://shop.example/start')), 'unsafe_address')
    expect(server.requests.map((r) => r.url)).toEqual(['/start'])
  })

  it('verifies the actual connected peer and aborts before sending the request', async () => {
    const server = await startHttp((_q, res) => html(res, 'ok'))
    // The address passes at DNS time but is classified as blocked once connected.
    let checks = 0
    const isBlocked = (ip: string) => {
      checks += 1
      return checks > 1 || testIsBlocked(ip)
    }
    await expectCode(httpFetcher(server.port, undefined, isBlocked)(req('http://shop.example/p')), 'unsafe_address')
    expect(server.requests).toHaveLength(0)
  })
})

describe('redirects', () => {
  it('follows a relative redirect within the allowlist', async () => {
    const server = await startHttp((q, res) => {
      if (q.url === '/old') {
        res.writeHead(301, { location: '/new?id=5' })
        res.end()
      } else html(res, 'moved')
    })
    const result = await httpFetcher(server.port)(req('http://shop.example/old'))
    expect(result).toMatchObject({ body: 'moved', redirectCount: 1, finalUrl: 'http://shop.example/new?id=5' })
  })

  it('follows a redirect to another explicitly allowed host', async () => {
    const server = await startHttp((q, res) => {
      if (q.headers.host === 'shop.example') {
        res.writeHead(308, { location: 'http://www.shop.example/p' })
        res.end()
      } else html(res, `host=${q.headers.host}`)
    })
    expect((await httpFetcher(server.port)(req('http://shop.example/p'))).body).toBe('host=www.shop.example')
  })

  it(`stops after ${MAX_REDIRECTS} redirects`, async () => {
    const server = await startHttp((q, res) => {
      const n = Number(q.url?.slice(2) ?? 0)
      res.writeHead(302, { location: `/r${n + 1}` })
      res.end()
    })
    await expectCode(httpFetcher(server.port)(req('http://shop.example/r0')), 'too_many_redirects')
    expect(server.requests).toHaveLength(MAX_REDIRECTS + 1)
  })

  it('detects a redirect loop', async () => {
    const server = await startHttp((q, res) => {
      res.writeHead(302, { location: q.url === '/a' ? '/b' : '/a' })
      res.end()
    })
    await expectCode(httpFetcher(server.port)(req('http://shop.example/a')), 'redirect_loop')
  })

  it.each([
    ['unapproved host', 'http://evil.example/x'],
    ['private IP literal', 'http://10.0.0.1/x'],
    ['loopback name', 'http://localhost/x'],
    ['metadata IP', 'http://169.254.169.254/latest/meta-data'],
    ['credentials', 'http://a:b@shop.example/x'],
    ['scheme', 'file:///etc/passwd'],
  ])('rejects redirect to %s', async (_label, location) => {
    const server = await startHttp((_q, res) => {
      res.writeHead(302, { location })
      res.end()
    })
    await expectCode(httpFetcher(server.port)(req('http://shop.example/p')), 'redirect_rejected')
    expect(server.requests).toHaveLength(1)
  })

  it('rejects a redirect to an allowed host that resolves to a private IP', async () => {
    const server = await startHttp((_q, res) => {
      res.writeHead(302, { location: 'http://www.shop.example/p' })
      res.end()
    })
    const resolve = resolverFor({ 'shop.example': [LOOPBACK], 'www.shop.example': ['192.168.1.20'] })
    await expectCode(httpFetcher(server.port, resolve)(req('http://shop.example/p')), 'unsafe_address')
  })

  it('never downgrades https → http', () => {
    expect(() => resolveRedirectTarget(new URL('https://shop.example/a'), 'http://shop.example/b', HOSTS, true)).toThrow(/downgrade/)
    expect(resolveRedirectTarget(new URL('https://shop.example/a/b'), '../c', HOSTS).href).toBe('https://shop.example/c')
  })
})

describe('body limits and decoding', () => {
  it('reads a chunked body', async () => {
    const server = await startHttp((_q, res) => {
      res.writeHead(200, { 'content-type': 'text/html' })
      res.write('<p>')
      setTimeout(() => res.end('chunked</p>'), 20)
    })
    expect((await httpFetcher(server.port)(req('http://shop.example/p'))).body).toBe('<p>chunked</p>')
  })

  it('rejects a body over the limit while streaming (no Content-Length)', async () => {
    const server = await startHttp((_q, res) => {
      res.writeHead(200, { 'content-type': 'text/html' })
      for (let i = 0; i < 20; i += 1) res.write(Buffer.alloc(1024, 97))
      res.end()
    })
    await expectCode(httpFetcher(server.port)(req('http://shop.example/p', { limits: { maxBodyBytes: 4096, maxDecodedBytes: 4096 } })), 'response_too_large')
  })

  it('rejects a declared Content-Length over the limit before reading', async () => {
    const server = await startHttp((_q, res) => html(res, Buffer.alloc(10_000, 97), { 'content-length': '10000' }))
    const error = await expectCode(httpFetcher(server.port)(req('http://shop.example/p', { limits: { maxBodyBytes: 2048 } })), 'response_too_large')
    expect(error.detail).toContain('content-length')
  })

  it('stops a gzip bomb by decompressed size', async () => {
    const bomb = zlib.gzipSync(Buffer.alloc(5_000_000))
    expect(bomb.length).toBeLessThan(20_000)
    const server = await startHttp((_q, res) => html(res, bomb, { 'content-encoding': 'gzip' }))
    await expectCode(httpFetcher(server.port)(req('http://shop.example/p', { limits: { maxDecodedBytes: 100_000 } })), 'decompressed_too_large')
  })

  it('stops a brotli bomb by decompressed size', async () => {
    const bomb = zlib.brotliCompressSync(Buffer.alloc(5_000_000))
    const server = await startHttp((_q, res) => html(res, bomb, { 'content-encoding': 'br' }))
    await expectCode(httpFetcher(server.port)(req('http://shop.example/p', { limits: { maxDecodedBytes: 100_000 } })), 'decompressed_too_large')
  })

  it('decodes valid gzip and br bodies', async () => {
    const server = await startHttp((q, res) => q.url === '/gz'
      ? html(res, zlib.gzipSync('<p>gzip</p>'), { 'content-encoding': 'gzip' })
      : html(res, zlib.brotliCompressSync('<p>br</p>'), { 'content-encoding': 'br' }))
    const fetcher = httpFetcher(server.port)
    expect((await fetcher(req('http://shop.example/gz'))).body).toBe('<p>gzip</p>')
    expect((await fetcher(req('http://shop.example/br'))).body).toBe('<p>br</p>')
  })

  it.each([
    ['garbage gzip', Buffer.from('definitely not gzip'), 'gzip'],
    ['truncated gzip', zlib.gzipSync('<p>' + 'x'.repeat(5000) + '</p>').subarray(0, 40), 'gzip'],
    ['garbage brotli', Buffer.from([0xff, 0xff, 0xff, 0xff, 0x00]), 'br'],
  ])('rejects malformed compressed body: %s', async (_label, body, encoding) => {
    const server = await startHttp((_q, res) => html(res, body, { 'content-encoding': encoding }))
    await expectCode(httpFetcher(server.port)(req('http://shop.example/p')), 'decode_error')
  })

  it('decodes the declared charset (Latvian windows-1257)', async () => {
    // 0xE2 = "ā" in windows-1257
    const server = await startHttp((_q, res) => html(res, Buffer.from([0x4b, 0x72, 0xe2, 0x73, 0x61]), { 'content-type': 'TEXT/HTML; Charset="windows-1257"' }))
    const result = await httpFetcher(server.port)(req('http://shop.example/p'))
    expect(result).toMatchObject({ body: 'Krāsa', mimeType: 'text/html', charset: 'windows-1257' })
  })
})

describe('content type and encoding policy', () => {
  it.each([
    ['binary', 'application/octet-stream'],
    ['image', 'image/png'],
    ['json', 'application/json'],
    ['plain text for html policy', 'text/plain'],
  ])('rejects %s', async (_label, contentType) => {
    const server = await startHttp((_q, res) => html(res, 'x', { 'content-type': contentType }))
    await expectCode(httpFetcher(server.port)(req('http://shop.example/p')), 'unsupported_content_type')
  })

  it('rejects a missing Content-Type', async () => {
    const server = await startHttp((_q, res) => {
      res.removeHeader('content-type')
      res.writeHead(200)
      res.end('x')
    })
    await expectCode(httpFetcher(server.port)(req('http://shop.example/p')), 'unsupported_content_type')
  })

  it('accepts xhtml and text/plain only under the robots policy', async () => {
    const server = await startHttp((q, res) => html(res, 'x', { 'content-type': q.url === '/x' ? 'application/xhtml+xml' : 'text/plain; charset=utf-8' }))
    const fetcher = httpFetcher(server.port)
    expect((await fetcher(req('http://shop.example/x'))).mimeType).toBe('application/xhtml+xml')
    expect((await fetcher(req('http://shop.example/robots.txt', { contentPolicy: 'robots' }))).body).toBe('x')
  })

  it.each(['deflate', 'compress', 'zstd', 'gzip, br'])('rejects Content-Encoding %s (fail closed)', async (encoding) => {
    const server = await startHttp((_q, res) => html(res, 'x', { 'content-encoding': encoding }))
    await expectCode(httpFetcher(server.port)(req('http://shop.example/p')), 'unsupported_content_encoding')
  })

  it('parses content type and encoding headers', () => {
    expect(parseContentType('text/html; charset=UTF-8')).toEqual({ mimeType: 'text/html', charset: 'utf-8' })
    expect(parseContentType(undefined)).toBeNull()
    expect(parseContentEncoding('X-GZIP')).toBe('gzip')
    expect(parseContentEncoding(undefined)).toBe('identity')
    expect(parseContentEncoding('deflate')).toBeNull()
  })
})

describe('HTTP status classification', () => {
  it.each([
    [401, {}, '', 'http_401', true],
    [403, {}, 'Forbidden', 'http_403', true],
    [403, {}, '<script src="/cdn-cgi/challenge-platform/h/b/orchestrate"></script>', 'challenge', true],
    [503, { 'cf-mitigated': 'challenge' }, '', 'challenge', true],
    [429, {}, '<div class="g-recaptcha"></div>', 'challenge', true],
    [404, {}, '', 'not_found', false],
    [410, {}, '', 'not_found', false],
    [500, {}, '', 'http_server_error', false],
    [418, {}, '', 'http_error', false],
  ] as const)('HTTP %i → %s', async (status, headers, body, code, blocking) => {
    const server = await startHttp((_q, res) => {
      res.writeHead(status, { 'content-type': 'text/html', ...headers })
      res.end(body)
    })
    const error = await expectCode(httpFetcher(server.port)(req('http://shop.example/p')), code)
    expect(error.blocking).toBe(blocking)
    expect(error.retryable).toBe(false)
  })

  it('503 without challenge signals is retryable; 429 carries Retry-After and is not blocking', async () => {
    const server = await startHttp((q, res) => {
      if (q.url === '/busy') res.writeHead(503, { 'content-type': 'text/html' })
      else res.writeHead(429, { 'content-type': 'text/html', 'retry-after': '120' })
      res.end('slow down')
    })
    const fetcher = httpFetcher(server.port)
    expect((await expectCode(fetcher(req('http://shop.example/busy')), 'http_server_error')).retryable).toBe(true)
    const limited = await expectCode(fetcher(req('http://shop.example/limited')), 'rate_limited')
    expect(limited).toMatchObject({ retryAfterSeconds: 120, blocking: false })
  })
})

describe('timeouts', () => {
  it('times out a stalled DNS/connect phase and never connects late', async () => {
    const server = await startHttp((_q, res) => html(res, 'late'))
    const resolve = vi.fn(() => new Promise<ResolvedAddress[]>((done) => setTimeout(() => done([{ address: LOOPBACK, family: 4 }]), 400)))
    const fetcher = createTestSafeFetch({ resolve, isBlocked: testIsBlocked, allowHttp: true, portOverride: server.port })
    const error = await expectCode(fetcher(req('http://shop.example/p', { limits: { connectTimeoutMs: 200 } })), 'timeout')
    expect(error.detail).toBe('connect')
    expect(error.retryable).toBe(true)
    await new Promise((done) => setTimeout(done, 400))
    expect(server.connections).toBe(0)
  })

  it('times out when response headers never arrive', async () => {
    const server = await startHttp(() => undefined)
    const error = await expectCode(httpFetcher(server.port)(req('http://shop.example/p', { limits: { headersTimeoutMs: 300 } })), 'timeout')
    expect(error.detail).toBe('headers')
  })

  it('enforces the total timeout on a stalled body', async () => {
    const server = await startHttp((_q, res) => {
      res.writeHead(200, { 'content-type': 'text/html' })
      res.write('<p>partial')
    })
    const error = await expectCode(httpFetcher(server.port)(req('http://shop.example/p', { limits: { totalTimeoutMs: 600, headersTimeoutMs: 5000 } })), 'timeout')
    expect(error.detail).toBe('total')
  })

  it('clamps limits to hard bounds', () => {
    expect(resolveLimits({ totalTimeoutMs: 10 * 60_000, maxDecodedBytes: 1e9, connectTimeoutMs: 0 })).toMatchObject({
      totalTimeoutMs: 30_000,
      maxDecodedBytes: 5_000_000,
      connectTimeoutMs: 200,
    })
  })
})

describe('request hygiene and log safety', () => {
  it('sends an honest User-Agent, no cookies, no credentials', async () => {
    const server = await startHttp((_q, res) => html(res, 'ok', { 'set-cookie': 'session=abc' }))
    await httpFetcher(server.port)(req('http://shop.example/p'))
    const headers = server.requests[0].headers
    expect(headers['user-agent']).toBe(PRICE_MONITOR_USER_AGENT)
    expect(headers['user-agent']).not.toMatch(/Mozilla|Chrome|Googlebot/i)
    expect(headers.cookie).toBeUndefined()
    expect(headers.authorization).toBeUndefined()
    expect(headers['accept-encoding']).toBe('gzip, br')
  })

  it('errors never carry body, cookies or query secrets', async () => {
    const server = await startHttp((_q, res) => {
      res.writeHead(403, { 'content-type': 'text/html', 'set-cookie': 'sid=SECRET_COOKIE' })
      res.end('BODY_MARKER')
    })
    const error = await expectCode(httpFetcher(server.port)(req('http://shop.example/p?token=QUERY_SECRET')), 'http_403')
    const serialized = JSON.stringify({ message: error.message, context: error.toLogContext() })
    expect(serialized).not.toContain('BODY_MARKER')
    expect(serialized).not.toContain('SECRET_COOKIE')
    expect(serialized).not.toContain('QUERY_SECRET')
    expect(error.url).toBe('http://shop.example/p?[redacted]')
  })

  it('sanitizes URLs for logs', () => {
    expect(sanitizeUrlForLog('https://u:p@shop.example/a?b=1#c')).toBe('https://shop.example/a?[redacted]')
    expect(sanitizeUrlForLog('::')).toBe('[invalid-url]')
  })

  it('the test transport cannot be created outside Vitest', () => {
    vi.stubEnv('VITEST', '')
    try {
      expect(() => createTestSafeFetch({ allowHttp: true })).toThrow(/test-only/)
    } finally {
      vi.unstubAllEnvs()
    }
  })
})

// --- TLS (self-signed certificate generated at test time; skipped if openssl is unavailable) ---

let tlsMaterial: { key: string; cert: string } | null = null
beforeAll(() => {
  try {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'safe-fetch-tls-'))
    execFileSync('openssl', [
      'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
      '-keyout', path.join(dir, 'key.pem'), '-out', path.join(dir, 'cert.pem'),
      '-subj', '/CN=shop.example', '-addext', 'subjectAltName=DNS:shop.example,DNS:www.shop.example',
    ], { stdio: 'ignore', env: { ...process.env, MSYS_NO_PATHCONV: '1' } })
    tlsMaterial = { key: fs.readFileSync(path.join(dir, 'key.pem'), 'utf8'), cert: fs.readFileSync(path.join(dir, 'cert.pem'), 'utf8') }
    fs.rmSync(dir, { recursive: true, force: true })
  } catch {
    tlsMaterial = null
  }
})

describe('TLS', () => {
  const startHttps = (handler: Handler) => listen(https.createServer({ key: tlsMaterial!.key, cert: tlsMaterial!.cert }), handler)
  const httpsFetcher = (port: number, extraCa: string | null, hosts: Record<string, string[]> = { 'shop.example': [LOOPBACK], 'other.example': [LOOPBACK] }) =>
    createTestSafeFetch({ resolve: resolverFor(hosts), isBlocked: testIsBlocked, allowHttp: false, portOverride: port, extraCa })

  it('fetches over https when the certificate chains to a trusted CA and matches the hostname', async (ctx) => {
    if (!tlsMaterial) ctx.skip()
    const server = await startHttps((_q, res) => html(res, 'secure'))
    expect((await httpsFetcher(server.port, tlsMaterial!.cert)(req('https://shop.example/p'))).body).toBe('secure')
  })

  it('rejects an untrusted (self-signed) certificate — validation is never disabled', async (ctx) => {
    if (!tlsMaterial) ctx.skip()
    const server = await startHttps((_q, res) => html(res, 'secure'))
    await expectCode(httpsFetcher(server.port, null)(req('https://shop.example/p')), 'tls_error')
    expect(server.requests).toHaveLength(0)
  })

  it('rejects a certificate for a different hostname', async (ctx) => {
    if (!tlsMaterial) ctx.skip()
    const server = await startHttps((_q, res) => html(res, 'secure'))
    const error = await expectCode(httpsFetcher(server.port, tlsMaterial!.cert)(req('https://other.example/p', { allowedHosts: ['other.example'] })), 'tls_error')
    expect(error.detail).toBe('ERR_TLS_CERT_ALTNAME_INVALID')
  })

  it('rejects an https → http downgrade redirect', async (ctx) => {
    if (!tlsMaterial) ctx.skip()
    const server = await startHttps((_q, res) => {
      res.writeHead(302, { location: 'http://shop.example/plain' })
      res.end()
    })
    const error = await expectCode(httpsFetcher(server.port, tlsMaterial!.cert)(req('https://shop.example/p')), 'redirect_rejected')
    expect(error.detail).toContain('downgrade')
  })
})
