import dns from 'node:dns/promises'
import http from 'node:http'
import net from 'node:net'
import tls from 'node:tls'
import zlib from 'node:zlib'
import { isBlockedIp, parseIPv6, type ResolvedAddress } from '@/lib/net-ip-guard'
import { normalizePublicHostname } from './competitor-config'

// Safe GET of a public page on an admin-allowlisted competitor host.
//
// SSRF / DNS-rebinding design: for every hop (initial request and each redirect) the
// hostname is resolved exactly once, *every* answer must be public, and the TCP
// connection is opened to that validated IP literal — Node never performs a second,
// unvalidated DNS lookup. The connected peer address is verified again before any byte
// of the HTTP request is written, and TLS runs on top of that socket with
// servername = hostname, so the certificate is validated against the allowlisted name.
//
// No cookies, no credentials, no proxy, no JS execution, honest User-Agent.

export const PRICE_MONITOR_ROBOTS_TOKEN = 'HairshopProPriceMonitor'
export const PRICE_MONITOR_USER_AGENT = `${PRICE_MONITOR_ROBOTS_TOKEN}/1.0 (+https://hairshoppro.lv)`
export const MAX_REDIRECTS = 3

// --- errors -------------------------------------------------------------------------

export const SAFE_FETCH_ERROR_CODES = [
  'robots_disallowed',
  'robots_unavailable',
  'invalid_url',
  'unsupported_scheme',
  'credentials_in_url',
  'port_not_allowed',
  'host_not_allowed',
  'unsafe_address',
  'dns_error',
  'redirect_rejected',
  'too_many_redirects',
  'redirect_loop',
  'tls_error',
  'timeout',
  'http_401',
  'http_403',
  'challenge',
  'rate_limited',
  'not_found',
  'http_server_error',
  'http_error',
  'response_too_large',
  'decompressed_too_large',
  'unsupported_content_type',
  'unsupported_content_encoding',
  'decode_error',
  'network_error',
] as const
export type SafeFetchErrorCode = (typeof SAFE_FETCH_ERROR_CODES)[number]

/**
 * blocking: the source refuses automated access (or is unsafe) → future monitor stops the
 *           competitor (status blocked) until an admin resumes it; never retried.
 * retryable: transient; may be retried a bounded number of times with backoff.
 */
const CODE_TRAITS: Record<SafeFetchErrorCode, { blocking: boolean; retryable: boolean }> = {
  robots_disallowed: { blocking: true, retryable: false },
  robots_unavailable: { blocking: false, retryable: false },
  invalid_url: { blocking: false, retryable: false },
  unsupported_scheme: { blocking: false, retryable: false },
  credentials_in_url: { blocking: false, retryable: false },
  port_not_allowed: { blocking: false, retryable: false },
  host_not_allowed: { blocking: false, retryable: false },
  unsafe_address: { blocking: true, retryable: false },
  dns_error: { blocking: false, retryable: false },
  redirect_rejected: { blocking: false, retryable: false },
  too_many_redirects: { blocking: false, retryable: false },
  redirect_loop: { blocking: false, retryable: false },
  tls_error: { blocking: false, retryable: false },
  timeout: { blocking: false, retryable: true },
  http_401: { blocking: true, retryable: false },
  http_403: { blocking: true, retryable: false },
  challenge: { blocking: true, retryable: false },
  rate_limited: { blocking: false, retryable: false },
  not_found: { blocking: false, retryable: false },
  http_server_error: { blocking: false, retryable: false },
  http_error: { blocking: false, retryable: false },
  response_too_large: { blocking: false, retryable: false },
  decompressed_too_large: { blocking: false, retryable: false },
  unsupported_content_type: { blocking: false, retryable: false },
  unsupported_content_encoding: { blocking: false, retryable: false },
  decode_error: { blocking: false, retryable: false },
  network_error: { blocking: false, retryable: true },
}

/** origin + path only: query strings may carry tokens, credentials are never kept. */
export function sanitizeUrlForLog(raw: string | URL): string {
  try {
    const url = typeof raw === 'string' ? new URL(raw) : raw
    return `${url.protocol}//${url.host}${url.pathname}${url.search ? '?[redacted]' : ''}`
  } catch {
    return '[invalid-url]'
  }
}

export class SafeFetchError extends Error {
  readonly blocking: boolean
  readonly retryable: boolean
  readonly url?: string
  readonly status?: number
  readonly retryAfterSeconds?: number
  readonly detail?: string

