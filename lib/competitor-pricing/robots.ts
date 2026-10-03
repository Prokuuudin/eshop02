import { PRICE_MONITOR_ROBOTS_TOKEN, SafeFetchError, safeFetch, type SafeFetchRequest, type SafeFetchResult } from './safe-fetch'

// Minimal RFC 9309 robots.txt support for the price monitor: user-agent groups,
// Allow/Disallow, `*` and `$` wildcards, longest-match precedence (Allow wins ties).
//
// Fail-safe policy (documented in docs/COMPETITOR-PRICING-CONTINUATION.md):
//   200 text/plain           → parse and obey (unparseable lines are ignored, as RFC 9309 requires)
//   404 / 410                → no robots.txt → allowed
//   401 / 403 / challenge    → deny everything + blocking (the site refuses our bot)
//   429                      → deny for this run (not blocking)
//   5xx, timeout, network, TLS, redirect off-allowlist, non-text/plain, oversized
//                            → deny everything for this run ("robots_unavailable");
//                              an unreachable robots.txt never means "allowed".

const MAX_ROBOTS_BYTES = 512 * 1024
const MAX_PATTERN_LENGTH = 2048

export type RobotsRule = { allow: boolean; pattern: string }
export type RobotsGroup = { agents: string[]; rules: RobotsRule[] }

export type RobotsPolicy =
  | { kind: 'rules'; groups: RobotsGroup[] }
  | { kind: 'allow_all'; reason: 'not_found' }
  | { kind: 'deny_all'; error: SafeFetchError }

export function parseRobotsTxt(text: string): RobotsGroup[] {
  const groups: RobotsGroup[] = []
  let current: RobotsGroup | null = null
  let lastWasAgent = false
  for (const rawLine of text.slice(0, MAX_ROBOTS_BYTES).replace(/^﻿/, '').split(/\r\n|\r|\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim()
    const colon = line.indexOf(':')
    if (colon <= 0) continue
    const key = line.slice(0, colon).trim().toLowerCase()
    const value = line.slice(colon + 1).trim()
    if (key === 'user-agent') {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] }
        groups.push(current)
      }
      if (value) current.agents.push(value.toLowerCase())
      lastWasAgent = true
      continue
    }
    if (key === 'allow' || key === 'disallow') {
      lastWasAgent = false
      // Rules before any user-agent line belong to no group; empty values restrict nothing.
      if (!current || !value || value.length > MAX_PATTERN_LENGTH) continue
      current.rules.push({ allow: key === 'allow', pattern: value })
      continue
    }
    // Other fields (sitemap, crawl-delay, …) do not end a user-agent block of consecutive lines.
  }
  return groups
}

function agentMatches(agent: string, token: string): boolean {
  return agent.split(/[\s/]/)[0] === token
}

/** Groups that apply to our token: exact product-token groups if any, otherwise `*` groups. */
export function selectRules(groups: readonly RobotsGroup[], token: string = PRICE_MONITOR_ROBOTS_TOKEN): RobotsRule[] {
  const lowered = token.toLowerCase()
  const specific = groups.filter((group) => group.agents.some((agent) => agentMatches(agent, lowered)))
  const chosen = specific.length > 0 ? specific : groups.filter((group) => group.agents.includes('*'))
  return chosen.flatMap((group) => group.rules)
}

/** Full-string glob match where `*` matches any sequence. O(n·m), no regex backtracking. */
function globMatch(pattern: string, text: string): boolean {
  let p = 0
  let t = 0
  let star = -1
  let mark = 0
  while (t < text.length) {
    if (p < pattern.length && pattern[p] !== '*' && pattern[p] === text[t]) {
      p += 1
      t += 1
    } else if (p < pattern.length && pattern[p] === '*') {
      star = p
      p += 1
      mark = t
    } else if (star !== -1) {
      p = star + 1
      mark += 1
      t = mark
    } else {
      return false
    }
  }
  while (p < pattern.length && pattern[p] === '*') p += 1
  return p === pattern.length
}

