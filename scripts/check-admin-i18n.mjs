import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

const root = process.cwd()
const languages = ['ru', 'en', 'lv']
const sourceRoots = ['app/[lang]/admin', 'components/admin']
const keyPattern = /'([^']+)'\s*:/g
const callPattern = /\bt\(\s*['"]([^'"]+)['"]/g
const cyrillicPattern = /[А-Яа-яЁё]{2,}/

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name)
    return entry.isDirectory() ? walk(target) : [target]
  })
}

function matches(text, pattern) {
  return [...text.matchAll(pattern)].map((match) => match[1])
}

const dictionaries = Object.fromEntries(languages.map((language) => {
  const directory = path.join(root, 'data', 'translations', language)
  const keys = walk(directory)
    .filter((file) => file.endsWith('.ts'))
    .flatMap((file) => matches(fs.readFileSync(file, 'utf8'), keyPattern))
  return [language, new Set(keys)]
}))

const reference = new Set([...dictionaries.ru].filter((key) => key.startsWith('admin.')))
const errors = []
for (const language of languages.slice(1)) {
  const localizedAdminKeys = new Set([...dictionaries[language]].filter((key) => key.startsWith('admin.')))
  const missing = [...reference].filter((key) => !localizedAdminKeys.has(key))
  const extra = [...localizedAdminKeys].filter((key) => !reference.has(key))
  if (missing.length) errors.push(`${language}: missing keys: ${missing.join(', ')}`)
  if (extra.length) errors.push(`${language}: extra keys: ${extra.join(', ')}`)
}

const adminFiles = sourceRoots
  .flatMap((directory) => walk(path.join(root, directory)))
  .filter((file) => /\.(?:ts|tsx)$/.test(file) && !/\.(?:test|spec)\./.test(file))
const usedKeys = new Set(adminFiles.flatMap((file) => matches(fs.readFileSync(file, 'utf8'), callPattern)))

function isInsideLocalizedExpression(node) {
  let current = node.parent
  while (current) {
    if (ts.isCallExpression(current) && ts.isIdentifier(current.expression) && ['l', 'tl'].includes(current.expression.text)) return true
    if (ts.isConditionalExpression(current) && /language\s*===/.test(current.getText())) return true
    current = current.parent
  }
  return false
}

const hardcoded = []
for (const file of adminFiles) {
  const sourceText = fs.readFileSync(file, 'utf8')
  const source = ts.createSourceFile(file, sourceText, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  function visit(node) {
    const text = ts.isJsxText(node) || ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) ? node.text.trim() : ''
    if (text && cyrillicPattern.test(text) && !isInsideLocalizedExpression(node)) {
      const position = source.getLineAndCharacterOfPosition(node.getStart(source))
      hardcoded.push(`${path.relative(root, file)}:${position.line + 1}: ${text.replace(/\s+/g, ' ').slice(0, 120)}`)
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
}

for (const language of languages) {
  const missing = [...usedKeys].filter((key) => !dictionaries[language].has(key))
  if (missing.length) errors.push(`${language}: admin uses undefined keys: ${missing.join(', ')}`)
}

if (errors.length) {
  console.error(`Admin i18n check failed:\n${errors.map((error) => `- ${error}`).join('\n')}`)
  process.exit(1)
}

console.log(`Admin i18n check passed: ${reference.size} admin dictionary keys, ${usedKeys.size} admin keys in use.`)
if (hardcoded.length) {
  console.log(`Admin i18n audit: ${hardcoded.length} potentially hardcoded Cyrillic UI strings remain.`)
  if (process.argv.includes('--strict')) {
    console.error(hardcoded.join('\n'))
    process.exit(1)
  }
}