  constructor(
    readonly code: SafeFetchErrorCode,
    options: { url?: string | URL; status?: number; retryAfterSeconds?: number; detail?: string; retryable?: boolean } = {},
  ) {
    const url = options.url === undefined ? undefined : sanitizeUrlForLog(options.url)
    super(`${code}${options.status ? ` (HTTP ${options.status})` : ''}${options.detail ? `: ${options.detail}` : ''}${url ? ` [${url}]` : ''}`)
    this.name = 'SafeFetchError'
    this.blocking = CODE_TRAITS[code].blocking
    this.retryable = options.retryable ?? CODE_TRAITS[code].retryable
    this.url = url
    this.status = options.status
    this.retryAfterSeconds = options.retryAfterSeconds
    this.detail = options.detail
  }

  /** Log-safe structured form: never contains bodies, headers or cookies. */
  toLogContext(): Record<string, unknown> {
    return { code: this.code, status: this.status, url: this.url, detail: this.detail, blocking: this.blocking, retryable: this.retryable }
  }
}

const TLS_ERROR_CODES = new Set([
  'CERT_HAS_EXPIRED', 'CERT_NOT_YET_VALID', 'CERT_REVOKED', 'CERT_UNTRUSTED', 'CERT_REJECTED',
  'DEPTH_ZERO_SELF_SIGNED_CERT', 'SELF_SIGNED_CERT_IN_CHAIN', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'UNABLE_TO_GET_ISSUER_CERT', 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY', 'ERR_TLS_CERT_ALTNAME_INVALID',
  'HOSTNAME_MISMATCH', 'EPROTO',
])
const TRANSIENT_NETWORK_CODES = new Set(['ECONNREFUSED', 'ECONNRESET', 'EHOSTUNREACH', 'ENETUNREACH', 'EPIPE', 'ECONNABORTED', 'ETIMEDOUT'])

export function classifyNetworkError(error: unknown, url?: URL): SafeFetchError {
  if (error instanceof SafeFetchError) return error
  const code = typeof (error as { code?: unknown })?.code === 'string' ? (error as { code: string }).code : ''
  if (TLS_ERROR_CODES.has(code) || code.startsWith('ERR_SSL_') || code.startsWith('ERR_TLS_')) {
    return new SafeFetchError('tls_error', { url, detail: code })
  }
  if (code === 'ENOTFOUND' || code === 'EAI_NONAME' || code === 'ENODATA') return new SafeFetchError('dns_error', { url, detail: code })
  if (code === 'EAI_AGAIN' || code === 'ESERVFAIL') return new SafeFetchError('dns_error', { url, detail: code, retryable: true })
  if (TRANSIENT_NETWORK_CODES.has(code)) return new SafeFetchError('network_error', { url, detail: code })
  return new SafeFetchError('network_error', { url, detail: code || 'unknown', retryable: false })
}

// --- limits -------------------------------------------------------------------------

export type SafeFetchLimits = {
  connectTimeoutMs: number // DNS resolution + TCP connect + TLS handshake, per hop
  headersTimeoutMs: number // request written → response headers, per hop
  totalTimeoutMs: number // whole operation including redirects and body
  maxBodyBytes: number // bytes on the wire (compressed)
  maxDecodedBytes: number // bytes after decompression
}

// [min, max, default]: callers (Competitor config) can only tighten within these hard bounds.
const LIMIT_BOUNDS: Record<keyof SafeFetchLimits, readonly [number, number, number]> = {
  connectTimeoutMs: [200, 10_000, 5_000],
  headersTimeoutMs: [200, 20_000, 10_000],
  totalTimeoutMs: [500, 30_000, 20_000],
  maxBodyBytes: [1_024, 5_000_000, 2_000_000],
  maxDecodedBytes: [1_024, 5_000_000, 5_000_000],
}

export function resolveLimits(partial: Partial<SafeFetchLimits> = {}): SafeFetchLimits {
  const out = {} as SafeFetchLimits
  for (const key of Object.keys(LIMIT_BOUNDS) as Array<keyof SafeFetchLimits>) {
    const [min, max, fallback] = LIMIT_BOUNDS[key]
    const value = partial[key]
    out[key] = typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, Math.floor(value))) : fallback
  }
  return out
}

// --- content policy -------------------------------------------------------------------

export type ContentPolicy = 'html' | 'robots'

