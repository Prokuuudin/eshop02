import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { extname } from 'node:path'

const tracked = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' })
  .split(/\r?\n/)
  .filter(Boolean)

const findings = []
const trackedSecretFile = /(^|\/)(\.env(?:\..+)?|.*\.(?:pem|key|p12|pfx))$/i
for (const file of tracked.filter((name) => trackedSecretFile.test(name))) {
  if (/(^|\/)\.env\.example$/i.test(file)) continue
  findings.push(`${file}: secret-bearing file is tracked`)
}

const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'])
const dangerousPublicEnv = /NEXT_PUBLIC_[A-Z0-9_]*(?:SECRET|PASSWORD|PRIVATE_KEY|DATABASE_URL|ACCESS_TOKEN|API_TOKEN)(?:[A-Z0-9_]*)/g
const privateKeyMarker = /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/

for (const file of tracked) {
  if (!sourceExtensions.has(extname(file))) continue
  // `git ls-files --cached` includes staged/tracked paths deleted in the worktree.
  if (!existsSync(file)) continue
  const text = readFileSync(file, 'utf8')
  const publicNames = [...new Set(text.match(dangerousPublicEnv) ?? [])]
  for (const name of publicNames) findings.push(`${file}: unsafe client-exposed env name ${name}`)
  if (privateKeyMarker.test(text)) findings.push(`${file}: embedded private key marker`)
}

if (findings.length > 0) {
  console.error('Security audit failed:')
  for (const finding of findings) console.error(`- ${finding}`)
  process.exitCode = 1
} else {
  console.log(`Security audit passed (${tracked.length} project files checked).`)
}
