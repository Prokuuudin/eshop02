import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'

const ROOTS = ['app', 'components']

// Heuristic suggestions for remaining bg pairs. NOT applied — human decides.
const SUGGEST = [
  ['bg-white dark:bg-gray-900', 'bg-card (elevated) OR bg-background (page)'],
  ['bg-white dark:bg-gray-800', 'bg-card'],
  ['bg-gray-50 dark:bg-gray-900', 'bg-muted OR bg-background'],
  ['bg-gray-50 dark:bg-gray-800', 'bg-muted'],
  ['bg-gray-100 dark:bg-gray-800', 'bg-muted'],
  ['bg-gray-100 dark:bg-gray-700', 'bg-secondary'],
  ['bg-gray-200 dark:bg-gray-700', 'bg-secondary'],
  ['bg-gray-950', 'bg-background'],
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

const rows = []
for (const root of ROOTS) {
  for (const file of walk(root)) {
    const src = readFileSync(file, 'utf8')
    for (const [pattern, suggestion] of SUGGEST) {
      const count = src.split(pattern).length - 1
      if (count > 0) rows.push({ file, pattern, suggestion, count })
    }
  }
}

rows.sort((a, b) => b.count - a.count)
mkdirSync('docs/superpowers/reports', { recursive: true })
const lines = [
  '# Phase 2 — Layered background candidates',
  '',
  'Review each site and apply the suggested token by hand. Page shell -> `bg-background`,',
  'elevated card -> `bg-card`, subtle/hover block -> `bg-muted`/`bg-secondary`.',
  '',
  '| Count | Pattern | Suggested | File |',
  '|------:|---------|-----------|------|',
  ...rows.map((r) => `| ${r.count} | \`${r.pattern}\` | ${r.suggestion} | ${r.file} |`),
  '',
  `Total sites: ${rows.reduce((s, r) => s + r.count, 0)}`,
]
writeFileSync('docs/superpowers/reports/color-bg-candidates.md', lines.join('\n'))
console.log(`Wrote report with ${rows.length} rows`)