const CONTENT_TYPES: Record<ContentPolicy, readonly string[]> = {
  html: ['text/html', 'application/xhtml+xml'],
  robots: ['text/plain'],
}
const ACCEPT_HEADER: Record<ContentPolicy, string> = {
  html: 'text/html,application/xhtml+xml;q=0.9',
  robots: 'text/plain',
}

export function parseContentType(header: string | undefined): { mimeType: string; charset: string | null } | null {
  if (!header) return null
  const [type, ...params] = header.split(';')
  const mimeType = type.trim().toLowerCase()
  if (!mimeType) return null
  const charsetParam = params.map((p) => p.trim()).find((p) => p.toLowerCase().startsWith('charset='))
  const charset = charsetParam ? charsetParam.slice('charset='.length).trim().replace(/^"|"$/g, '').toLowerCase() || null : null
  return { mimeType, charset }
}

type Encoding = 'identity' | 'gzip' | 'br'

/** deflate is intentionally unsupported (ambiguous zlib/raw framing, no need); anything unknown fails closed. */
export function parseContentEncoding(header: string | undefined): Encoding | null {
  const value = (header ?? '').trim().toLowerCase()
  if (value === '' || value === 'identity') return 'identity'
  if (value === 'gzip' || value === 'x-gzip') return 'gzip'
  if (value === 'br') return 'br'
  return null
}

function decodeText(body: Buffer, charset: string | null): string {
  try {
    return new TextDecoder(charset ?? 'utf-8').decode(body)
  } catch {
    // Unknown charset label: decode as UTF-8 rather than fail (prices are ASCII digits).
    return new TextDecoder('utf-8').decode(body)
  }
}

// Conservative signals only (checked on 403/429/503 or via an explicit header).
const CHALLENGE_MARKERS = ['cf-chl-', '/cdn-cgi/challenge-platform', 'g-recaptcha', 'h-captcha', 'hcaptcha.com', 'captcha-delivery.com', '_incapsula_resource', 'px-captcha']

export function looksLikeChallenge(headers: http.IncomingHttpHeaders, bodySample: string): boolean {
  if (String(headers['cf-mitigated'] ?? '').toLowerCase() === 'challenge') return true
  const lower = bodySample.toLowerCase()
  return CHALLENGE_MARKERS.some((marker) => lower.includes(marker))
}

function parseRetryAfter(header: string | undefined, now: number): number | undefined {
  if (!header) return undefined
  const trimmed = header.trim()
  if (/^\d+$/.test(trimmed)) return Math.min(Number(trimmed), 7 * 24 * 3600)
  const date = Date.parse(trimmed)
  return Number.isNaN(date) ? undefined : Math.max(0, Math.min(Math.ceil((date - now) / 1000), 7 * 24 * 3600))
}

// --- URL policy -----------------------------------------------------------------------

/**
 * https only (http only with a test transport), no credentials, no explicit port,
 * hostname must be a public DNS name exactly equal to one of `allowedHosts`
 * (no suffix matching: www.shop.lv must be listed explicitly to be allowed).
 */
export function checkTargetUrl(raw: string | URL, allowedHosts: readonly string[], allowHttp = false): URL {
  let url: URL
  try {
    url = new URL(typeof raw === 'string' ? raw : raw.href)
  } catch {
    throw new SafeFetchError('invalid_url')
  }
  if (url.protocol !== 'https:' && !(allowHttp && url.protocol === 'http:')) {
    throw new SafeFetchError('unsupported_scheme', { detail: url.protocol })
  }
  if (url.username || url.password) throw new SafeFetchError('credentials_in_url')
  if (url.port) throw new SafeFetchError('port_not_allowed', { url })
  const host = normalizePublicHostname(url.hostname)
  const allowed = new Set(allowedHosts.map((h) => normalizePublicHostname(h)).filter((h): h is string => h !== null))
  if (!host || !allowed.has(host)) throw new SafeFetchError('host_not_allowed', { url })
  url.hash = ''
  return url
}

/** Redirect target: relative URLs resolved, never a downgrade, same URL policy as the first hop. */
export function resolveRedirectTarget(current: URL, location: string | undefined, allowedHosts: readonly string[], allowHttp = false): URL {
  if (!location) throw new SafeFetchError('redirect_rejected', { url: current, detail: 'missing Location' })
  let next: URL
  try {
    next = new URL(location, current)
  } catch {
    throw new SafeFetchError('redirect_rejected', { url: current, detail: 'invalid Location' })
  }
  if (current.protocol === 'https:' && next.protocol !== 'https:') {
    throw new SafeFetchError('redirect_rejected', { url: current, detail: `downgrade to ${next.protocol}` })
  }
  try {
    return checkTargetUrl(next, allowedHosts, allowHttp)
  } catch (error) {
    const code = error instanceof SafeFetchError ? error.code : 'invalid_url'
    throw new SafeFetchError('redirect_rejected', { url: current, detail: code })
  }
}

