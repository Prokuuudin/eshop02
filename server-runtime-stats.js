const os = require('node:os')
const v8 = require('node:v8')
const { performance } = require('node:perf_hooks')

// In-memory request and process statistics for the self-hosted server (server.js on
// Plesk/iisnode), read by the admin-only GET /api/admin/runtime-stats. Diagnostic only:
// nothing is persisted or logged, client IPs are masked to /24 (IPv4) or /48 (IPv6),
// and every per-minute map is bounded.

const WINDOW_MINUTES = 60
const MAX_KEYS_PER_MINUTE = 200
const SLOW_REQUEST_MS = 2000
const OVERFLOW_KEY = '(other)'

const UA_FAMILIES = [
    ['googlebot', /googlebot|google-inspectiontool|storebot-google|adsbot-google|googleother/i],
    ['bingbot', /bingbot|bingpreview|msnbot/i],
    ['yandex', /yandex/i],
    ['ahrefs', /ahrefs/i],
    ['semrush', /semrush/i],
    ['mj12', /mj12bot/i],
    ['dotbot', /dotbot/i],
    ['petalbot', /petalbot/i],
    ['bytespider', /bytespider/i],
    ['openai', /gptbot|chatgpt|oai-searchbot/i],
    ['anthropic', /claudebot|claude-web|anthropic/i],
    ['perplexity', /perplexity/i],
    ['meta', /facebookexternalhit|meta-externalagent|facebot/i],
    ['applebot', /applebot/i],
    ['amazonbot', /amazonbot/i],
    ['other-bot', /bot\b|bot\/|crawl|spider|slurp|scan|monitor|uptime|headless|lighthouse|pingdom/i],
    ['tool', /^node$|curl|wget|python|go-http|node-fetch|undici|axios|java\/|okhttp|libwww|httpclient|powershell/i],
    ['browser', /mozilla\//i],
]

function uaFamily(userAgent) {
    if (!userAgent) return 'empty'
    for (const [name, pattern] of UA_FAMILIES) if (pattern.test(userAgent)) return name
    return 'other'
}

function maskIp(ip) {
    if (typeof ip !== 'string' || !ip) return 'unknown'
    const value = ip.replace(/^::ffff:/, '')
    if (value.includes(':')) return `${value.split(':').slice(0, 3).join(':')}::/48`
    const parts = value.split('.')
    return parts.length === 4 ? `${parts[0]}.${parts[1]}.${parts[2]}.0/24` : 'unknown'
}

function requestKind(pathname, query, headers) {
    if (pathname.startsWith('/_next/static/')) return 'static'
    if (pathname.startsWith('/_next/image')) return 'image'
    if (headers['next-router-prefetch']) return 'prefetch'
    if (headers.rsc === '1' || /(^|&)_rsc=/.test(query)) return 'rsc'
    if (pathname.startsWith('/api/')) return 'api'
    if (/\.[a-z0-9]{2,5}$/i.test(pathname)) return 'file'
    return 'page'
}

/** Collapses ids so that the top-path list groups routes, and drops the query. */
function normalizePath(pathname) {
    return pathname
        .replace(/^\/_next\/static\/.*/, '/_next/static/*')
        .replace(/\/(product|order|brand|blog|category|invoice|invoices|orders)\/[^/]+/g, '/$1/:id')
        .replace(/^\/api\/media\/[^/]+/, '/api/media/:file')
        .replace(/\/\d{2,}(?=\/|$)/g, '/:n')
        .slice(0, 120)
}

function bump(map, key, by = 1) {
    if (!map.has(key) && map.size >= MAX_KEYS_PER_MINUTE) key = OVERFLOW_KEY
    map.set(key, (map.get(key) || 0) + by)
}

function statusClass(status) {
    return status >= 100 && status < 600 ? `${Math.floor(status / 100)}xx` : 'aborted'
}

function createRuntimeStats(deps = {}) {
    const now = deps.now || Date.now
    const cpuUsage = deps.cpuUsage || ((previous) => process.cpuUsage(previous))
    const memoryUsage = deps.memoryUsage || (() => process.memoryUsage())
    const eventLoopUtilization = deps.eventLoopUtilization || ((a, b) => performance.eventLoopUtilization(a, b))

    const startedAt = now()
    const buckets = new Map()
    let inflight = 0
    let totalRequests = 0
    let lastCpu = cpuUsage()
    let lastElu = eventLoopUtilization()
    let lastSampleAt = startedAt

    function bucketFor(timestamp) {
        const minute = Math.floor(timestamp / 60000)
        let bucket = buckets.get(minute)
        if (!bucket) {
            bucket = {
                minute, requests: 0, durationMs: 0, slow: 0, maxInflight: 0,
                kinds: new Map(), statuses: new Map(), families: new Map(),
                paths: new Map(), ips: new Map(), userAgents: new Map(), sample: null,
            }
            buckets.set(minute, bucket)
            const oldest = minute - WINDOW_MINUTES
            for (const key of buckets.keys()) if (key <= oldest) buckets.delete(key)
        }
        return bucket
    }

    /** Called by the timer once a minute; also safe to call at any time. */
    function sample() {
        const at = now()
        const cpu = cpuUsage(lastCpu)
        const elu = eventLoopUtilization(lastElu)
        const elapsed = Math.max(1, at - lastSampleAt)
        const memory = memoryUsage()
        bucketFor(at).sample = {
            cpuPercentOfOneCore: Math.round(((cpu.user + cpu.system) / 1000 / elapsed) * 1000) / 10,
            eventLoopUtilizationPercent: Math.round(elu.utilization * 1000) / 10,
            rssMb: Math.round(memory.rss / 1048576),
            heapUsedMb: Math.round(memory.heapUsed / 1048576),
        }
        lastCpu = cpuUsage()
        lastElu = eventLoopUtilization()
        lastSampleAt = at
    }

    /** Records the start of a request; returns a function to call once it ends. */
    function begin(request) {
        const startedRequestAt = now()
        const rawUrl = typeof request.url === 'string' ? request.url : '/'
        const queryStart = rawUrl.indexOf('?')
        const pathname = queryStart === -1 ? rawUrl : rawUrl.slice(0, queryStart)
        const query = queryStart === -1 ? '' : rawUrl.slice(queryStart + 1)
        const headers = request.headers || {}
        const userAgent = typeof headers['user-agent'] === 'string' ? headers['user-agent'] : ''
        const ip = typeof headers['x-forwarded-for'] === 'string' ? headers['x-forwarded-for'] : request.socket && request.socket.remoteAddress

        const bucket = bucketFor(startedRequestAt)
        bucket.requests += 1
        totalRequests += 1
        inflight += 1
        bucket.maxInflight = Math.max(bucket.maxInflight, inflight)
        bump(bucket.kinds, requestKind(pathname, query, headers))
        bump(bucket.families, uaFamily(userAgent))
        bump(bucket.paths, normalizePath(pathname))
        bump(bucket.ips, maskIp(ip))
        bump(bucket.userAgents, userAgent.slice(0, 120) || '(empty)')

        let ended = false
        return function end(status) {
            if (ended) return
            ended = true
            inflight = Math.max(0, inflight - 1)
            const duration = now() - startedRequestAt
            const endBucket = bucketFor(startedRequestAt)
            endBucket.durationMs += duration
            if (duration >= SLOW_REQUEST_MS) endBucket.slow += 1
            bump(endBucket.statuses, statusClass(status))
        }
    }

    function top(list, key, limit) {
        const totals = new Map()
        for (const bucket of list) for (const [name, count] of bucket[key]) totals.set(name, (totals.get(name) || 0) + count)
        return [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([name, count]) => ({ name, count }))
    }

    function snapshot(options = {}) {
        const minutes = Math.min(WINDOW_MINUTES, Math.max(1, Math.floor(Number(options.minutes) || WINDOW_MINUTES)))
        const limit = Math.min(50, Math.max(1, Math.floor(Number(options.top) || 15)))
        const at = now()
        const fromMinute = Math.floor(at / 60000) - minutes + 1
        const list = [...buckets.values()].filter((bucket) => bucket.minute >= fromMinute).sort((a, b) => a.minute - b.minute)
        const requests = list.reduce((sum, bucket) => sum + bucket.requests, 0)
        const memory = memoryUsage()
        const heap = v8.getHeapStatistics()
        const sinceStart = process.cpuUsage()
        const uptimeMs = Math.max(1, at - startedAt)
        return {
            available: true,
            generatedAt: new Date(at).toISOString(),
            process: {
                pid: process.pid,
                node: process.version,
                startedAt: new Date(startedAt).toISOString(),
                uptimeMinutes: Math.round(uptimeMs / 6000) / 10,
                cpuCores: os.cpus().length,
                cpuPercentOfOneCoreSinceStart: Math.round(((sinceStart.user + sinceStart.system) / 1000 / uptimeMs) * 1000) / 10,
                rssMb: Math.round(memory.rss / 1048576),
                heapUsedMb: Math.round(memory.heapUsed / 1048576),
                heapTotalMb: Math.round(memory.heapTotal / 1048576),
                externalMb: Math.round(memory.external / 1048576),
                heapLimitMb: Math.round(heap.heap_size_limit / 1048576),
                inflightNow: inflight,
                requestsSinceStart: totalRequests,
            },
            window: {
                minutes,
                requests,
                requestsPerMinute: Math.round((requests / minutes) * 10) / 10,
                kinds: top(list, 'kinds', 20),
                statuses: top(list, 'statuses', 10),
                clientFamilies: top(list, 'families', 25),
                topPaths: top(list, 'paths', limit),
                topClientNetworks: top(list, 'ips', limit),
                topUserAgents: top(list, 'userAgents', limit),
            },
            perMinute: list.map((bucket) => ({
                minute: new Date(bucket.minute * 60000).toISOString().slice(11, 16),
                requests: bucket.requests,
                avgMs: bucket.requests ? Math.round(bucket.durationMs / bucket.requests) : 0,
                slow: bucket.slow,
                maxInflight: bucket.maxInflight,
                kinds: Object.fromEntries(bucket.kinds),
                families: Object.fromEntries([...bucket.families].sort((a, b) => b[1] - a[1]).slice(0, 5)),
                ...(bucket.sample || {}),
            })),
        }
    }

    return { begin, sample, snapshot }
}

/**
 * Wraps a node:http request handler. Statistics failures never affect the request.
 * Starts the once-a-minute process sample (unref'd: it never keeps the process alive).
 */
function installRuntimeStats(target = globalThis) {
    const stats = createRuntimeStats()
    target.__eshopRuntimeStats = stats
    const timer = setInterval(() => {
        try { stats.sample() } catch { /* diagnostics must never throw into the server */ }
    }, 60000)
    if (typeof timer.unref === 'function') timer.unref()
    return function track(request, response) {
        try {
            const end = stats.begin(request)
            response.once('finish', () => end(response.statusCode))
            response.once('close', () => end(response.writableFinished ? response.statusCode : 0))
        } catch { /* ignore */ }
    }
}

module.exports = { createRuntimeStats, installRuntimeStats, uaFamily, maskIp, requestKind, normalizePath }
