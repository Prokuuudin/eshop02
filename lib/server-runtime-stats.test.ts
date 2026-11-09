import { createRequire } from 'node:module'
import { EventEmitter } from 'node:events'
import { describe, expect, it } from 'vitest'

type Snapshot = {
  process: { inflightNow: number; requestsSinceStart: number }
  window: {
    requests: number
    kinds: Array<{ name: string; count: number }>
    statuses: Array<{ name: string; count: number }>
    clientFamilies: Array<{ name: string; count: number }>
    topPaths: Array<{ name: string; count: number }>
    topClientNetworks: Array<{ name: string; count: number }>
  }
  perMinute: Array<{ minute: string; requests: number; slow: number; maxInflight: number; cpuPercentOfOneCore?: number }>
}
type Stats = {
  begin: (req: { url: string; headers: Record<string, string>; socket?: { remoteAddress?: string } }) => (status: number) => void
  sample: () => void
  snapshot: (o?: { minutes?: number; top?: number }) => Snapshot
}
const mod = createRequire(import.meta.url)('../server-runtime-stats.js') as {
  createRuntimeStats: (deps: Record<string, unknown>) => Stats
  installRuntimeStats: (target: Record<string, unknown>) => (req: unknown, res: EventEmitter & { statusCode: number; writableFinished?: boolean }) => void
  uaFamily: (ua: string) => string
  maskIp: (ip: string | undefined) => string
  requestKind: (p: string, q: string, h: Record<string, string>) => string
  normalizePath: (p: string) => string
}

const fixedClock = () => {
  let t = Date.UTC(2026, 10, 9, 12, 0, 0)
  return { now: () => t, advance: (ms: number) => { t += ms } }
}
const deps = (clock: { now: () => number }) => ({
  now: clock.now,
  cpuUsage: (prev?: { user: number; system: number }) => (prev ? { user: 30_000_000, system: 0 } : { user: 0, system: 0 }),
  memoryUsage: () => ({ rss: 300 * 1048576, heapUsed: 120 * 1048576, heapTotal: 200 * 1048576, external: 1048576, arrayBuffers: 0 }),
  eventLoopUtilization: (prev?: unknown) => ({ utilization: prev ? 0.25 : 0, idle: 0, active: 0 }),
})

describe('server runtime stats', () => {
  it('classifies clients, request kinds and paths', () => {
    expect(mod.uaFamily('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)')).toBe('googlebot')
    expect(mod.uaFamily('Mozilla/5.0 (compatible; AhrefsBot/7.0)')).toBe('ahrefs')
    expect(mod.uaFamily('Mozilla/5.0 (compatible; SomeNewBot/1.0)')).toBe('other-bot')
    expect(mod.uaFamily('Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/141 Safari/537.36')).toBe('browser')
    expect(mod.uaFamily('curl/8.4.0')).toBe('tool')
    expect(mod.uaFamily('node')).toBe('tool')
    expect(mod.uaFamily('')).toBe('empty')
    expect(mod.requestKind('/lv/catalog', '_rsc=abc', {})).toBe('rsc')
    expect(mod.requestKind('/lv', '', { 'next-router-prefetch': '1', rsc: '1' })).toBe('prefetch')
    expect(mod.requestKind('/_next/image', 'url=x', {})).toBe('image')
    expect(mod.requestKind('/_next/static/chunks/a.js', '', {})).toBe('static')
    expect(mod.requestKind('/api/health', '', {})).toBe('api')
    expect(mod.requestKind('/favicon.ico', '', {})).toBe('file')
    expect(mod.requestKind('/lv/product/1', '', {})).toBe('page')
    expect(mod.normalizePath('/lv/product/20564')).toBe('/lv/product/:id')
    expect(mod.normalizePath('/_next/static/chunks/app/x.js')).toBe('/_next/static/*')
    expect(mod.normalizePath('/api/media/123-a.jpg')).toBe('/api/media/:file')
  })

  it('masks client addresses', () => {
    expect(mod.maskIp('85.254.12.34')).toBe('85.254.12.0/24')
    expect(mod.maskIp('::ffff:85.254.12.34')).toBe('85.254.12.0/24')
    expect(mod.maskIp('2a02:1234:5678:9abc::1')).toBe('2a02:1234:5678::/48')
    expect(mod.maskIp(undefined)).toBe('unknown')
  })

  it('counts requests per minute with status, inflight and process samples', () => {
    const clock = fixedClock()
    const stats = mod.createRuntimeStats(deps(clock))
    const endA = stats.begin({ url: '/lv/catalog?_rsc=1', headers: { 'user-agent': 'Googlebot/2.1', 'x-forwarded-for': '85.254.12.34' } })
    const endB = stats.begin({ url: '/lv/product/5', headers: { 'user-agent': 'Mozilla/5.0 Chrome' } })
    clock.advance(2500)
    endA(200)
    endA(200) // ends are idempotent
    endB(307)
    stats.sample()
    const snap = stats.snapshot({ minutes: 5 })
    expect(snap.window.requests).toBe(2)
    expect(snap.process.inflightNow).toBe(0)
    expect(snap.process.requestsSinceStart).toBe(2)
    expect(snap.window.statuses).toEqual(expect.arrayContaining([{ name: '2xx', count: 1 }, { name: '3xx', count: 1 }]))
    expect(snap.window.kinds).toEqual(expect.arrayContaining([{ name: 'rsc', count: 1 }, { name: 'page', count: 1 }]))
    expect(snap.window.topClientNetworks).toContainEqual({ name: '85.254.12.0/24', count: 1 })
    expect(snap.window.topPaths).toContainEqual({ name: '/lv/product/:id', count: 1 })
    expect(snap.perMinute[0]).toMatchObject({ requests: 2, slow: 2, maxInflight: 2 })
    expect(snap.perMinute[0].cpuPercentOfOneCore).toBeGreaterThan(0)
  })

  it('keeps only the last hour and bounds per-minute keys', () => {
    const clock = fixedClock()
    const stats = mod.createRuntimeStats(deps(clock))
    for (let i = 0; i < 500; i++) stats.begin({ url: `/x/path-${i}`, headers: {} })(200)
    expect(stats.snapshot({ top: 50 }).window.topPaths.find((p) => p.name === '(other)')?.count).toBe(300)
    clock.advance(61 * 60_000)
    stats.begin({ url: '/lv', headers: {} })(200)
    const snap = stats.snapshot()
    expect(snap.window.requests).toBe(1)
    expect(snap.perMinute).toHaveLength(1)
  })

  it('install wraps responses and publishes the collector on the target', () => {
    const target: Record<string, unknown> = {}
    const track = mod.installRuntimeStats(target)
    const res = Object.assign(new EventEmitter(), { statusCode: 404, writableFinished: true })
    track({ url: '/lv/nope', headers: {} }, res)
    res.emit('finish')
    res.emit('close')
    const snap = (target.__eshopRuntimeStats as Stats).snapshot()
    expect(snap.window.requests).toBe(1)
    expect(snap.window.statuses).toEqual([{ name: '4xx', count: 1 }])
    expect(snap.process.inflightNow).toBe(0)
  })
})
