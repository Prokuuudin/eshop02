import net from 'node:net'
import { z } from 'zod'
import { COMPETITOR_ADAPTER_KEYS, type CompetitorStatus } from './constants'

// Domain validation for Competitor sources and their product URLs. This is the
// *logical* boundary (which host belongs to which competitor). Network-level SSRF
// protection (DNS/IP checks, redirects, size limits) is a separate layer (stage 3)
// and must run on every fetch regardless of what passed here.

const MAX_ALLOWED_HOSTS = 5
const MAX_URL_LENGTH = 2048
const BLOCKED_HOST_SUFFIXES = ['.localhost', '.local', '.internal', '.lan', '.home', '.corp', '.intranet', '.arpa']
const TRACKING_PARAMS = new Set(['gclid', 'fbclid', 'yclid', 'msclkid', 'mc_cid', 'mc_eid', '_ga'])

export class CompetitorConfigError extends Error {
  constructor(readonly code: string, message: string) {
    super(message)
    this.name = 'CompetitorConfigError'
  }
}

/** Lowercased public DNS hostname, or null when it is an IP literal, local name or malformed. */
export function normalizePublicHostname(raw: string): string | null {
  const host = raw.trim().toLowerCase().replace(/\.$/, '')
  if (!host || host.length > 253) return null
  if (host.startsWith('[') || net.isIP(host) !== 0) return null
  // Numeric-only labels (e.g. "2130706433", "0x7f.1") can be read as IPv4 by resolvers.
  if (/^[0-9.]+$/.test(host) || /^0x/i.test(host)) return null
  if (host === 'localhost' || BLOCKED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))) return null
  const labels = host.split('.')
  if (labels.length < 2) return null
  const validLabel = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/
  if (!labels.every((label) => validLabel.test(label))) return null
  if (/^[0-9]+$/.test(labels[labels.length - 1])) return null
  return host
}

function parseHttpsUrl(raw: string, code: string): URL {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_URL_LENGTH) {
    throw new CompetitorConfigError(code, 'URL is empty or too long')
  }
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    throw new CompetitorConfigError(code, 'URL is not valid')
  }
  // https only: the network layer (safe-fetch) never fetches plain http in production.
  if (url.protocol !== 'https:') throw new CompetitorConfigError(code, 'Only https URLs are allowed')
  if (url.username || url.password) throw new CompetitorConfigError(code, 'URLs with credentials are not allowed')
  // URL() already drops default ports, so any remaining port is non-standard.
  if (url.port) throw new CompetitorConfigError(code, 'Non-standard ports are not allowed')
  return url
}

/** Hosts are related when equal or one is a subdomain of the other (shop.lv ↔ www.shop.lv). */
function relatedHosts(a: string, b: string): boolean {
  return a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`)
}

export type NormalizedCompetitorSource = { baseUrl: string; hostname: string; allowedHosts: string[] }

export function normalizeCompetitorSource(baseUrlRaw: string, extraHosts: readonly string[] = []): NormalizedCompetitorSource {
  const url = parseHttpsUrl(baseUrlRaw, 'invalid_base_url')
  const hostname = normalizePublicHostname(url.hostname)
  if (!hostname) throw new CompetitorConfigError('invalid_base_url', 'Base URL must use a public DNS hostname')
  const allowedHosts = [hostname]
  for (const raw of extraHosts) {
    const host = normalizePublicHostname(raw)
    if (!host) throw new CompetitorConfigError('invalid_allowed_host', `Allowed host is not a public hostname: ${String(raw).slice(0, 64)}`)
    if (!relatedHosts(host, hostname)) throw new CompetitorConfigError('unrelated_allowed_host', `Allowed host ${host} is unrelated to ${hostname}`)
    if (!allowedHosts.includes(host)) allowedHosts.push(host)
  }
  if (allowedHosts.length > MAX_ALLOWED_HOSTS) throw new CompetitorConfigError('too_many_allowed_hosts', `At most ${MAX_ALLOWED_HOSTS} hosts`)
  return { baseUrl: `${url.protocol}//${hostname}${url.pathname === '/' ? '' : url.pathname.replace(/\/$/, '')}`, hostname, allowedHosts }
}

/**
 * Canonical product URL for a competitor: host must be one of its allowedHosts
 * (exact match), fragment and known tracking parameters are removed.
 */
export function canonicalizeCompetitorProductUrl(raw: string, allowedHosts: readonly string[]): string {
  const url = parseHttpsUrl(raw, 'invalid_product_url')
  const host = normalizePublicHostname(url.hostname)
  if (!host || !allowedHosts.includes(host)) {
    throw new CompetitorConfigError('foreign_host', 'URL host does not belong to this competitor')
  }
  url.hostname = host
  url.hash = ''
  for (const key of [...url.searchParams.keys()]) {
    if (key.toLowerCase().startsWith('utm_') || TRACKING_PARAMS.has(key.toLowerCase())) url.searchParams.delete(key)
  }
  const canonical = url.toString()
  if (canonical.length > MAX_URL_LENGTH) throw new CompetitorConfigError('invalid_product_url', 'URL is too long')
  return canonical
}

export const competitorInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  baseUrl: z.string().trim().min(1).max(MAX_URL_LENGTH),
  extraAllowedHosts: z.array(z.string().trim().min(1).max(253)).max(MAX_ALLOWED_HOSTS - 1).default([]),
  adapterKey: z.enum(COMPETITOR_ADAPTER_KEYS),
  enabled: z.boolean().default(false),
  // Monitoring politeness limits. Upper/lower bounds are hard safety limits, not defaults.
  pollIntervalMinutes: z.number().int().min(60).max(7 * 24 * 60).default(1440),
  requestDelayMs: z.number().int().min(1000).max(60_000).default(5000),
  maxConcurrency: z.number().int().min(1).max(2).default(1),
  timeoutMs: z.number().int().min(2000).max(30_000).default(15_000),
  maxResponseBytes: z.number().int().min(100_000).max(5_000_000).default(2_000_000),
  maxProductsPerRun: z.number().int().min(1).max(1000).default(200),
  accessBasisNote: z.string().trim().min(10).max(2000),
}).strict()

export type CompetitorInput = z.infer<typeof competitorInputSchema>

export type ValidatedCompetitor = Omit<CompetitorInput, 'baseUrl' | 'extraAllowedHosts'> & NormalizedCompetitorSource

export type CompetitorValidationResult =
  | { ok: true; value: ValidatedCompetitor }
  | { ok: false; issues: string[] }

export function validateCompetitorInput(input: unknown): CompetitorValidationResult {
  const parsed = competitorInputSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, issues: parsed.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`) }
  }
  try {
    const { baseUrl, extraAllowedHosts, ...rest } = parsed.data
    return { ok: true, value: { ...rest, ...normalizeCompetitorSource(baseUrl, extraAllowedHosts) } }
  } catch (error) {
    if (error instanceof CompetitorConfigError) return { ok: false, issues: [`${error.code}: ${error.message}`] }
    throw error
  }
}

/** The scheduler may only fetch sources that are enabled and not paused/blocked. */
export function isCompetitorFetchable(competitor: { enabled: boolean; status: string }): boolean {
  return competitor.enabled && competitor.status === ('active' satisfies CompetitorStatus)
}