// --- transport --------------------------------------------------------------------------

type Transport = {
  resolve: (hostname: string) => Promise<ResolvedAddress[]>
  isBlocked: (ip: string) => boolean
  allowHttp: boolean
  portOverride: number | null
  /** Extra trusted CA (PEM) — test transport only; never disables verification. */
  extraCa: string | null
}

const PRODUCTION_TRANSPORT: Readonly<Transport> = Object.freeze({
  resolve: (hostname: string) => dns.lookup(hostname, { all: true, verbatim: true }),
  isBlocked: isBlockedIp,
  allowHttp: false,
  portOverride: null,
  extraCa: null,
})

function sameIp(a: string, b: string): boolean {
  if (net.isIPv4(a) || net.isIPv4(b)) return a === b
  const x = parseIPv6(a)
  const y = parseIPv6(b)
  return x !== null && y !== null && x.every((h, i) => h === y[i])
}

type FetchState = { socket: net.Socket | null; expired: boolean }

function withTimer<T>(promise: Promise<T>, ms: number, onTimeout: () => SafeFetchError, cleanup?: () => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup?.()
      reject(onTimeout())
    }, ms)
    promise.then(
      (value) => { clearTimeout(timer); resolve(value) },
      (error) => { clearTimeout(timer); reject(error) },
    )
  })
}

const refuseLookup: net.LookupFunction = (hostname, _options, callback) => {
  // The socket must connect to the already-validated IP literal; any lookup is a bug.
  callback(Object.assign(new Error(`unexpected DNS lookup for ${hostname}`), { code: 'EUNEXPECTEDLOOKUP' }), '', 4)
}

async function openConnection(url: URL, transport: Transport, limits: SafeFetchLimits, state: FetchState): Promise<{ socket: net.Socket; address: string }> {
  const hostname = url.hostname
  // Set when the connect timer fired: a late DNS answer must not open a socket afterwards.
  const hop = { aborted: false }
  const connectWork = async () => {
    let addresses: ResolvedAddress[]
    try {
      addresses = await transport.resolve(hostname)
    } catch (error) {
      throw classifyNetworkError(error, url)
    }
    if (!Array.isArray(addresses) || addresses.length === 0) throw new SafeFetchError('dns_error', { url, detail: 'no addresses' })
    const blocked = addresses.find(({ address }) => transport.isBlocked(address))
    if (blocked) throw new SafeFetchError('unsafe_address', { url, detail: `resolves to blocked address ${blocked.address}` })
    if (hop.aborted || state.expired) throw new SafeFetchError('timeout', { url, detail: 'connect' })

    const target = addresses[0]
    const port = transport.portOverride ?? (url.protocol === 'https:' ? 443 : 80)
    const raw = net.connect({ host: target.address, port, family: target.family === 6 ? 6 : 4, lookup: refuseLookup })
    state.socket = raw
    await new Promise<void>((resolve, reject) => {
      raw.once('connect', resolve)
      raw.once('error', (error) => reject(classifyNetworkError(error, url)))
    })
    if (hop.aborted || state.expired) {
      raw.destroy()
      throw new SafeFetchError('timeout', { url, detail: 'connect' })
    }
    // Connection-time verification of the actual peer, before any request byte is sent.
    const peer = raw.remoteAddress
    if (!peer || !sameIp(peer, target.address) || transport.isBlocked(peer)) {
      raw.destroy()
      throw new SafeFetchError('unsafe_address', { url, detail: `connected peer ${peer ?? 'unknown'} rejected` })
    }
    if (url.protocol !== 'https:') return { socket: raw, address: peer }

    const secure = tls.connect({
      socket: raw,
      servername: hostname,
      host: hostname,
      ALPNProtocols: ['http/1.1'],
      minVersion: 'TLSv1.2',
      ...(transport.extraCa ? { ca: transport.extraCa } : {}),
    })
    state.socket = secure
    await new Promise<void>((resolve, reject) => {
      secure.once('secureConnect', resolve)
      secure.once('error', (error) => reject(classifyNetworkError(error, url)))
    })
    return { socket: secure, address: peer }
  }
  return withTimer(connectWork(), limits.connectTimeoutMs, () => new SafeFetchError('timeout', { url, detail: 'connect' }), () => {
    hop.aborted = true
    state.socket?.destroy()
  })
}

