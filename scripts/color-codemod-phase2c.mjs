import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

const ROOTS = ['app', 'components']
const APPLY = process.argv.includes('--apply')

// Phase 2c — remaining background tokens.
//   bg-white dark:bg-gray-950  -> bg-background  (form inputs; PIXEL-IDENTICAL to --background)
//   bg-gray-200 dark:bg-gray-700 -> bg-muted     (skeletons / tracks / dividers; idiomatic muted)
//   bg-gray-50/200 dark:bg-gray-950 -> bg-muted  (sunken scroll areas)
// Opacity chips (bg-white/80 dark:bg-gray-950/40) are intentionally left untouched.
const REPLACEMENTS = [
  ['bg-white dark:bg-gray-950', 'bg-background'],
  ['bg-gray-200 dark:bg-gray-700', 'bg-muted'],
  ['bg-gray-50 dark:bg-gray-950', 'bg-muted'],
  ['bg-gray-200 dark:bg-gray-950', 'bg-muted'],
]

function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) walk(full, files)
    else if (name.endsWith('.tsx')) files.push(full)
  }
  return files
}

let totalHits = 0
let changedFiles = 0
const perPattern = new Map(REPLACEMENTS.map(([from]) => [from, 0]))

for (const root of ROOTS) {
  for (const file of walk(root)) {
    let src = readFileSync(file, 'utf8')
    const before = src
    let fileHits = 0
    for (const [from, to] of REPLACEMENTS) {
      if (!src.includes(from)) continue
      const count = src.split(from).length - 1
      perPattern.set(from, perPattern.get(from) + count)
      fileHits += count
      src = src.split(from).join(to)
    }
    if (fileHits > 0) {
      totalHits += fileHits
      changedFiles++
      if (APPLY && src !== before) writeFileSync(file, src)
    }
  }
}

console.log('── Per-pattern hits ──')
for (const [from, n] of perPattern) if (n > 0) console.log(`${n}\t${from}`)
console.log(`\n${APPLY ? 'APPLIED' : 'DRY RUN'} — ${totalHits} replacements across ${changedFiles} files`)
