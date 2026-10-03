import { describe, expect, it, vi } from 'vitest'
import { RobotsCache, isPathAllowed, loadRobotsPolicy, parseRobotsTxt, robotsDecision, ruleMatches, selectRules } from './robots'
import { SafeFetchError, type SafeFetchResult } from './safe-fetch'

const HOSTS = ['shop.example']
const TOKEN = 'HairshopProPriceMonitor'

const allowed = (robots: string, path: string) => isPathAllowed(selectRules(parseRobotsTxt(robots), TOKEN), path)

const okResult = (body: string): SafeFetchResult => ({
  finalUrl: 'https://shop.example/robots.txt', status: 200, mimeType: 'text/plain', charset: null, body,
  decodedBytes: body.length, redirectCount: 0, remoteAddress: '93.184.216.34',
})

describe('parseRobotsTxt / rule selection', () => {
  it('allows when there is no matching rule', () => {
    expect(allowed('User-agent: *\nDisallow: /cart', '/product/1')).toBe(true)
    expect(allowed('', '/anything')).toBe(true)
  })

  it('disallows a matching prefix', () => {
    expect(allowed('User-agent: *\nDisallow: /product', '/product/1')).toBe(false)
    expect(allowed('User-agent: *\nDisallow: /', '/product/1')).toBe(false)
  })

  it('empty Disallow restricts nothing', () => {
    expect(allowed('User-agent: *\nDisallow:', '/product/1')).toBe(true)
  })

  it('longest match wins and Allow wins ties', () => {
    const robots = 'User-agent: *\nDisallow: /p\nAllow: /p/public\nDisallow: /p/public/secret'
    expect(allowed(robots, '/p/other')).toBe(false)
    expect(allowed(robots, '/p/public/1')).toBe(true)
    expect(allowed(robots, '/p/public/secret/1')).toBe(false)
    expect(allowed('User-agent: *\nDisallow: /a\nAllow: /a', '/a/b')).toBe(true)
  })

  it('a group for our token overrides * (case-insensitive, version suffix ignored)', () => {
    const robots = 'User-agent: *\nDisallow: /\n\nUser-agent: hairshoppropricemonitor/1.0\nAllow: /'
    expect(allowed(robots, '/product/1')).toBe(true)
    const blockUs = 'User-agent: *\nAllow: /\n\nUser-agent: HairshopProPriceMonitor\nDisallow: /'
    expect(allowed(blockUs, '/product/1')).toBe(false)
  })

  it('other bots\' groups do not apply to us', () => {
    expect(allowed('User-agent: Googlebot\nDisallow: /', '/product/1')).toBe(true)
    expect(allowed('User-agent: HairshopProPriceMonitorX\nDisallow: /', '/product/1')).toBe(true)
  })

  it('consecutive user-agent lines share one group', () => {
    expect(allowed('User-agent: Googlebot\nUser-agent: HairshopProPriceMonitor\nDisallow: /private', '/private/x')).toBe(false)
  })

  it('supports * and $ wildcards', () => {
    expect(ruleMatches('/*.pdf$', '/files/a.pdf')).toBe(true)
    expect(ruleMatches('/*.pdf$', '/files/a.pdf?x=1')).toBe(false)
    expect(ruleMatches('/*?sort=', '/catalog?sort=price')).toBe(true)
    expect(ruleMatches('/shop/*/reviews', '/shop/123/reviews/page/2')).toBe(true)
    expect(allowed('User-agent: *\nDisallow: /*?add-to-cart=', '/p/1?add-to-cart=5')).toBe(false)
  })

  it('wildcard matching stays fast on adversarial patterns', () => {
    const started = Date.now()
    expect(ruleMatches(`/${'*a'.repeat(200)}b`, `/${'a'.repeat(2000)}`)).toBe(false)
    expect(Date.now() - started).toBeLessThan(1000)
  })

  it('ignores comments, BOM, CRLF, unknown fields and rules outside groups', () => {
    const robots = '﻿Disallow: /orphan\r\n# comment\r\nUser-agent: * # all\r\nCrawl-delay: 10\r\nSitemap: https://shop.example/s.xml\r\nDISALLOW: /private # inline\r\n'
    expect(allowed(robots, '/orphan/x')).toBe(true)
    expect(allowed(robots, '/private/x')).toBe(false)
  })

  it('malformed content yields no rules (RFC 9309: unparseable lines are ignored)', () => {
    expect(parseRobotsTxt('<html><body>Not a robots file</body></html>\n\0\0garbage')).toEqual([])
  })

  it('robots.txt itself is always allowed', () => {
    expect(allowed('User-agent: *\nDisallow: /', '/robots.txt')).toBe(true)
  })
})

