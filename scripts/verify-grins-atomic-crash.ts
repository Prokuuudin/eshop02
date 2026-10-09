// Actual child process termination and reopen of a synthetic file-backed PGlite.
// This tests durable outcomes, not Neon disconnect detection or IIS recycling.
import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { PGLiteSocketServer } from '@electric-sql/pglite-socket'
import type { ExtendedPrismaClient } from '@/lib/prisma'

const schema = process.argv[2]
if (!schema) throw new Error('usage: verify-grins-atomic-crash.ts <schema.sql>')
const phase = process.argv[3]
const directory = process.argv[4]

async function child() {
  process.env.DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:54330/postgres?sslmode=disable'
  const pg = new PGlite(directory)
  await pg.exec(readFileSync(schema, 'utf8'))
  await pg.exec(`INSERT INTO "Product"(id,title,brand,price,category,"updatedAt","externalId",stock,"isActive")
    SELECT 'p'||i,'T','B',10,'hair',now(),'S'||i,4,true FROM generate_series(0,14999) i;
    INSERT INTO "SyncRun"(id,status,"triggeredBy","productsTotal","productsSynced","finishedAt") VALUES ('baseline','completed','cron',15000,15000,now());`)
  const server = new PGLiteSocketServer({ db: pg, host: '127.0.0.1', port: 54330 })
  await server.start()
  const { prisma: db } = await import('@/lib/prisma')
  const { savePendingPreview, applyManualImport, sha256Hex } = await import('@/lib/sync/manual-import')
  const { runSync } = await import('@/lib/sync/sync-runner')
  const content = `<root>${Array.from({ length: 15000 }, (_, i) => `<item><sku>S${i}</sku><price1>12</price1><price2>10</price2><price3>5</price3><price4>0</price4><quantity>5</quantity><warehouses>${Array.from({ length: 9 }, (_, slot) => `<warehouse id="${slot + 1}">${slot === 0 ? 2 : [1, 2, 5].includes(slot) ? 1 : 0}</warehouse>`).join('')}</warehouses></item>`).join('')}</root>`
  const pending = await savePendingPreview(db, { xml: content, sha256: sha256Hex(content), fileName: 'synthetic.xml', sizeBytes: Buffer.byteLength(content), actorId: 'synthetic-admin' })
  const pause = async () => {
    process.send?.({ phase, ready: true, pid: process.pid })
    await new Promise<void>(() => {})
  }
  const realTransaction = db.$transaction.bind(db)
  const wrapped = new Proxy(db, { get(target, property) {
    if (property === '$transaction') return async (fn: (tx: unknown) => Promise<unknown>, options: unknown) => {
      const result = await Reflect.apply(realTransaction, target, [async (tx: ExtendedPrismaClient) => {
        const hook = new Proxy(tx, { get(transaction, key) {
          if (key === '$executeRawUnsafe') return async (sql: string, ...params: unknown[]) => {
            const result = await transaction.$executeRawUnsafe(sql, ...params)
            if (phase === 'before-commit' && sql.includes('UPDATE "Product"')) await pause()
            return result
          }
          return Reflect.get(transaction, key)
        } })
        return fn(hook)
      }, options])
      if (phase === 'after-commit') await pause()
      return result
    }
    return Reflect.get(target, property)
  } }) as ExtendedPrismaClient
  await applyManualImport({ db: wrapped, runSync }, { previewId: pending.previewId, sha256: pending.sha256, actorId: pending.actorId })
  throw new Error('Crash hook was not reached')
}

async function parent() {
  for (const phase of ['before-commit', 'after-commit']) {
    const directory = mkdtempSync(path.resolve('test-results/grins-crash-'))
    // Direct loader: kill the actual SQL worker, never a CLI wrapper that could
    // leave a grandchild alive. IPC confirms the process that reached the hook.
    const worker = spawn(process.execPath, ['--import', 'tsx', path.resolve('scripts/verify-grins-atomic-crash.ts'), path.resolve(schema), phase, directory], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'], windowsHide: true })
    let output = ''
    worker.stdout!.on('data', data => { output += data.toString() })
    worker.stderr!.on('data', data => { output += data.toString() })
    await new Promise<void>((resolve, reject) => {
      // Seed + full 15k evaluation can be slow while another build occupies the
      // machine. This bounds harness startup, not the application's DB timeout.
      const timer = setTimeout(() => { worker.kill(); reject(new Error(`crash hook timeout: ${output}`)) }, 180_000)
      worker.on('message', message => {
        const signal = message as { ready?: boolean; pid?: number }
        if (signal.ready && signal.pid === worker.pid) { clearTimeout(timer); resolve() }
      })
      worker.on('exit', code => { clearTimeout(timer); reject(new Error(`worker exited before kill: ${code}: ${output}`)) })
    })
    const exited = new Promise<void>(resolve => worker.once('exit', () => resolve()))
    worker.kill('SIGKILL')
    await exited
    const reopened = new PGlite(directory)
    try {
      const { rows } = await reopened.query<{ n: number }>('SELECT count(*)::int AS n FROM "Product" WHERE stock=5')
      const runs = await reopened.query<{ status: string; value: Record<string, unknown> }>(`SELECT status,"errorSample" AS value FROM "SyncRun" WHERE "triggeredBy"='manual'`)
      const ledger = await reopened.query<{ n: number }>(`SELECT count(*)::int AS n FROM "KeyValueSetting" WHERE key LIKE 'grins-manual-import-applied:%'`)
      const pass = phase === 'before-commit'
        ? rows[0].n === 0 && runs.rows[0]?.status === 'running' && runs.rows[0].value.actorId === 'synthetic-admin' && ledger.rows[0].n === 0
        : rows[0].n === 15000 && runs.rows[0]?.status === 'completed' && ledger.rows[0].n === 1
      console.log(JSON.stringify({ phase, actual: { changed: rows[0].n, status: runs.rows[0]?.status, ledger: ledger.rows[0].n }, pass }))
      if (!pass) throw new Error(`crash verification failed: ${phase}`)
    } finally { await reopened.close() }
  }
}
const operation = phase ? child : parent
operation().catch(error => { console.error(error); process.exitCode = 1 })
