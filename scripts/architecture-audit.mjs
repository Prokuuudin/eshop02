import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const root = process.cwd()
const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8' })
  .split(/\r?\n/u)
  .filter((file) => /^(app|components|hooks|lib|utils)\/.+\.(?:ts|tsx)$/u.test(file))
  .filter((file) => !/\.(?:test|spec)\.[^.]+$/u.test(file))
const source = new Map(files.map((file) => [resolve(root, file), readFileSync(resolve(root, file), 'utf8')]))
const violations = []
// Keep the mechanism explicit: the baseline is intentionally empty.
const largeFileBaseline = new Set()

for (const [absolute, text] of source) {
  const file = absolute.slice(root.length + 1).replaceAll('\\', '/')
  const lines = text.split(/\r?\n/u).length
  if (lines > 800 && !largeFileBaseline.has(file)) violations.push(`${file}: ${lines} lines (limit 800)`)
  if (/process\.env\.NEXT_PUBLIC_[A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|PRIVATE|API_KEY)/u.test(text)) {
    violations.push(`${file}: secret-like NEXT_PUBLIC variable`)
  }
}

const resolveImport = (from, specifier) => {
  if (!specifier.startsWith('.') && !specifier.startsWith('@/')) return null
  const base = specifier.startsWith('@/') ? resolve(root, specifier.slice(2)) : resolve(dirname(from), specifier)
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, resolve(base, 'index.ts'), resolve(base, 'index.tsx')]) {
    if (existsSync(candidate) && source.has(candidate)) return candidate
  }
  return null
}
const graph = new Map()
for (const [file, text] of source) {
  const runtimeText = text
    .replace(/^\s*import\s+type\s+.*$/gmu, '')
    .replace(/^\s*import\s*\{\s*type\s+.*$/gmu, '')
  const imports = [...runtimeText.matchAll(/(?:import|export)\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/gu)]
    .map((match) => resolveImport(file, match[1]))
    .filter(Boolean)
  graph.set(file, imports)
}

const serverOnly = new Set([...source].filter(([, text]) => /(?:import\s+['"]server-only['"]|from\s+['"]server-only['"])/u.test(text)).map(([file]) => file))
const reachesServer = (file, seen = new Set()) => {
  if (serverOnly.has(file)) return true
  if (seen.has(file)) return false
  seen.add(file)
  return (graph.get(file) ?? []).some((dependency) => reachesServer(dependency, seen))
}
for (const [file, text] of source) {
  if (/^\s*['"]use client['"]/u.test(text) && (graph.get(file) ?? []).some((dependency) => reachesServer(dependency))) {
    violations.push(`${file.slice(root.length + 1)}: client module reaches a server-only module`)
  }
}

const visiting = new Set()
const visited = new Set()
const walk = (file, trail) => {
  if (visiting.has(file)) {
    const cycle = [...trail.slice(trail.indexOf(file)), file].map((item) => item.slice(root.length + 1)).join(' -> ')
    violations.push(`dependency cycle: ${cycle}`)
    return
  }
  if (visited.has(file)) return
  visiting.add(file)
  for (const dependency of graph.get(file) ?? []) walk(dependency, [...trail, file])
  visiting.delete(file)
  visited.add(file)
}
for (const file of graph.keys()) walk(file, [])

if (violations.length) {
  console.error(`Architecture audit failed:\n- ${[...new Set(violations)].join('\n- ')}`)
  process.exit(1)
}
console.log(`Architecture audit passed (${files.length} source modules).`)
