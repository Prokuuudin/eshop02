import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

const ROOTS = ['app', 'components']
const APPLY = process.argv.includes('--apply')

// Phase 2b — semantically-correct background tokens. These are NOT pixel-identical: the dark
// shade shifts by one adjacent step (e.g. gray-800 -> --card's gray-900) to unify surfaces.
// Reviewed as a minor, consistency-improving change. Excludes ambiguous cases:
//   - bg-gray-200 dark:bg-gray-700 (progress tracks / dividers)
//   - bare bg-gray-950 (would turn light mode near-black)
const REPLACEMENTS = [
  ['bg-white dark:bg-gray-800', 'bg-card'],
  ['bg-gray-50 dark:bg-gray-900', 'bg-muted'],
  ['bg-gray-50 dark:bg-gray-800', 'bg-muted'],
  ['bg-gray-100 dark:bg-gray-700', 'bg-secondary'],
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
