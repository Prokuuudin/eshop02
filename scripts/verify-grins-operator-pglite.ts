import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { PGlite } from '@electric-sql/pglite'
import { PGLiteSocketServer } from '@electric-sql/pglite-socket'
const schema = process.argv[2]
if (!schema) throw new Error('schema fixture required')
const id = '11111111-1111-4111-8111-111111111111', prod = '22222222-2222-4222-8222-222222222222'
const checks: boolean[] = []
const check = (name: string, pass: boolean) => { checks.push(pass); console.log(`${pass ? 'PASS' : 'FAIL'} ${name}`) }
async function main() {
  const pg = new PGlite()
  await pg.exec(readFileSync(schema, 'utf8'))
  const server = new PGLiteSocketServer({ db: pg, host: '127.0.0.1', port: 54332, maxConnections: 20 })
  await server.start()
  const folder = mkdtempSync(path.resolve('test-results/grins-operator-'))
  const registry = path.join(folder, 'registry.json'), xmlFile = path.join(folder, 'synthetic.xml')
  writeFileSync(registry, JSON.stringify({ version: 1, environments: { staging: { instanceId: id, hosts: ['127.0.0.1'], database: 'postgres', schema: 'public' }, production: { instanceId: prod, hosts: ['prod.example.invalid'], database: 'production', schema: 'public' } } }))
  writeFileSync(xmlFile, `<root>${Array.from({ length: 15000 }, (_, i) => `<item><sku>S${i}</sku><price1>12</price1><price2>${i < 1000 ? '11.50' : '10'}</price2><price3>5</price3><price4>0</price4><quantity>4</quantity><warehouses>${Array.from({ length: 9 }, (_, j) => `<warehouse id="${j + 1}">${[0, 1, 2, 5].includes(j) ? 1 : 0}</warehouse>`).join('')}</warehouses></item>`).join('')}</root>`)
  const run = async (script: string, args: string[]) => {
    const env: NodeJS.ProcessEnv = { NODE_ENV: 'test', DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:54332/postgres?sslmode=disable' }
    for (const name of ['SystemRoot', 'WINDIR', 'PATH', 'TEMP', 'TMP']) if (process.env[name]) env[name] = process.env[name]
    const child = spawn(process.execPath, [path.resolve('node_modules/tsx/dist/cli.mjs'), path.resolve(script), '--environment-profile', registry, '--target', 'staging', ...args], { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = '', stderr = ''
    child.stdout.on('data', data => { stdout += data.toString() }); child.stderr.on('data', data => { stderr += data.toString() })
    const code = await new Promise<number>(resolve => child.once('exit', status => resolve(status ?? 1)))
    const lines = stdout.trim().split(/\r?\n/u)
    let data
    if (stdout.trim()) { try { data = JSON.parse(stdout.trim()) } catch { data = JSON.parse(lines[lines.length - 1]) } }
    return { code, data, stderr }
  }
  const operate = (args: string[]) => run('scripts/operate-grins-staging.ts', ['--confirm-operation', id, ...args])
  try {
    await pg.exec(`INSERT INTO "User"(id,email,"passwordHash","platformRole","updatedAt") VALUES ('operator-admin','synthetic@example.invalid','synthetic-hash','admin',now());
      INSERT INTO "Product"(id,title,brand,price,category,"updatedAt","externalId",stock,"isActive") SELECT 'p'||i,'T','B',10,'hair',now(),'S'||i,4,true FROM generate_series(0,14999) i;
      INSERT INTO "SyncRun"(id,status,"triggeredBy","productsTotal","productsSynced","finishedAt") VALUES ('baseline','completed','cron',15000,15000,now());
      INSERT INTO "KeyValueSetting"(key,value,"updatedAt") VALUES ('grins-deployment-environment','{"environment":"production","instanceId":"${prod}"}',now());`)
    const wrong = await run('scripts/prepare-grins-checkout-state.ts', ['--expect-state', 'open', '--initialize', '--confirm-initial-state', 'open'])
    check('production DB marker rejects staging command without gate writes', wrong.code === 1 && wrong.stderr.includes('database_environment_mismatch') && (await pg.query("SELECT key FROM \"KeyValueSetting\" WHERE key='grins-prices-only-maintenance'")).rows.length === 0)
    await pg.query(`UPDATE "KeyValueSetting" SET value=$1::jsonb WHERE key='grins-deployment-environment'`, [JSON.stringify({ environment: 'staging', instanceId: id })])
    const init = await run('scripts/prepare-grins-checkout-state.ts', ['--expect-state', 'open', '--initialize', '--confirm-initial-state', 'open'])
    check('verified CLI initialization creates open state', init.code === 0 && init.data.created && init.data.checkoutClosed === false)
    const closed = await operate(['--action', 'close', '--expect-state', 'closed'])
    if (closed.code !== 0) throw new Error(`synthetic close failed: ${closed.stderr}`)
    check('verified close commits and read-back is closed', closed.code === 0 && closed.data.checkoutClosed === true)
    check('verified close exposes current UUID for explicit abort', typeof closed.data.maintenanceWindowId === 'string' && (await operate(['--action', 'check'])).data.maintenanceWindowId === closed.data.maintenanceWindowId)
    const point = await operate(['--action', 'checkpoint'])
    check('verified checkpoint records time LSN and counts but is not a backup', point.code === 0 && point.data.result.products === 15000 && point.data.result.note === 'metadata_only_not_a_database_backup')
    const premature = await operate(['--action', 'open', '--completed-run', 'baseline'])
    check('open cannot use a successful run from before this closure', premature.code === 1 && premature.stderr.includes('completion_not_verified'))
    const preview = await operate(['--action', 'preview', '--actor', 'operator-admin', '--xml', xmlFile])
    if (preview.code !== 0) throw new Error(`synthetic preview failed: ${preview.stderr}`)
    check('local-tsx CLI creates a verified prices-only preview', preview.code === 0 && preview.data.result.canApply)
    const applied = await operate(['--action', 'apply', '--actor', 'operator-admin', '--preview', preview.data.result.previewId, '--sha256', preview.data.result.sha256, '--acknowledge-price-warnings'])
    check('verified CLI Apply completes without changing any stock', applied.code === 0 && applied.data.result.status === 'completed' && (await pg.query('SELECT id FROM "Product" WHERE stock<>4')).rows.length === 0)
    const runId = applied.data.result.result.runId
    const result = await operate(['--action', 'result', '--run', runId])
    check('verified result identifies mode SHA and completion', result.code === 0 && result.data.result.mode === 'prices-only' && result.data.result.status === 'completed')
    const gateWindow = (await pg.query<{ value: { maintenanceWindowId: string } }>("SELECT value FROM \"KeyValueSetting\" WHERE key='grins-prices-only-maintenance'")).rows[0].value.maintenanceWindowId
    await pg.query(`INSERT INTO "SyncRun"(id,status,"triggeredBy","errorSample") VALUES ('synthetic-other-completion','completed','manual',$1::jsonb)`, [JSON.stringify({ mode: 'prices-only', maintenanceWindowId: gateWindow })])
    const ambiguous = await operate(['--action', 'open', '--completed-run', runId])
    check('multiple completions cannot open using a stale successful receipt', ambiguous.code === 1)
    await pg.exec("DELETE FROM \"SyncRun\" WHERE id='synthetic-other-completion'")
    const opened = await operate(['--action', 'open', '--completed-run', runId, '--expect-state', 'open'])
    if (opened.code !== 0) console.log(JSON.stringify({ openError: opened.stderr, runs: (await pg.query('SELECT id,status,"startedAt","errorCount","errorSample"->>\'mode\' AS mode FROM "SyncRun"')).rows, gate: (await pg.query("SELECT \"updatedAt\" FROM \"KeyValueSetting\" WHERE key='grins-prices-only-maintenance'")).rows }))
    check('explicit open requires current-window success and commits', opened.code === 0 && opened.data.checkoutClosed === false)
    const readback = await operate(['--action', 'check', '--expect-state', 'open'])
    check('verified read-only check confirms open', readback.code === 0 && readback.data.checkoutClosed === false)
    check('open consumes active window UUID', !(await pg.query<{ value: Record<string, unknown> }>("SELECT value FROM \"KeyValueSetting\" WHERE key='grins-prices-only-maintenance'")).rows[0].value.maintenanceWindowId)
    await pg.exec("UPDATE \"KeyValueSetting\" SET value=jsonb_set(value,'{checkoutClosed}','true') WHERE key='grins-prices-only-maintenance'")
    const replay = await operate(['--action', 'open', '--completed-run', runId])
    check('open SQL-close old-run replay rejected and remains closed', replay.code === 1 && (await operate(['--action', 'check', '--expect-state', 'closed'])).code === 0)
    await pg.query(`UPDATE "KeyValueSetting" SET value=$1::jsonb WHERE key='grins-prices-only-maintenance'`, [JSON.stringify({ checkoutClosed: true, maintenanceWindowId: gateWindow })])
    await Promise.all([operate(['--action', 'open', '--completed-run', runId]), operate(['--action', 'close'])])
    const afterRace = (await pg.query<{ value: { checkoutClosed: boolean; maintenanceWindowId?: string } }>("SELECT value FROM \"KeyValueSetting\" WHERE key='grins-prices-only-maintenance'")).rows[0].value
    check('concurrent close/open consumes receipt or creates fresh window', afterRace.checkoutClosed ? !!afterRace.maintenanceWindowId && afterRace.maintenanceWindowId !== gateWindow : !afterRace.maintenanceWindowId)
    const abortWindow = '33333333-3333-4333-8333-333333333333'
    const resetAbort = async () => {
      await pg.exec("DELETE FROM \"SyncRun\" WHERE id='abort-test'; DELETE FROM \"KeyValueSetting\" WHERE key IN ('sync-run-lock','synthetic-ledger')")
      const prior = (await pg.query<{ id: string }>('SELECT id FROM "SyncRun"')).rows.map(run => run.id)
      await pg.query(`UPDATE "KeyValueSetting" SET value=$1::jsonb WHERE key='grins-prices-only-maintenance'`, [JSON.stringify({ checkoutClosed: true, maintenanceWindowId: abortWindow, maintenanceBaselineRunIds: prior })])
    }
    const abortArgs = ['--action', 'abort-window', '--window', abortWindow, '--confirm-no-commit', abortWindow]
    const seedRun = async (status: string, detail: Record<string, unknown>, synced = 0, finished = true) => pg.query(`INSERT INTO "SyncRun"(id,status,"triggeredBy","productsSynced","finishedAt","errorSample") VALUES ('abort-test',$1,'manual',$2,$3,$4::jsonb)`, [status, synced, finished ? new Date() : null, JSON.stringify({ mode: 'prices-only', maintenanceWindowId: abortWindow, ...detail })])
    for (const status of ['completed', 'running', 'unknown']) {
      await resetAbort(); await seedRun(status, { stage: 'rolled_back' })
      check(`abort rejects ${status} and keeps closed`, (await operate(abortArgs)).code === 1 && (await operate(['--action', 'check', '--expect-state', 'closed'])).code === 0)
    }
    for (const [label, status, detail, synced, finished] of [
      ['unknown outcome', 'failed', { stage: 'transaction_in_progress' }, 0, true],
      ['committed stage', 'failed', { stage: 'committed' }, 0, true],
      ['backup receipt', 'failed', { stage: 'rolled_back', backupKey: 'receipt' }, 0, true],
      ['changed count', 'failed', { stage: 'rolled_back' }, 1, true],
      ['unfinished failure', 'failed', { stage: 'rolled_back' }, 0, false],
      ['ambiguous skipped', 'skipped', { stage: 'duplicate' }, 0, true],
    ] as const) {
      await resetAbort(); await seedRun(status, detail, synced, finished)
      check(`abort rejects ${label} and keeps closed`, (await operate(abortArgs)).code === 1 && (await operate(['--action', 'check', '--expect-state', 'closed'])).code === 0)
    }
    await resetAbort(); await seedRun('failed', { stage: 'rolled_back' })
    await pg.exec(`INSERT INTO "KeyValueSetting"(key,value,"updatedAt") VALUES ('synthetic-ledger','{"runId":"abort-test"}',now())`)
    check('abort rejects durable write receipt', (await operate(abortArgs)).code === 1)
    await resetAbort(); await pg.exec(`INSERT INTO "KeyValueSetting"(key,value,"updatedAt") VALUES ('sync-run-lock','{"lockedUntil":"2099-01-01T00:00:00Z"}',now())`)
    check('abort rejects held lease', (await operate(abortArgs)).code === 1)
    await resetAbort()
    await pg.exec(`INSERT INTO "KeyValueSetting"(key,value,"updatedAt") VALUES ('sync-run-lock','{}',now())`)
    check('abort rejects unknown lease state and keeps closed', (await operate(abortArgs)).code === 1 && (await operate(['--action', 'check', '--expect-state', 'closed'])).code === 0)
    await resetAbort()
    await pg.exec(`INSERT INTO "SyncRun"(id,status,"triggeredBy") VALUES ('foreign-unknown','unknown','manual')`)
    check('abort rejects unknown outcome even without current-window diagnostics', (await operate(abortArgs)).code === 1)
    await pg.exec("DELETE FROM \"SyncRun\" WHERE id='foreign-unknown'")
    check('abort rejects wrong window', (await operate(abortArgs.map(item => item === abortWindow ? gateWindow : item))).code === 1)
    await pg.exec("UPDATE \"KeyValueSetting\" SET value=value-'maintenanceBaselineRunIds' WHERE key='grins-prices-only-maintenance'")
    check('abort rejects legacy window without operation baseline', (await operate(abortArgs)).code === 1)
    await resetAbort()
    check('abort rejects missing rollback confirmation', (await operate(['--action', 'abort-window', '--window', abortWindow])).code === 1)
    check('abort rejects missing operation confirmation', (await run('scripts/operate-grins-staging.ts', abortArgs)).code === 1)
    await resetAbort(); await seedRun('completed', { maintenanceWindowId: undefined, stage: 'committed' })
    check('abort rejects new completed run without window metadata', (await operate(abortArgs)).code === 1)
    await resetAbort()
    await seedRun('failed', { stage: 'rolled_back' })
    check('confirmed durable rollback abort opens and consumes window', (await operate(abortArgs)).code === 0 && (await operate(['--action', 'check', '--expect-state', 'open'])).code === 0)
    check('abort consumes UUID and cannot be replayed', !(await operate(['--action', 'check'])).data.maintenanceWindowId && (await operate(abortArgs)).code === 1)
    await resetAbort(); await seedRun('skipped', { stage: 'rejected' })
    check('confirmed pre-write skipped abort opens', (await operate(abortArgs)).code === 0)
    await resetAbort(); await seedRun('failed', { stage: 'rolled_back' })
    await Promise.all([operate(abortArgs), operate(['--action', 'close'])])
    const abortRace = (await pg.query<{ value: { checkoutClosed: boolean; maintenanceWindowId?: string } }>("SELECT value FROM \"KeyValueSetting\" WHERE key='grins-prices-only-maintenance'")).rows[0].value
    check('concurrent abort/close consumes or rotates UUID', abortRace.checkoutClosed ? !!abortRace.maintenanceWindowId && abortRace.maintenanceWindowId !== abortWindow : !abortRace.maintenanceWindowId)
    const restoreGood = await run('scripts/restore-grins-manual-import.ts', ['--list', '--confirm-operation', id])
    check('restore list accepts verified marker and explicit confirmation', restoreGood.code === 0)
    const backupKey = applied.data.result.backupKey
    const dryRestore = await run('scripts/restore-grins-manual-import.ts', ['--backup', backupKey, '--confirm-operation', id])
    check('guarded restore dry-run preserves prices and fingerprints', dryRestore.code === 0 && dryRestore.data.restored === 0 && (await pg.query('SELECT id FROM "Product" WHERE price=11.50')).rows.length === 1000)
    await operate(['--action', 'close'])
    const restoreExecute = await run('scripts/restore-grins-manual-import.ts', ['--backup', backupKey, '--confirm-operation', id, '--execute'])
    check('guarded restore execute restores prices but never stock', restoreExecute.code === 0 && restoreExecute.data.restored === 1000 && (await pg.query('SELECT id FROM "Product" WHERE price<>10 OR stock<>4')).rows.length === 0)
    const restoredWindow = (await operate(['--action', 'check'])).data.maintenanceWindowId
    check('abort refuses committed restore without matching window diagnostics', (await operate(['--action', 'abort-window', '--window', restoredWindow, '--confirm-no-commit', restoredWindow])).code === 1)
    await pg.query(`UPDATE "KeyValueSetting" SET value=$1::jsonb WHERE key='grins-deployment-environment'`, [JSON.stringify({ environment: 'production', instanceId: prod })])
    check('restore rejects wrong DB marker', (await run('scripts/restore-grins-manual-import.ts', ['--list', '--confirm-operation', id])).code === 1)
    await pg.query(`UPDATE "KeyValueSetting" SET value=$1::jsonb WHERE key='grins-deployment-environment'`, [JSON.stringify({ environment: 'staging', instanceId: id })])
    check('restore rejects missing operation confirmation', (await run('scripts/restore-grins-manual-import.ts', ['--list'])).code === 1)
    await operate(['--action', 'close'])
    await pg.exec(`INSERT INTO "SyncRun"(id,status,"triggeredBy","errorCount","errorSample") VALUES ('synthetic-failed','failed','manual',1,'{"mode":"prices-only"}');`)
    const failedOpen = await operate(['--action', 'open', '--completed-run', 'synthetic-failed'])
    check('failed import does not open checkout', failedOpen.code === 1 && (await pg.query<{ closed: boolean }>("SELECT (value->'checkoutClosed'='true'::jsonb) AS closed FROM \"KeyValueSetting\" WHERE key='grins-prices-only-maintenance'")).rows[0].closed)
  } finally { await server.stop(); await pg.close() }
  console.log(JSON.stringify({ checks: checks.length, failed: checks.filter(pass => !pass).length }))
  process.exitCode = checks.every(Boolean) ? 0 : 1
}
main().catch(error => { console.error(error); process.exitCode = 1 })
