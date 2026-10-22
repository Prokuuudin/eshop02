import { spawnSync } from 'node:child_process'
import path from 'node:path'

// This release branch is for Preview only. Never call the package build script:
// it contains migrate deploy. Generate the client and build Next.js directly.
const expectedEndpoint = 'ep-square-sun-aqnyfzkh'
const dbKeys = ['DATABASE_URL', 'DIRECT_URL', 'POSTGRES_PRISMA_URL', 'POSTGRES_URL', 'POSTGRES_URL_NON_POOLING']
if (process.env.VERCEL_ENV !== 'preview') throw new Error('Preview-only build: refusing another environment')
if (!process.env.DATABASE_URL) throw new Error('Preview DATABASE_URL is required')
for (const key of dbKeys) {
  if (!process.env[key]) continue
  const host = new URL(process.env[key]).hostname.replace('-pooler.', '.')
  if (host !== `${expectedEndpoint}.c-8.us-east-1.aws.neon.tech`) {
    throw new Error(`Refusing ${key}: not the approved isolated Preview endpoint`)
  }
}
if (process.env.SMTP_HOST !== 'smtp.invalid') throw new Error('Preview requires disabled email delivery')
console.log(`Preview safety check passed: endpoint=${expectedEndpoint}; migrations=disabled; mail=disabled`)

for (const args of [
  [path.resolve('node_modules/prisma/build/index.js'), 'generate'],
  [path.resolve('scripts/build-canonical-cwd.mjs')],
]) {
  const result = spawnSync(process.execPath, args, { stdio: 'inherit', env: process.env })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}