describe('loadRobotsPolicy fail-safe policy', () => {
  const policyFor = (impl: () => Promise<SafeFetchResult>) => loadRobotsPolicy('https://shop.example/p/1', HOSTS, vi.fn(impl))

  it('obeys a fetched robots.txt', async () => {
    const policy = await policyFor(async () => okResult('User-agent: *\nDisallow: /p/'))
    expect(robotsDecision(policy, 'https://shop.example/p/1')?.code).toBe('robots_disallowed')
    expect(robotsDecision(policy, 'https://shop.example/c/1')).toBeNull()
  })

  it('robots_disallowed is a blocking classification', async () => {
    const policy = await policyFor(async () => okResult('User-agent: *\nDisallow: /'))
    expect(robotsDecision(policy, 'https://shop.example/p/1')?.blocking).toBe(true)
  })

  it.each(['not_found'] as const)('%s → allowed (no robots.txt)', async (code) => {
    const policy = await policyFor(async () => { throw new SafeFetchError(code, { status: 404 }) })
    expect(policy).toEqual({ kind: 'allow_all', reason: 'not_found' })
    expect(robotsDecision(policy, 'https://shop.example/p/1')).toBeNull()
  })

  it.each(['http_401', 'http_403', 'challenge'] as const)('%s → deny everything and mark blocking', async (code) => {
    const policy = await policyFor(async () => { throw new SafeFetchError(code) })
    const decision = robotsDecision(policy, 'https://shop.example/p/1')
    expect(decision?.code).toBe(code)
    expect(decision?.blocking).toBe(true)
  })

  it.each([
    ['timeout', true],
    ['network_error', true],
    ['rate_limited', true],
    ['http_server_error', false],
    ['tls_error', false],
    ['unsupported_content_type', false],
    ['response_too_large', false],
    ['redirect_rejected', false],
    ['unsafe_address', false],
  ] as const)('%s → deny for this run (robots_unavailable, never "allowed")', async (code, retryable) => {
    const policy = await policyFor(async () => { throw new SafeFetchError(code) })
    const decision = robotsDecision(policy, 'https://shop.example/p/1')
    expect(decision?.code).toBe('robots_unavailable')
    expect(decision?.detail).toBe(code)
    expect(decision?.retryable).toBe(retryable)
    expect(decision?.blocking).toBe(false)
  })

  it('fetches /robots.txt of the page origin with the robots content policy and tight limits', async () => {
    const fetcher = vi.fn(async () => okResult(''))
    await loadRobotsPolicy('https://shop.example/deep/p/1?x=1', HOSTS, fetcher)
    expect(fetcher).toHaveBeenCalledWith(expect.objectContaining({
      url: 'https://shop.example/robots.txt', allowedHosts: HOSTS, contentPolicy: 'robots',
      limits: expect.objectContaining({ maxDecodedBytes: 512 * 1024 }),
    }))
  })
})

describe('RobotsCache', () => {
  it('fetches robots.txt once per origin per run', async () => {
    const fetcher = vi.fn(async () => okResult('User-agent: *\nDisallow: /private'))
    const cache = new RobotsCache(fetcher)
    expect(await cache.check('https://shop.example/p/1', HOSTS)).toBeNull()
    expect((await cache.check('https://shop.example/private/2', HOSTS))?.code).toBe('robots_disallowed')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
})
