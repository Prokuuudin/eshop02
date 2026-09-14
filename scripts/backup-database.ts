import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'

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
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) throw new Error('DATABASE_URL is required')
  const outputDir = path.resolve(process.env.BACKUP_DIR ?? '.backups')
  await mkdir(outputDir, { recursive: true })
  const stamp = new Date().toISOString().replaceAll(':', '-').replace(/\.\d{3}Z$/, 'Z')
  const output = path.join(outputDir, `database-${stamp}.dump`)
  await run('pg_dump', ['--format=custom', '--compress=9', '--no-owner', '--no-privileges', '--file', output], connectionEnvironment(databaseUrl))
  const info = await stat(output)
  const metadata = { version: 1, createdAt: new Date().toISOString(), file: path.basename(output), bytes: info.size, sha256: await sha256(output) }
  await writeFile(`${output}.json`, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify({ event: 'database_backup_created', ...metadata }))
}

main().catch((error) => { console.error(error); process.exitCode = 1 })
