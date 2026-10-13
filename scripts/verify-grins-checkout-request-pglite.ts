// Synthetic in-memory PostgreSQL (PGlite) on loopback + temp directories only. Never reads .env or connects externally.
// Usage: node --conditions=react-server --import tsx scripts/verify-grins-checkout-request-pglite.ts <schema.sql>
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { PGLiteSocketServer } from '@electric-sql/pglite-socket'

const schema = process.argv[2]
if (!schema) throw new Error('usage: verify-grins-checkout-request-pglite.ts <schema.sql>')
const DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:54343/postgres?sslmode=disable'
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
  const temp = mkdtempSync(path.join(os.tmpdir(), 'checkout-request-pglite-'))
  const appRoot = path.join(temp, 'vhost', 'staging-httpdocs')
  const opsDir = path.join(temp, 'vhost', 'grins-ops')
  for (const dir of [appRoot, opsDir]) mkdirSync(dir, { recursive: true })

  const pg = new PGlite()
  await pg.exec(readFileSync(schema, 'utf8'))
  await pg.exec(readFileSync('scripts/stock-ledger-postgres-contract.sql', 'utf8'))
  const server = new PGLiteSocketServer({ db: pg, host: '127.0.0.1', port: 54343, maxConnections: 20 })
  await server.start()
  const { prisma: db } = await import('@/lib/prisma')
  const { applyStockSnapshot } = await import('@/lib/sync/stock-snapshot')
  const { deinitializeStockLedger } = await import('@/lib/sync/stock-ledger-deinitialize')
  const { guardGrinsTransactions } = await import('@/lib/grins-operation-environment')
  const { runCheckoutCloseRequest, runCheckoutOpenRequest } = await import('@/lib/grins-checkout-request')

  const instanceId = randomUUID()
  const registryPath = path.join(opsDir, 'grins-environments.json')
  writeFileSync(registryPath, JSON.stringify({
    version: 1,
    environments: {
      staging: { instanceId, hosts: ['127.0.0.1'], database: 'postgres', schema: 'public' },
      production: { instanceId: randomUUID(), hosts: ['ep-production.example.invalid'], database: 'postgres', schema: 'public' },
    },
  }))
  const LEDGER_ON = { DATABASE_URL, GRINS_OPERATIONS_DIR: opsDir, GRINS_STOCK_LEDGER_ENABLED: 'true', GRINS_STOCK_SYNC_ENABLED: 'false' }
  const LEDGER_OFF = { ...LEDGER_ON, GRINS_STOCK_LEDGER_ENABLED: 'false' }
  const close = (env: Record<string, string> = LEDGER_OFF) => runCheckoutCloseRequest({ env, appRoot, db })
  const open = (env: Record<string, string> = LEDGER_OFF) => runCheckoutOpenRequest({ env, appRoot, db })
  const requestFile = (operation: string) => path.join(opsDir, `${operation}.request.json`)
  const consumedFile = (operation: string, id: string) => path.join(opsDir, `${operation}.${id}.consumed.json`)
  const request = (operation: 'checkout-close' | 'checkout-open', patch: Record<string, unknown> = {}) => {
    const value = {
      requestId: randomUUID(), target: 'staging', environmentProfile: registryPath, confirmOperation: instanceId,
      actor: 'admin-1', notAfter: new Date(Date.now() + 30 * 60_000).toISOString(), ...patch,
    }
    writeFileSync(requestFile(operation), JSON.stringify(value))
    return value
  }
  const gate = async () => (await pg.query<{ value: { checkoutClosed: boolean; maintenanceWindowId?: string } }>(
    `SELECT value FROM "KeyValueSetting" WHERE key='grins-prices-only-maintenance'`)).rows[0].value
  const claimed = async (id: string) => (await pg.query(`SELECT 1 FROM "KeyValueSetting" WHERE key=$1`, [`grins-operation-request:${id}`])).rows.length === 1
  const reason = (outcome: { output: Record<string, unknown> }) => outcome.output.reason
  const product = (externalId: string, stock: number) => ({
    externalId, sku: externalId, title: externalId, price: 10, stock,
    prices: { price1: 10, price2: 10, price3: 10, price4: 10 }, warehouseQuantities: { '10000': stock },
  })
  let mdtm = Date.now() - 600_000
  const snapshot = (products: ReturnType<typeof product>[]) => {
    mdtm += 1_000
    return applyStockSnapshot(db, products, {
      identity: `legacy:${mdtm}`, sha256: `${mdtm}`.padStart(64, '0'), transportModifiedAt: new Date(mdtm), manifestVerified: false,
    }, { hard: [], warnings: [], metrics: { rows: products.length, previousProductsTotal: products.length, matched: products.length, unlinked: 0, softDeletedSkipped: 0, linkedMissingFromXml: 0, currentPhysicalSum: 20, incomingPhysicalSum: 20, activeZeroed: 0, linkedStockZero: 0 } })
  }

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

    // Close + idempotent close + replay.
    const c1 = request('checkout-close')
    const closed = await close()
    const w1 = String(closed.output.maintenanceWindowId)
    check('close: gate closed with a new maintenance window, request consumed and claimed, result file written',
      closed.exitCode === 0 && closed.output.alreadyClosed === false && (await gate()).checkoutClosed === true && (await gate()).maintenanceWindowId === w1
      && existsSync(consumedFile('checkout-close', c1.requestId)) && await claimed(c1.requestId) && existsSync(closed.resultFile!), closed.output)
    writeFileSync(requestFile('checkout-close'), JSON.stringify(c1))
    const replayFile = await close()
    unlinkSync(consumedFile('checkout-close', c1.requestId))
    writeFileSync(requestFile('checkout-close'), JSON.stringify(c1))
    const replayDb = await close()
    check('close replay: refused by the consumed marker and, without it, by the DB claim; window unchanged',
      reason(replayFile) === 'operation_request_already_used' && reason(replayDb) === 'operation_request_already_used'
      && (await gate()).maintenanceWindowId === w1, { replayFile: replayFile.output, replayDb: replayDb.output })
    request('checkout-close')
    const again = await close()
    check('close is idempotent: already closed keeps the same window', again.exitCode === 0 && again.output.alreadyClosed === true
      && again.output.maintenanceWindowId === w1 && (await gate()).maintenanceWindowId === w1, again.output)

    // Foreign endpoint / actor / expiry.
    await pg.exec(`UPDATE "KeyValueSetting" SET value='{"environment":"staging","instanceId":"${randomUUID()}"}' WHERE key='grins-deployment-environment'`)
    request('checkout-open', { maintenanceWindowId: w1, openReason: 'no-change' })
    const foreign = await open()
    await pg.exec(`UPDATE "KeyValueSetting" SET value='{"environment":"staging","instanceId":"${instanceId}"}' WHERE key='grins-deployment-environment'`)
    request('checkout-open', { maintenanceWindowId: w1, openReason: 'no-change', actor: 'customer-1' })
    const customer = await open()
    request('checkout-open', { maintenanceWindowId: w1, openReason: 'no-change', notAfter: new Date(Date.now() - 1_000).toISOString() })
    const expired = await open()
    request('checkout-open', { maintenanceWindowId: w1, openReason: 'prices-import' })
    const noRun = await open()
    check('foreign DB marker, non-admin actor, expired request and incomplete prices-import request are refused; gate stays closed',
      reason(foreign) === 'database_environment_mismatch' && reason(customer) === 'admin_actor_required' && reason(expired) === 'operation_request_expired'
      && reason(noRun) === 'operation_request_invalid' && (await gate()).checkoutClosed === true,
      { foreign: foreign.output, customer: customer.output, expired: expired.output, noRun: noRun.output })

    const wrongWindow = request('checkout-open', { maintenanceWindowId: randomUUID(), openReason: 'no-change' })
    const wrong = await open()
    check('open quoting a stale/foreign window is refused before consuming the request',
      reason(wrong) === 'completion_not_verified' && existsSync(requestFile('checkout-open')) && !existsSync(consumedFile('checkout-open', wrongWindow.requestId))
      && (await gate()).checkoutClosed === true, wrong.output)

    const o1 = request('checkout-open', { maintenanceWindowId: w1, openReason: 'no-change' })
    const opened = await open()
    check('open after a window with no change: gate open, window cleared, claimed',
      opened.exitCode === 0 && opened.output.checkoutClosed === false && (await gate()).checkoutClosed === false
      && (await gate()).maintenanceWindowId === undefined && await claimed(o1.requestId), opened.output)
    unlinkSync(consumedFile('checkout-open', o1.requestId))
    writeFileSync(requestFile('checkout-open'), JSON.stringify(o1))
    const openReplay = await open()
    check('open replay is refused and leaves checkout open', openReplay.exitCode === 1 && (await gate()).checkoutClosed === false, openReplay.output)

    // Stock-ledger window: cutover snapshot inside the window.
    request('checkout-close')
    const w2 = String((await close()).output.maintenanceWindowId)
    await snapshot([product('S1', 10)])
    const stockOpen = () => request('checkout-open', { maintenanceWindowId: w2, openReason: 'stock-ledger' })
    stockOpen()
    const partial = await open(LEDGER_ON)
    check('partially initialized ledger blocks open (request kept for the retry)',
      reason(partial) === 'stock_ledger_partially_initialized' && existsSync(requestFile('checkout-open')) && (await gate()).checkoutClosed === true, partial.output)
    await snapshot([product('S1', 10), product('S2', 10)])
    request('checkout-open', { maintenanceWindowId: w2, openReason: 'no-change' })
    const noChangeAfterSnapshot = await open(LEDGER_ON)
    stockOpen()
    const flagOff = await open(LEDGER_OFF)
    await pg.exec(`BEGIN; SELECT set_config('hairshop.stock_ledger_write','on',true); UPDATE "Product" SET stock = stock - 1 WHERE id='p1'; COMMIT;`)
    stockOpen()
    const drift = await open(LEDGER_ON)
    await pg.exec(`BEGIN; SELECT set_config('hairshop.stock_ledger_write','on',true); UPDATE "Product" SET stock = stock + 1 WHERE id='p1'; COMMIT;`)
    await pg.exec(`INSERT INTO "SyncRun"(id,"startedAt",status,mode,"triggeredBy") VALUES ('running-run', now(), 'running', 'stocks-only', 'cron')`)
    const runningRequest = stockOpen()
    const running = await open(LEDGER_ON)
    const runningKept = existsSync(requestFile('checkout-open')) && !existsSync(consumedFile('checkout-open', runningRequest.requestId))
    await pg.exec(`UPDATE "SyncRun" SET status='failed', "finishedAt"=now() WHERE id='running-run'`)
    await pg.exec(`INSERT INTO "SyncRun"(id,"startedAt","finishedAt",status,mode,"triggeredBy") VALUES ('full-run', now(), now(), 'completed', 'full', 'manual')`)
    stockOpen()
    const foreignRun = await open(LEDGER_ON)
    await pg.exec(`DELETE FROM "SyncRun" WHERE id='full-run'`)
    check('after a snapshot: no-change open, ledger flag off, availability drift, a running operation and a non-stock run each block open',
      reason(noChangeAfterSnapshot) === 'completion_not_verified' && reason(flagOff) === 'stock_ledger_flag_required'
      && reason(drift) === 'stock_ledger_invariant_failed' && reason(running) === 'import_active' && runningKept
      && reason(foreignRun) === 'completion_not_verified' && (await gate()).checkoutClosed === true,
      { noChangeAfterSnapshot: noChangeAfterSnapshot.output, flagOff: flagOff.output, drift: drift.output, running: running.output, runningKept, foreignRun: foreignRun.output })

    // Failure in the middle of open: gate update fails -> nothing committed, claim rolled back.
    await pg.exec(`
      CREATE FUNCTION fail_gate_open() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'synthetic_gate_failure'; END; $$ LANGUAGE plpgsql;
      CREATE TRIGGER fail_gate_open BEFORE UPDATE ON "KeyValueSetting" FOR EACH ROW
      WHEN (NEW.key = 'grins-prices-only-maintenance' AND NEW.value->>'checkoutClosed' = 'false') EXECUTE FUNCTION fail_gate_open();
    `)
    const failing = request('checkout-open', { maintenanceWindowId: w2, openReason: 'stock-ledger' })
    const failed = await open(LEDGER_ON)
    await pg.exec('DROP TRIGGER fail_gate_open ON "KeyValueSetting"; DROP FUNCTION fail_gate_open();')
    check('mid-open failure: gate stays closed with the same window, DB claim rolled back, request consumed',
      failed.exitCode === 1 && (await gate()).checkoutClosed === true && (await gate()).maintenanceWindowId === w2
      && !await claimed(failing.requestId) && existsSync(consumedFile('checkout-open', failing.requestId)), failed.output)

    request('checkout-open', { maintenanceWindowId: w2, openReason: 'stock-ledger' })
    const ledgerOpen = await open(LEDGER_ON)
    check('coherent initialized ledger with terminal stock runs: stock-ledger open succeeds',
      ledgerOpen.exitCode === 0 && ledgerOpen.output.checkoutClosed === false && (await gate()).checkoutClosed === false, ledgerOpen.output)

    // Deinitialize window: back to legacy, then reopen with the ledger flag off.
    request('checkout-close')
    const w3 = String((await close()).output.maintenanceWindowId)
    const deinit = await deinitializeStockLedger(guardGrinsTransactions(db, { target: 'staging', instanceId, hosts: ['127.0.0.1'], database: 'postgres', schema: 'public' }), 'operator:test', LEDGER_ON)
    request('checkout-open', { maintenanceWindowId: w3, openReason: 'stock-ledger' })
    const legacyOpen = await open(LEDGER_OFF)
    check('after deinitialize: legacy state reopens with the ledger flag off',
      deinit.status === 'completed' && legacyOpen.exitCode === 0 && (await gate()).checkoutClosed === false, { deinit, legacyOpen: legacyOpen.output })
  } finally {
    await db.$disconnect().catch(() => {})
    await server.stop().catch(() => {})
    await pg.close().catch(() => {})
    rmSync(temp, { recursive: true, force: true })
  }
  const failedChecks = checks.filter((row) => !row.pass)
  console.log(`RESULT ${failedChecks.length === 0 ? 'PASS' : 'FAIL'} ${checks.length - failedChecks.length}/${checks.length}`)
  process.exitCode = failedChecks.length === 0 ? 0 : 1
}

main().catch((error) => { console.error('HARNESS_ERROR', error instanceof Error ? error.stack : String(error)); process.exitCode = 1 })