function sendRequest(url: URL, socket: net.Socket, limits: SafeFetchLimits, policy: ContentPolicy): Promise<http.IncomingMessage> {
  const request = new Promise<http.IncomingMessage>((resolve, reject) => {
    const req = http.request({
      method: 'GET',
      path: `${url.pathname}${url.search}`,
      setHost: false,
      headers: {
        Host: url.host,
        'User-Agent': PRICE_MONITOR_USER_AGENT,
        Accept: ACCEPT_HEADER[policy],
        'Accept-Encoding': 'gzip, br',
        Connection: 'close',
      },
      createConnection: () => socket,
    })
    req.once('response', resolve)
    req.once('error', (error) => reject(classifyNetworkError(error, url)))
    req.end()
  })
  return withTimer(request, limits.headersTimeoutMs, () => new SafeFetchError('timeout', { url, detail: 'headers' }), () => socket.destroy())
}

/** Streams the body, enforcing wire and decoded size limits while reading; never buffers past a limit. */
function readBody(res: http.IncomingMessage, encoding: Encoding, maxBodyBytes: number, maxDecodedBytes: number, url: URL): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    let settled = false
    let wireBytes = 0
    let decodedBytes = 0
    const chunks: Buffer[] = []
    const decoder = encoding === 'gzip' ? zlib.createGunzip() : encoding === 'br' ? zlib.createBrotliDecompress() : null
    const fail = (error: SafeFetchError) => {
      if (settled) return
      settled = true
      res.destroy()
      decoder?.destroy()
      chunks.length = 0
      reject(error)
    }
    const done = () => {
      if (settled) return
      settled = true
      resolve(Buffer.concat(chunks))
    }
    const onDecoded = (chunk: Buffer) => {
      if (settled) return
      decodedBytes += chunk.length
      if (decodedBytes > maxDecodedBytes) {
        fail(new SafeFetchError(decoder ? 'decompressed_too_large' : 'response_too_large', { url, detail: `>${maxDecodedBytes} bytes` }))
        return
      }
      chunks.push(chunk)
    }
    res.on('data', (chunk: Buffer) => {
      if (settled) return
      wireBytes += chunk.length
      if (wireBytes > maxBodyBytes) {
        fail(new SafeFetchError('response_too_large', { url, detail: `>${maxBodyBytes} bytes` }))
        return
      }
      if (decoder) decoder.write(chunk)
      else onDecoded(chunk)
    })
    res.once('end', () => (decoder ? decoder.end() : done()))
    res.once('close', () => {
      if (!res.complete) fail(new SafeFetchError('network_error', { url, detail: 'response closed before end' }))
    })
    res.once('error', (error) => fail(classifyNetworkError(error, url)))
    if (decoder) {
      decoder.on('data', onDecoded)
      decoder.once('end', done)
      decoder.once('error', () => fail(new SafeFetchError('decode_error', { url, detail: `invalid ${encoding} stream` })))
    }
  })
}

// --- main ------------------------------------------------------------------------------

export type SafeFetchRequest = {
  url: string
  /** Exact hostnames of the competitor (Competitor.allowedHosts). */
  allowedHosts: readonly string[]
  contentPolicy: ContentPolicy
  limits?: Partial<SafeFetchLimits>
}

export type SafeFetchResult = {
  finalUrl: string
  status: number
  mimeType: string
  charset: string | null
  body: string
  decodedBytes: number
  redirectCount: number
  remoteAddress: string
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])
const CHALLENGE_SAMPLE_STATUSES = new Set([403, 429, 503])

async function errorForStatus(res: http.IncomingMessage, url: URL, limits: SafeFetchLimits): Promise<SafeFetchError> {
  const status = res.statusCode ?? 0
  let sample = ''
  const encoding = parseContentEncoding(res.headers['content-encoding'])
  if (CHALLENGE_SAMPLE_STATUSES.has(status) && encoding) {
    try {
      sample = (await readBody(res, encoding, Math.min(64 * 1024, limits.maxBodyBytes), 32 * 1024, url)).toString('latin1')
    } catch {
      sample = '' // an oversized/broken error page is not evidence either way
    }
  } else {
    res.resume()
  }
  if (looksLikeChallenge(res.headers, sample)) return new SafeFetchError('challenge', { url, status })
  if (status === 401) return new SafeFetchError('http_401', { url, status })
  if (status === 403) return new SafeFetchError('http_403', { url, status })
  if (status === 404 || status === 410) return new SafeFetchError('not_found', { url, status })
  if (status === 429) {
    return new SafeFetchError('rate_limited', { url, status, retryAfterSeconds: parseRetryAfter(res.headers['retry-after'], Date.now()) })
  }
  if (status >= 500) return new SafeFetchError('http_server_error', { url, status, retryable: status === 502 || status === 503 || status === 504 })
  return new SafeFetchError('http_error', { url, status })
}

