import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { assertSafeRestoreUrl } from '@/lib/restore-safety'

function connectionEnvironment(databaseUrl: string): NodeJS.ProcessEnv {
  const url = new URL(databaseUrl)
  return { ...process.env, PGHOST: url.hostname, PGPORT: url.port || '5432', PGDATABASE: url.pathname.slice(1), PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password), PGSSLMODE: url.searchParams.get('sslmode') ?? 'require' }
}

function run(command: string, args: string[], env?: NodeJS.ProcessEnv): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', windowsHide: true, env })
    child.once('error', reject)
    child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`${command} exited with code ${code}`)))
  })
}
async function sha256(file: string): Promise<string> {
  const hash = createHash('sha256')
  await new Promise<void>((resolve, reject) => createReadStream(file).on('data', (chunk) => hash.update(chunk)).on('end', resolve).on('error', reject))
  return hash.digest('hex')
}

async function main(): Promise<void> {
  const backupFile = path.resolve(process.env.BACKUP_FILE ?? '')
  if (!process.env.BACKUP_FILE) throw new Error('BACKUP_FILE is required')
  const restoreUrl = assertSafeRestoreUrl(process.env.RESTORE_DATABASE_URL, process.env.DATABASE_URL)
  const target = new URL(restoreUrl)
  const targetName = `${target.hostname}${target.pathname}`
  if (process.env.RESTORE_CONFIRM_DATABASE !== targetName) throw new Error(`Set RESTORE_CONFIRM_DATABASE=${targetName} to confirm the isolated target`)
  const metadata = JSON.parse(await readFile(`${backupFile}.json`, 'utf8')) as { file?: string; sha256?: string }
  if (metadata.file !== path.basename(backupFile) || metadata.sha256 !== await sha256(backupFile)) throw new Error('Backup checksum verification failed')
  await run('pg_restore', ['--clean', '--if-exists', '--no-owner', '--no-privileges', '--exit-on-error', backupFile], connectionEnvironment(restoreUrl))
  console.log(JSON.stringify({ event: 'database_restore_completed', target: targetName, file: metadata.file }))
}

main().catch((error) => { console.error(error); process.exitCode = 1 })
