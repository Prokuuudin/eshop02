import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

const ROOTS = ['app', 'components']
const APPLY = process.argv.includes('--apply')

// Ordered literal replacements. Longest / most specific FIRST.
// Each entry: [from, to]. Applied with split/join (literal, global) per file.
const REPLACEMENTS = [
  // ── Brand: paired indigo (light + dark) ─────────────────────────────
  ['text-indigo-600 dark:text-indigo-400', 'text-primary'],
  ['text-indigo-600 dark:text-indigo-300', 'text-primary'],
  ['hover:text-indigo-700 dark:hover:text-indigo-300', 'hover:text-primary/90'],
  ['hover:text-indigo-700 dark:hover:text-indigo-400', 'hover:text-primary/90'],
  ['bg-indigo-600 hover:bg-indigo-700', 'bg-primary hover:bg-primary/90'],
  // ── Brand: solid single-shade (run after pairs) ─────────────────────
  ['hover:bg-indigo-700', 'hover:bg-primary/90'],
  ['bg-indigo-700', 'bg-primary'],
  ['bg-indigo-600', 'bg-primary'],
  ['border-indigo-600', 'border-primary'],
  ['focus:ring-indigo-600', 'focus:ring-ring'],
  ['ring-indigo-600', 'ring-ring'],
  ['dark:text-indigo-400', 'dark:text-primary'],
  ['dark:text-indigo-300', 'dark:text-primary'],
  ['text-indigo-600', 'text-primary'],
  // ── Text: gray foreground pairs ─────────────────────────────────────
  ['text-gray-900 dark:text-gray-100', 'text-foreground'],
  ['text-gray-800 dark:text-gray-100', 'text-foreground'],
  ['text-gray-900 dark:text-white', 'text-foreground'],
  ['text-gray-500 dark:text-gray-400', 'text-muted-foreground'],
  ['text-gray-500 dark:text-gray-300', 'text-muted-foreground'],
  ['text-gray-600 dark:text-gray-300', 'text-muted-foreground'],
  ['text-gray-600 dark:text-gray-400', 'text-muted-foreground'],
  // ── Border pairs ────────────────────────────────────────────────────
  ['border-gray-200 dark:border-gray-700', 'border-border'],
  ['border-gray-300 dark:border-gray-700', 'border-border'],
  ['border-gray-200 dark:border-gray-800', 'border-border'],
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
      console.log(`${APPLY ? 'applied' : 'would change'}: ${file} (${fileHits})`)
    }
  }
}

console.log('\n── Per-pattern hits ──')
for (const [from, n] of perPattern) if (n > 0) console.log(`${n}\t${from}`)
console.log(`\n${APPLY ? 'APPLIED' : 'DRY RUN'} — ${totalHits} replacements across ${changedFiles} files`)