async function runFetch(request: SafeFetchRequest, transport: Transport, limits: SafeFetchLimits, state: FetchState): Promise<SafeFetchResult> {
  let url = checkTargetUrl(request.url, request.allowedHosts, transport.allowHttp)
  const visited = new Set<string>([url.href])
  let redirectCount = 0

  for (;;) {
    const { socket, address } = await openConnection(url, transport, limits, state)
    const res = await sendRequest(url, socket, limits, request.contentPolicy)
    const status = res.statusCode ?? 0

    if (REDIRECT_STATUSES.has(status)) {
      res.resume()
      socket.destroy()
      if (redirectCount >= MAX_REDIRECTS) throw new SafeFetchError('too_many_redirects', { url, status })
      const next = resolveRedirectTarget(url, res.headers.location, request.allowedHosts, transport.allowHttp)
      if (visited.has(next.href)) throw new SafeFetchError('redirect_loop', { url, status })
      visited.add(next.href)
      redirectCount += 1
      url = next
      continue
    }

    if (status < 200 || status > 299 || looksLikeChallenge(res.headers, '')) {
      throw await errorForStatus(res, url, limits)
    }

    const contentType = parseContentType(res.headers['content-type'])
    if (!contentType || !CONTENT_TYPES[request.contentPolicy].includes(contentType.mimeType)) {
      res.destroy()
      throw new SafeFetchError('unsupported_content_type', { url, status, detail: contentType?.mimeType ?? 'missing' })
    }
    const encoding = parseContentEncoding(res.headers['content-encoding'])
    if (!encoding) {
      res.destroy()
      throw new SafeFetchError('unsupported_content_encoding', { url, status, detail: String(res.headers['content-encoding']).slice(0, 40) })
    }
    const declaredLength = Number(res.headers['content-length'])
    if (Number.isFinite(declaredLength) && declaredLength > limits.maxBodyBytes) {
      res.destroy()
      throw new SafeFetchError('response_too_large', { url, status, detail: `content-length ${declaredLength}` })
    }

    const body = await readBody(res, encoding, limits.maxBodyBytes, limits.maxDecodedBytes, url)
    socket.destroy()
    return {
      finalUrl: url.href,
      status,
      mimeType: contentType.mimeType,
      charset: contentType.charset,
      body: decodeText(body, contentType.charset),
      decodedBytes: body.length,
      redirectCount,
      remoteAddress: address,
    }
  }
}

function fetchWithTransport(request: SafeFetchRequest, transport: Transport): Promise<SafeFetchResult> {
  const limits = resolveLimits(request.limits)
  const state: FetchState = { socket: null, expired: false }
  let timer: NodeJS.Timeout | undefined
  const total = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      state.expired = true
      state.socket?.destroy()
      reject(new SafeFetchError('timeout', { url: request.url, detail: 'total' }))
    }, limits.totalTimeoutMs)
  })
  const work = runFetch(request, transport, limits, state)
  work.catch(() => undefined) // settled via race; prevents an unhandled rejection after a total timeout
  return Promise.race([work, total]).finally(() => {
    clearTimeout(timer)
    state.socket?.destroy()
  })
}

/** Production entry point: https only, real DNS, shared IP guard, system CAs. Not configurable per competitor. */
export function safeFetch(request: SafeFetchRequest): Promise<SafeFetchResult> {
  return fetchWithTransport(request, PRODUCTION_TRANSPORT)
}

/**
 * Test-only: inject DNS, address policy, plain-http loopback servers and a test CA.
 * Throws outside Vitest, so no production configuration can reach it.
 */
export function createTestSafeFetch(overrides: Partial<Transport>): (request: SafeFetchRequest) => Promise<SafeFetchResult> {
  if (process.env.VITEST !== 'true') throw new Error('createTestSafeFetch is test-only')
  const transport: Transport = { ...PRODUCTION_TRANSPORT, ...overrides }
  return (request) => fetchWithTransport(request, transport)
}
