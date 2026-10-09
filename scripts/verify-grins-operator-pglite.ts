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
    const data = stdout.trim() ? JSON.parse(lines[lines.length - 1]) : undefined
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
    const point = await operate(['--action', 'checkpoint'])
    check('verified checkpoint records time LSN and counts but is not a backup', point.code === 0 && point.data.result.products === 15000 && point.data.result.note === 'metadata_only_not_a_database_backup')
    const premature = await operate(['--action', 'open', '--completed-run', 'baseline'])
    check('open cannot use a successful run from before this closure', premature.code === 1 && premature.stderr.includes('completion_not_verified'))
    const preview = await operate(['--action', 'preview', '--actor', 'operator-admin', '--xml', xmlFile])
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
    await operate(['--action', 'close'])
    await pg.exec(`INSERT INTO "SyncRun"(id,status,"triggeredBy","errorCount","errorSample") VALUES ('synthetic-failed','failed','manual',1,'{"mode":"prices-only"}');`)
    const failedOpen = await operate(['--action', 'open', '--completed-run', 'synthetic-failed'])
    check('failed import does not open checkout', failedOpen.code === 1 && (await pg.query<{ closed: boolean }>("SELECT (value->'checkoutClosed'='true'::jsonb) AS closed FROM \"KeyValueSetting\" WHERE key='grins-prices-only-maintenance'")).rows[0].closed)
  } finally { await server.stop(); await pg.close() }
  console.log(JSON.stringify({ checks: checks.length, failed: checks.filter(pass => !pass).length }))
  process.exitCode = checks.every(Boolean) ? 0 : 1
}
main().catch(error => { console.error(error); process.exitCode = 1 })