export function ruleMatches(pattern: string, path: string): boolean {
  const anchored = pattern.endsWith('$')
  const body = anchored ? pattern.slice(0, -1) : pattern
  return globMatch(anchored ? body : `${body}*`, path)
}

/** Longest matching pattern wins; on equal length Allow wins; no match → allowed. */
export function isPathAllowed(rules: readonly RobotsRule[], pathWithQuery: string): boolean {
  if (pathWithQuery === '/robots.txt') return true
  let best: RobotsRule | null = null
  for (const rule of rules) {
    if (!ruleMatches(rule.pattern, pathWithQuery)) continue
    if (!best || rule.pattern.length > best.pattern.length || (rule.pattern.length === best.pattern.length && rule.allow)) best = rule
  }
  return best === null || best.allow
}

type Fetcher = (request: SafeFetchRequest) => Promise<SafeFetchResult>

export async function loadRobotsPolicy(siteUrl: string, allowedHosts: readonly string[], fetcher: Fetcher = safeFetch): Promise<RobotsPolicy> {
  let robotsUrl: string
  try {
    robotsUrl = new URL('/robots.txt', siteUrl).href
  } catch {
    return { kind: 'deny_all', error: new SafeFetchError('robots_unavailable', { detail: 'invalid site URL' }) }
  }
  try {
    const result = await fetcher({
      url: robotsUrl,
      allowedHosts,
      contentPolicy: 'robots',
      limits: { maxBodyBytes: MAX_ROBOTS_BYTES, maxDecodedBytes: MAX_ROBOTS_BYTES, totalTimeoutMs: 10_000 },
    })
    return { kind: 'rules', groups: parseRobotsTxt(result.body) }
  } catch (error) {
    if (!(error instanceof SafeFetchError)) {
      return { kind: 'deny_all', error: new SafeFetchError('robots_unavailable', { url: robotsUrl, detail: 'unexpected error' }) }
    }
    if (error.code === 'not_found') return { kind: 'allow_all', reason: 'not_found' }
    if (error.code === 'http_401' || error.code === 'http_403' || error.code === 'challenge') return { kind: 'deny_all', error }
    return {
      kind: 'deny_all',
      error: new SafeFetchError('robots_unavailable', { url: robotsUrl, status: error.status, detail: error.code, retryable: error.retryable || error.code === 'rate_limited' }),
    }
  }
}

/** null = allowed; otherwise the error the monitor must record (never fetch the page). */
export function robotsDecision(policy: RobotsPolicy, pageUrl: string, token: string = PRICE_MONITOR_ROBOTS_TOKEN): SafeFetchError | null {
  if (policy.kind === 'allow_all') return null
  if (policy.kind === 'deny_all') return policy.error
  let url: URL
  try {
    url = new URL(pageUrl)
  } catch {
    return new SafeFetchError('invalid_url')
  }
  return isPathAllowed(selectRules(policy.groups, token), `${url.pathname}${url.search}`)
    ? null
    : new SafeFetchError('robots_disallowed', { url })
}

/** One robots.txt fetch per origin per monitor run. */
export class RobotsCache {
  private readonly policies = new Map<string, Promise<RobotsPolicy>>()

  constructor(private readonly fetcher: Fetcher = safeFetch) {}

  policyFor(pageUrl: string, allowedHosts: readonly string[]): Promise<RobotsPolicy> {
    const origin = new URL(pageUrl).origin
    let policy = this.policies.get(origin)
    if (!policy) {
      policy = loadRobotsPolicy(origin, allowedHosts, this.fetcher)
      this.policies.set(origin, policy)
    }
    return policy
  }

  async check(pageUrl: string, allowedHosts: readonly string[]): Promise<SafeFetchError | null> {
    return robotsDecision(await this.policyFor(pageUrl, allowedHosts), pageUrl)
  }
}
