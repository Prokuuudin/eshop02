import { realpathSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'

const rawCwd = process.cwd()
const canonicalCwd = realpathSync.native(rawCwd)

console.log('raw cwd:      ', rawCwd)
console.log('canonical cwd:', canonicalCwd)
console.log(rawCwd === canonicalCwd ? 'Casing matches — no-op chdir.' : 'Casing differs — relaunching build from canonical path.')

process.chdir(canonicalCwd)

// Resolve next's own CLI entry from the canonical path (not via PATH/require.resolve,
// which would still carry whatever casing this wrapper script itself was loaded with)
// so `next`'s __dirname — and everything it requires relative to itself — stays canonical.
const nextBin = path.join(canonicalCwd, 'node_modules', 'next', 'dist', 'bin', 'next')

const result = spawnSync(process.execPath, [nextBin, 'build', '--webpack'], {
  cwd: canonicalCwd,
  stdio: 'inherit',
})

process.exit(result.status ?? 1)
