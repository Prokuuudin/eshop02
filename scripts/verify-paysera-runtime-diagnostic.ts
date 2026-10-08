// Run ONLY in staging-httpdocs with the existing tsx loader. No application HTTP mutations.
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseEnv } from 'node:util'
const SITE = 'https://staging.hairshoppro.lv'
const HOST = 'ep-plain-pine-aqlhpigq.c-8.us-east-1.aws.neon.tech'
const SHA = '0cbb7df0475d4518beb6f3c65fab589a998a8992'
const BRANCH = 'delivery-staging-2026-10-06'
export class SafeFailure extends Error { constructor(public code: string) { super() } }
function check(ok: unknown, code: string): asserts ok { if (!ok) throw new SafeFailure(code) }
export async function stage<T>(code: string, operation: () => T | Promise<T>): Promise<T> {
  try { return await operation() }
  catch (error) { throw error instanceof SafeFailure ? error : new SafeFailure(code) }
}
export async function verifyReadOnly(tx: any, expectedDatabase: string) {
  // current_database() is PostgreSQL name/OID19, unsupported by adapter-neon raw mapping.
  // Cast both fields to supported text and require Prisma Client's object-array result.
  const rows = await stage('RUNTIME_READ_ONLY_QUERY_FAILED', () => tx.$queryRawUnsafe(
    "SELECT current_database()::text AS db, current_setting('transaction_read_only')::text AS ro"))
  check(Array.isArray(rows) && rows.length === 1 && rows[0] && typeof rows[0] === 'object'
    && !Array.isArray(rows[0]) && typeof rows[0].db === 'string' && typeof rows[0].ro === 'string'
    && rows[0].ro === 'on' && rows[0].db === expectedDatabase, 'RUNTIME_READ_ONLY_RESULT_INVALID')
}
export function safeCode(error: unknown): string {
  return error instanceof SafeFailure && /^[A-Z][A-Z0-9_]+$/.test(error.code) ? error.code : 'RUNTIME_OTHER_FAILED'
}
// Inspect only allowlisted codes/names. Never retain messages, URLs, headers or stacks.
export function healthFailureCode(error: unknown): string {
  const codes = new Set<string>(), seen = new Set<unknown>()
  const visit = (value: any, depth: number) => {
    if (!value || typeof value !== 'object' || depth > 4 || seen.has(value)) return
    seen.add(value)
    if (typeof value.code === 'string') codes.add(value.code)
    if (value.name === 'TimeoutError') codes.add('HEALTH_DEADLINE')
    if (value.name === 'AbortError') codes.add('HEALTH_ABORT')
    visit(value.cause, depth + 1)
    if (Array.isArray(value.errors)) value.errors.slice(0, 8).forEach((e: unknown) => visit(e, depth + 1))
  }
  try { visit(error, 0) } catch { return 'RUNTIME_HEALTH_FETCH_UNKNOWN' }
  if (codes.has('HEALTH_DEADLINE')) return 'RUNTIME_HEALTH_TIMEOUT'
  const groups: [string, string[]][] = [
    ['DNS', ['ENOTFOUND', 'EAI_AGAIN', 'EAI_FAIL', 'EAI_NODATA']],
    ['TLS', ['CERT_HAS_EXPIRED', 'CERT_NOT_YET_VALID', 'DEPTH_ZERO_SELF_SIGNED_CERT',
      'SELF_SIGNED_CERT_IN_CHAIN', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
      'ERR_TLS_CERT_ALTNAME_INVALID', 'ERR_TLS_CERT_SIGNATURE_ALGORITHM_UNSUPPORTED',
      'ERR_SSL_WRONG_VERSION_NUMBER', 'ERR_SSL_SSLV3_ALERT_HANDSHAKE_FAILURE']],
    ['CONNECTION_REFUSED', ['ECONNREFUSED']],
    ['TIMEOUT', ['ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT']],
    ['NETWORK_UNREACHABLE', ['ENETUNREACH', 'EHOSTUNREACH']],
    ['CONNECTION_RESET', ['ECONNRESET', 'EPIPE', 'UND_ERR_SOCKET']],
    ['ABORTED', ['HEALTH_ABORT', 'ABORT_ERR', 'UND_ERR_ABORTED']],
  ]
  const matches = groups.filter(([, values]) => values.some(code => codes.has(code)))
  return matches.length === 1 ? `RUNTIME_HEALTH_${matches[0][0]}`
    : matches.length > 1 ? 'RUNTIME_HEALTH_NETWORK_MIXED' : 'RUNTIME_HEALTH_FETCH_UNKNOWN'
}
export async function verifyHealth(fetcher: typeof fetch = fetch) {
  const target = `${SITE}/api/health`
  let response: Response
  try {
    // manual exposes redirect status but NEVER follows Location, including production.
    response = await fetcher(target, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(20000) })
  } catch (error) { throw new SafeFailure(healthFailureCode(error)) }
  check(response.status < 300 || response.status >= 400, 'RUNTIME_HEALTH_REDIRECT_BLOCKED')
  check(response.status === 200, 'RUNTIME_HEALTH_HTTP_NON_200')
  check(response.url === target && response.redirected === false, 'RUNTIME_HEALTH_RESPONSE_IDENTITY_FAILED')
  let health: any
  try { health = await response.json() }
  catch (error) {
    const code = healthFailureCode(error)
    throw new SafeFailure(code === 'RUNTIME_HEALTH_FETCH_UNKNOWN' ? 'RUNTIME_HEALTH_PARSE_FAILED' : code)
  }
  check(health && health.status === 'ok' && health.db === 'ok', 'STAGING_HEALTH_FAILED')
}
export async function readOnlyTransaction(prisma: any, operation: (tx: any) => Promise<any>) {
  let entered = false, completed = false
  try {
    return await prisma.$transaction(async (tx: any) => {
      entered = true
      await stage('RUNTIME_SET_READ_ONLY_FAILED', () => tx.$executeRawUnsafe('SET TRANSACTION READ ONLY'))
      const result = await operation(tx)
      completed = true
      return result
    }, { timeout: 30000 })
  } catch (error) {
    if (error instanceof SafeFailure) throw error
    throw new SafeFailure(!entered ? 'RUNTIME_TRANSACTION_START_FAILED'
      : completed ? 'RUNTIME_TRANSACTION_FINALIZE_FAILED' : 'RUNTIME_QUERY_FAILED')
  }
}
export async function disconnectAfter<T>(prisma: any, operation: () => Promise<T>) {
  let failed = false
  try { return await operation() }
  catch (error) { failed = true; throw error }
  finally {
    try { await stage('RUNTIME_DISCONNECT_FAILED', () => prisma.$disconnect()) }
    catch (error) { if (!failed) throw error }
  }
}
export async function main() {
  const [mode, configPath, statePath] = process.argv.slice(2)
  check(['gate', 'inspect'].includes(mode) && configPath, 'MODE_OR_CONFIG_REQUIRED')
  const configText = await stage('RUNTIME_CONFIG_READ_FAILED', () => readFile(resolve(configPath), 'utf8'))
  const c = await stage('RUNTIME_CONFIG_PARSE_FAILED', () => JSON.parse(configText))
  check(c && c.STAGING_SITE_URL === SITE && c.STAGING_RELEASE_SHA === SHA && c.STAGING_NEON_BRANCH_NAME === BRANCH
    && c.STAGING_EXPECTED_NEON_HOST === HOST && c.STAGING_HOST_ALLOWLIST_CONFIRMED === true
    && c.STAGING_ENV_SOURCE === 'owner-confirmed-plesk-staging' && c.STAGING_PAYSERA_TEST_MODE_CONFIRMED === true,
  'STAGING_IDENTITY_NOT_PROVEN')
  const root = resolve('C:/Inetpub/vhosts/hairshoppro.lv/staging-httpdocs')
  check(typeof c.STAGING_ENV_FILE === 'string' && resolve(c.STAGING_ENV_FILE).toLowerCase() === resolve(root, '.env.local').toLowerCase()
    && process.cwd().toLowerCase() === root.toLowerCase(), 'STAGING_PATH_REQUIRED')
  const envText = await stage('RUNTIME_ENV_READ_FAILED', () => readFile(c.STAGING_ENV_FILE, 'utf8'))
  const env = await stage('RUNTIME_ENV_PARSE_FAILED', () => parseEnv(envText))
  const databaseUrl = env.DATABASE_URL
  const u = await stage('RUNTIME_DB_URL_PARSE_FAILED', () => {
    check(typeof databaseUrl === 'string', 'RUNTIME_DB_URL_PARSE_FAILED')
    return new URL(databaseUrl)
  })
  check(['postgres:', 'postgresql:'].includes(u.protocol) && u.hostname.replace('-pooler.', '.') === HOST
    && (!u.port || u.port === '5432') && u.searchParams.get('sslmode') === 'require'
    && [...u.searchParams.keys()].every(k => ['sslmode', 'channel_binding'].includes(k))
    && env.NEXT_PUBLIC_SITE_URL === SITE && env.SYNC_PULL_ENABLED?.toLowerCase() !== 'true'
    && ['PAYSERA_CLIENT_ID', 'PAYSERA_CLIENT_SECRET', 'PAYSERA_PROJECT_ID'].every(k => env[k]?.trim()), 'STAGING_ENV_GATE_FAILED')
  const emptyGrins = Object.entries(env).filter(([k]) => /^GRINS_.*(?:HOST|USER|PASSWORD)$/.test(k)).every(([, v]) => typeof v === 'string' && !v.trim())
  check(emptyGrins, 'GRINS_CREDENTIALS_PRESENT')
  // Isolate this child process; the application/Plesk configuration is never changed.
  const diagnosticEnv: NodeJS.ProcessEnv = { ...process.env, DATABASE_URL: databaseUrl, NODE_ENV: 'production' }
  for (const k of ['POSTGRES_PRISMA_URL', 'POSTGRES_URL', 'POSTGRES_URL_NON_POOLING']) delete diagnosticEnv[k]
  process.env = diagnosticEnv
  // PrismaClient is constructed during module evaluation; dependency import/init cannot be split without editing the application.
  const loaded = await stage('RUNTIME_PRISMA_IMPORT_OR_INIT_FAILED', () => import(pathToFileURL(resolve(root, 'lib/prisma.ts')).href))
  // Do not silently change named/default export handling: report the actual export shape separately.
  const prisma = loaded.prisma
  check(prisma && typeof prisma.$transaction === 'function' && typeof prisma.$disconnect === 'function', 'RUNTIME_PRISMA_EXPORT_INVALID')
  return disconnectAfter(prisma, () => readOnlyTransaction(prisma, async (tx: any) => {
      await verifyReadOnly(tx, decodeURIComponent(u.pathname.slice(1)))
      await verifyHealth()
      const gate = { source: 'server-local-staging-safety-gate', siteUrl: SITE, neonHost: HOST, branch: BRANCH,
        releaseSha: SHA, at: new Date().toISOString(), payseraConfigured: true, payseraTestMode: true,
        syncPullEnabled: false, grinsCredentialsEmpty: true, paypalDisabled: true,
        smtpTestMode: true, readOnlyDbVerified: true,
        operationalProof: 'Owner-confirmed Test Mode/SMTP test setup and deployed release; no configuration changes' }
      if (mode === 'gate') return gate
      check(statePath, 'STATE_REQUIRED')
      const stateText = await stage('RUNTIME_STATE_READ_FAILED', () => readFile(resolve(statePath), 'utf8'))
      const s = await stage('RUNTIME_STATE_PARSE_FAILED', () => JSON.parse(stateText))
      check(s.version === 2 && s.identity?.host === HOST && s.identity?.branch === BRANCH && s.identity?.releaseSha === SHA
        && /^STAGING-PAYSERA-VERIFY-\d+$/.test(s.tag) && s.orderId && s.orderId !== '1076'
        && [2, 3, 4, 5].includes(s.scenario), 'STATE_OWNERSHIP_FAILED')
      const o = await stage('RUNTIME_ORDER_QUERY_FAILED', () => tx.order.findUnique({ where: { id: s.orderId } }))
      check(o && o.firstName === s.tag && o.email === 'paysera-verify@example.test' && o.userId === s.adminId
        && o.paymentMethod === 'paysera' && o.items.length === 1 && o.items[0].id === s.product.id, 'OWN_ORDER_NOT_FOUND')
      const p = await stage('RUNTIME_PRODUCT_QUERY_FAILED', () => tx.product.findUnique({ where: { id: s.product.id }, select: { id: true, sku: true, stock: true } }))
      const bonus = await stage('RUNTIME_BONUS_QUERY_FAILED', () => tx.bonusTransaction.findMany({ where: { orderId: o.id }, orderBy: { id: 'asc' },
        select: { id: true, type: true, points: true, balanceAfter: true, remainingPoints: true } }))
      const user = await stage('RUNTIME_USER_QUERY_FAILED', () => tx.user.findUnique({ where: { id: o.userId }, select: { bonusPoints: true } }))
      const invoices = await stage('RUNTIME_INVOICE_QUERY_FAILED', () => tx.invoice.count({ where: { orderId: o.id } }))
      const latest = s.snapshots.at(-1)
      check(p && latest && p.stock === latest.stock && o.paymentStatus === latest.payment
        && o.stockReservationStatus === latest.reservation && (o.paymentSessionId || null) === latest.session
        && Math.round(Number(o.total) * 100) === latest.totalCents && o.items[0].quantity === latest.qty
        && user?.bonusPoints === latest.bonusBalance, 'APPLICATION_DB_SNAPSHOT_MISMATCH')
      check(p.stock >= 0 && p.stock + (o.stockReservationStatus === 'released' ? 0 : o.items[0].quantity) === s.initialStock,
        'STOCK_CONSERVATION_FAILED')
      return { source: 'application-prisma-neon-read-only', gate, scenario: s.scenario, stage: s.stage,
        orderId: o.id, session: o.paymentSessionId, reservation: o.stockReservationStatus, payment: o.paymentStatus,
        totalCents: latest.totalCents, product: p, bonus, bonusBalance: user.bonusPoints, invoices,
        result: 'DB_SNAPSHOT_PASS', at: new Date().toISOString() }
    }))
}
if (process.argv[1] && /(?:^|[\\/])verify-paysera-runtime-diagnostic\.ts$/.test(process.argv[1])) {
  main().then(result => {
    console.log(JSON.stringify(result, null, 2))
  }).catch(error => {
    console.error('PAY SERA STAGING VERIFICATION: BLOCKED')
    console.error(safeCode(error))
    process.exitCode = 1
  })
}
