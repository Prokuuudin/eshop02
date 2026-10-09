// Migration-free production build against a fresh synthetic loopback database.
import { readFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { PGlite } from '@electric-sql/pglite'
import { PGLiteSocketServer } from '@electric-sql/pglite-socket'

async function main() {
  const schema = process.argv[2]
  if (!schema) throw new Error('usage: verify-grins-build-pglite.ts <schema.sql>')
  const pg = new PGlite()
  await pg.exec(readFileSync(schema, 'utf8'))
  // Eleven Next SSG workers each have a Pg pool; 30 rejects otherwise-valid
  // loopback connections. This limit is only for the isolated build harness.
  const server = new PGLiteSocketServer({ db: pg, host: '127.0.0.1', port: 54331, maxConnections: 200 })
  await server.start()
  const env: NodeJS.ProcessEnv = { NODE_ENV: 'production' }
  for (const key of ['SystemRoot', 'WINDIR', 'PATH', 'TEMP', 'TMP', 'USERPROFILE', 'LOCALAPPDATA', 'APPDATA', 'COMSPEC', 'PATHEXT', 'NUMBER_OF_PROCESSORS', 'PROCESSOR_ARCHITECTURE']) if (process.env[key]) env[key] = process.env[key]
  Object.assign(env, { NODE_ENV: 'production', DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:54331/postgres?sslmode=disable', NEXT_PUBLIC_SITE_URL: 'https://example.invalid', NEXT_TELEMETRY_DISABLED: '1' })
  let exitCode = 1
  try {
    const worker = spawn(process.execPath, ['scripts/build-canonical-cwd.mjs'], { env, stdio: 'inherit', windowsHide: true })
    exitCode = await new Promise<number>((resolve, reject) => { worker.once('exit', code => resolve(code ?? 1)); worker.once('error', reject) })
  } finally {
    await server.stop()
    await pg.close()
  }
  process.exitCode = exitCode
  console.log(JSON.stringify({ event: 'isolated_build_finished', exitCode }))
}
main().catch(error => { console.error(error); process.exitCode = 1 })
