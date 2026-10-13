// Synthetic in-memory PostgreSQL (PGlite) on loopback + temp directories only. Never reads .env or connects externally.
// Usage: node --conditions=react-server --import tsx scripts/verify-grins-stock-deinitialize-request-pglite.ts <schema.sql>
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { PGLiteSocketServer } from '@electric-sql/pglite-socket'

const schema = process.argv[2]
if (!schema) throw new Error('usage: verify-grins-stock-deinitialize-request-pglite.ts <schema.sql>')
const DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:54342/postgres?sslmode=disable'
process.env.DATABASE_URL = DATABASE_URL
process.env.GRINS_STOCK_LEDGER_ENABLED = 'true'
process.env.GRINS_STOCK_SYNC_ENABLED = 'true'
process.env.GRINS_STOCK_MANIFEST_ENABLED = 'false'
process.env.GRINS_STOCK_RECONCILIATION_ENABLED = 'false'

const checks: Array<{ name: string; pass: boolean }> = []
const check = (name: string, pass: boolean, diag?: unknown) => {
  checks.push({ name, pass })
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}`)
  if (!pass && diag !== undefined) console.log('DIAG', JSON.stringify(diag))
}

async function main() {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'deinit-request-pglite-'))
  const vhost = path.join(temp, 'vhost')
  const appRoot = path.join(vhost, 'staging-httpdocs')
  const opsDir = path.join(vhost, 'grins-ops')
  const publicOps = path.join(appRoot, 'grins-ops')
  for (const dir of [appRoot, opsDir, publicOps]) mkdirSync(dir, { recursive: true })

  const pg = new PGlite()
  await pg.exec(readFileSync(schema, 'utf8'))
  await pg.exec(readFileSync('scripts/stock-ledger-postgres-contract.sql', 'utf8'))
  const server = new PGLiteSocketServer({ db: pg, host: '127.0.0.1', port: 54342, maxConnections: 20 })
  await server.start()
  const { prisma: db } = await import('@/lib/prisma')
  const { createServerOrder } = await import('@/lib/orders-data-store')
  const { releaseOrderStock } = await import('@/lib/stock-ledger')
  const { applyStockSnapshot } = await import('@/lib/sync/stock-snapshot')
  const { DEINITIALIZE_REQUEST_FILE, runDeinitializeRequest } = await import('@/lib/sync/stock-ledger-deinitialize-request')

  const instanceId = randomUUID()
  const productionId = randomUUID()
  const registryPath = path.join(opsDir, 'grins-environments.json')
  const registry = {
    version: 1,
    environments: {
      staging: { instanceId, hosts: ['127.0.0.1'], database: 'postgres', schema: 'public' },
      production: { instanceId: productionId, hosts: ['ep-production.example.invalid'], database: 'postgres', schema: 'public' },
    },
  }
  writeFileSync(registryPath, JSON.stringify(registry))
  writeFileSync(path.join(publicOps, 'grins-environments.json'), JSON.stringify(registry))
  const OFF = { DATABASE_URL, GRINS_OPERATIONS_DIR: opsDir, GRINS_STOCK_LEDGER_ENABLED: 'true', GRINS_STOCK_SYNC_ENABLED: 'false' }
  const run = (mode: 'dry-run' | 'execute', env: Record<string, string> = OFF) => runDeinitializeRequest(mode, { env, appRoot, db })
  const requestPath = path.join(opsDir, DEINITIALIZE_REQUEST_FILE)
  const writeRequest = (patch: Record<string, unknown> = {}, dir = opsDir) => {
    const value = {
      requestId: randomUUID(), target: 'staging', environmentProfile: registryPath, confirmOperation: instanceId,
      actor: 'admin-1', notAfter: new Date(Date.now() + 30 * 60_000).toISOString(), ...patch,
    }
    writeFileSync(path.join(dir, DEINITIALIZE_REQUEST_FILE), JSON.stringify(value))
    return value
  }
  const setGate = (closed: boolean) => pg.exec(`UPDATE "KeyValueSetting" SET value='{"checkoutClosed":${closed}}' WHERE key='grins-prices-only-maintenance'`)
  const fingerprint = async () => (await pg.query<Record<string, string>>(`SELECT
      (SELECT md5(string_agg(to_jsonb(p)::text, '|' ORDER BY id)) FROM "Product" p) AS products,
      (SELECT md5(coalesce(string_agg(to_jsonb(a)::text, '|' ORDER BY id), '')) FROM "StockAllocation" a) AS allocations`)).rows[0]
  const unchanged = async (before: Record<string, string>) => JSON.stringify(await fingerprint()) === JSON.stringify(before)
  const reason = (outcome: { output: Record<string, unknown> }) => outcome.output.reason
  const product = (externalId: string, stock: number) => ({
    externalId, sku: externalId, title: externalId, price: 10, stock,
    prices: { price1: 10, price2: 10, price3: 10, price4: 10 }, warehouseQuantities: { '10000': stock },
  })
  const order = (id: string, quantity = 1) => ({
    createdAt: new Date().toISOString(),
    items: [{ id, title: id, brand: 'B', image: '', category: 'hair', rating: 0, price: 10, stock: 10, quantity }],
    subtotal: 10 * quantity, tax: 0, delivery: 0, deliveryMethod: 'pickup', paymentMethod: 'manual', discount: 0, total: 10 * quantity,
    firstName: 'Synthetic', lastName: 'Ledger', email: 'ledger@example.invalid', phone: '000', address: 'Test', city: 'Test',
    paymentStatus: 'paid' as const, stockReservationStatus: 'committed' as const,
  })

  try {
    await pg.exec(`
      INSERT INTO "Product"(id,title,brand,price,category,"updatedAt","externalId",stock,"grinsStock","isActive")
      VALUES ('p1','P1','B',10,'hair',now(),'S1',10,NULL,true),
             ('p2','P2','B',10,'hair',now(),'S2',10,NULL,true),
             ('local','Local','B',10,'hair',now(),NULL,3,NULL,true);
      INSERT INTO "User"(id,email,"passwordHash","platformRole","updatedAt") VALUES
        ('admin-1','admin@example.invalid','x','admin',now()),
        ('customer-1','customer@example.invalid','x','customer',now());
      INSERT INTO "KeyValueSetting"(key,value,"updatedAt") VALUES
        ('grins-prices-only-maintenance','{"checkoutClosed":false}',now()),
        ('grins-deployment-environment','{"environment":"staging","instanceId":"${instanceId}"}',now());
    `)
    const init = await applyStockSnapshot(db, [product('S1', 10), product('S2', 10)], {
      identity: 'legacy-init', sha256: 'c'.repeat(64), transportModifiedAt: new Date(Date.now() - 60_000), manifestVerified: false,
    }, { hard: [], warnings: [], metrics: { rows: 2, previousProductsTotal: 2, matched: 2, unlinked: 0, softDeletedSkipped: 0, linkedMissingFromXml: 0, currentPhysicalSum: 20, incomingPhysicalSum: 20, activeZeroed: 0, linkedStockZero: 0 } })
    const hold = await createServerOrder(order('p1', 2))
    check('setup: ledger initialized with one active hold', init.status === 'completed'
      && (await pg.query<{ n: number }>(`SELECT count(*)::int AS n FROM "StockAllocation" WHERE status='committed'`)).rows[0].n === 1, init)
    const start = await fingerprint()

    const missing = await run('dry-run')
    check('no request file: refused, result written, database unchanged',
      missing.exitCode === 1 && reason(missing) === 'operation_request_missing' && existsSync(missing.resultFile!) && await unchanged(start), missing.output)

    writeRequest({}, publicOps)
    const publicDir = await run('execute', { ...OFF, GRINS_OPERATIONS_DIR: publicOps })
    check('operations dir inside the app/document root: refused, nothing written there',
      publicDir.exitCode === 1 && reason(publicDir) === 'operations_dir_not_private' && publicDir.resultFile === undefined
      && readdirSync(publicOps).every((name) => !name.endsWith('.result.json')) && await unchanged(start), publicDir.output)

    writeRequest({ environmentProfile: path.join(publicOps, 'grins-environments.json') })
    const publicRegistry = await run('dry-run')
    check('registry inside the app/document root: refused', reason(publicRegistry) === 'environment_profile_not_private', publicRegistry.output)

    writeRequest({ notAfter: new Date(Date.now() - 1_000).toISOString() })
    const expired = await run('dry-run')
    writeRequest({ notAfter: new Date(Date.now() + 3 * 60 * 60_000).toISOString() })
    const tooLong = await run('dry-run')
    check('expired and over-long requests are refused', reason(expired) === 'operation_request_expired'
      && reason(tooLong) === 'operation_request_lifetime_too_long' && await unchanged(start), { expired: expired.output, tooLong: tooLong.output })

    writeRequest({ confirmOperation: productionId })
    const wrongInstance = await run('dry-run')
    writeRequest({ target: 'production', confirmOperation: productionId, confirmProduction: productionId })
    const wrongTarget = await run('dry-run')
    await pg.exec(`UPDATE "KeyValueSetting" SET value='{"environment":"staging","instanceId":"${randomUUID()}"}' WHERE key='grins-deployment-environment'`)
    writeRequest()
    const wrongMarker = await run('dry-run')
    await pg.exec(`UPDATE "KeyValueSetting" SET value='{"environment":"staging","instanceId":"${instanceId}"}' WHERE key='grins-deployment-environment'`)
    check('wrong instanceId, wrong target/endpoint and wrong DB marker are refused',
      reason(wrongInstance) === 'operator_confirmation_required' && reason(wrongTarget) === 'database_identity_not_confirmed'
      && reason(wrongMarker) === 'database_environment_mismatch' && await unchanged(start),
      { wrongInstance: wrongInstance.output, wrongTarget: wrongTarget.output, wrongMarker: wrongMarker.output })

    writeRequest({ actor: 'customer-1' })
    const customer = await run('dry-run')
    check('non-admin actor is refused', reason(customer) === 'admin_actor_required', customer.output)

    await setGate(true)
    writeRequest()
    const holdDry = await run('dry-run')
    const holdReport = holdDry.output.report as { blockers: string[] }
    check('dry-run with an active hold: exit 2 and blocker reported, nothing changed',
      holdDry.exitCode === 2 && holdReport.blockers.includes('stock_ledger_deinitialize_active_allocations') && await unchanged(start), holdDry.output)
    await setGate(false)
    await db.$transaction((tx) => releaseOrderStock(tx, { orderId: hold.id, items: hold.items, reason: 'cancelled' }))

    let request = writeRequest()
    const openDry = await run('dry-run')
    const openFingerprint = String(openDry.output.dryRunFingerprint)
    request = writeRequest({ confirmDeinitialize: instanceId, dryRunFingerprint: openFingerprint })
    const openExec = await run('execute')
    check('open checkout: dry-run blocks, execute refused before consuming the request',
      openDry.exitCode === 2 && reason(openExec) === 'maintenance_required' && existsSync(requestPath) && await unchanged(await fingerprint()), { openDry: openDry.output, openExec: openExec.output })

    await setGate(true)
    const syncOn = await run('execute', { ...OFF, GRINS_STOCK_SYNC_ENABLED: 'true' })
    check('enabled scheduled stocks: refused before consuming the request', reason(syncOn) === 'stock_sync_must_be_disabled' && existsSync(requestPath), syncOn.output)

    writeRequest()
    const reviewed = await run('dry-run')
    const reviewedFingerprint = String(reviewed.output.dryRunFingerprint)
    await pg.exec(`UPDATE "Product" SET stock = stock + 1 WHERE id = 'local'`)
    const beforeDrift = await fingerprint()
    request = writeRequest({ confirmDeinitialize: instanceId, dryRunFingerprint: reviewedFingerprint })
    const drift = await run('execute')
    check('state changed after dry-run: execute refused, request consumed, database unchanged',
      reviewed.exitCode === 0 && reason(drift) === 'stock_ledger_deinitialize_state_changed' && !existsSync(requestPath)
      && existsSync(path.join(opsDir, `stock-deinitialize.${request.requestId}.consumed.json`)) && await unchanged(beforeDrift), drift.output)

    writeRequest()
    const finalDry = await run('dry-run')
    const beforeExec = await fingerprint()
    const stockBefore = (await pg.query('SELECT id, stock FROM "Product" ORDER BY id')).rows
    request = writeRequest({ confirmDeinitialize: instanceId, dryRunFingerprint: String(finalDry.output.dryRunFingerprint) })
    const executed = await run('execute')
    const stockAfter = (await pg.query('SELECT id, stock FROM "Product" ORDER BY id')).rows
    const leftover = (await pg.query<{ n: number }>(`SELECT count(*)::int AS n FROM "Product" WHERE "grinsStock" IS NOT NULL`)).rows[0].n
    const syncRun = (await pg.query<{ status: string }>(`SELECT status FROM "SyncRun" WHERE "sourceIdentity" = $1`, [`deinitialize-request:${request.requestId}`])).rows
    const resultFile = JSON.parse(readFileSync(executed.resultFile!, 'utf8')) as { ok: boolean; result: { status: string; clearedProducts: number } }
    check('reviewed dry-run then execute: completed, only ledger fields cleared, result file readable',
      finalDry.exitCode === 0 && executed.exitCode === 0 && resultFile.ok && resultFile.result.status === 'completed'
      && resultFile.result.clearedProducts === 2 && leftover === 0 && JSON.stringify(stockAfter) === JSON.stringify(stockBefore)
      && (await fingerprint()).allocations === beforeExec.allocations && syncRun[0]?.status === 'completed', { executed: executed.output, syncRun })

    writeFileSync(requestPath, JSON.stringify(request))
    const replayFile = await run('execute')
    unlinkSync(path.join(opsDir, `stock-deinitialize.${request.requestId}.consumed.json`))
    writeFileSync(requestPath, JSON.stringify(request))
    const afterExec = await fingerprint()
    const replayDb = await run('execute')
    check('replayed request: refused by the consumed marker and, without it, by the unique SyncRun identity',
      reason(replayFile) === 'operation_request_already_used' && reason(replayDb) === 'operation_request_already_used'
      && await unchanged(afterExec), { replayFile: replayFile.output, replayDb: replayDb.output })
  } finally {
    await db.$disconnect().catch(() => {})
    await server.stop().catch(() => {})
    await pg.close().catch(() => {})
    rmSync(temp, { recursive: true, force: true })
  }
  const failed = checks.filter((row) => !row.pass)
  console.log(`RESULT ${failed.length === 0 ? 'PASS' : 'FAIL'} ${checks.length - failed.length}/${checks.length}`)
  process.exitCode = failed.length === 0 ? 0 : 1
}

main().catch((error) => { console.error('HARNESS_ERROR', error instanceof Error ? error.stack : String(error)); process.exitCode = 1 })
