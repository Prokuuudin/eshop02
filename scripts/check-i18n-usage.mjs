import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

const root = process.cwd()
const languages = ['ru', 'en', 'lv']
const sourceRoots = ['app/[lang]', 'components', 'hooks', 'lib']
const translationKeyPattern = /^[a-z][a-zA-Z0-9_-]*(?:\.[a-zA-Z0-9_-]+)+$/
const dictionaryKeyPattern = /['"]([^'"]+)['"]\s*:/g
const runtimeContentKeys = /^(?:company\.|legal\.|footer\.(?:instagram|facebook|tiktok|youtube)Url$|notFound\.(?:code|icon\.))/

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name)
    return entry.isDirectory() ? walk(target) : [target]
  })
}

function dictionaryFiles(language) {
  return [
    path.join(root, 'data', 'translations', `${language}.ts`),
    ...walk(path.join(root, 'data', 'translations', language)).filter((file) => file.endsWith('.ts')),
  ]
}

const dictionaries = Object.fromEntries(
  languages.map((language) => {
    const keys = new Set()
    for (const file of dictionaryFiles(language)) {
      for (const match of fs.readFileSync(file, 'utf8').matchAll(dictionaryKeyPattern)) {
        keys.add(match[1])
      }
    }
    return [language, keys]
  })
)

const dictionaryUnion = new Set(languages.flatMap((language) => [...dictionaries[language]]))
const errors = []
for (const key of dictionaryUnion) {
  const missing = languages.filter((language) => !dictionaries[language].has(key))
  if (missing.length > 0) {
    errors.push(`translation dictionaries: ${key} missing in ${missing.join(', ')}`)
  }
}

const sourceFiles = sourceRoots
  .flatMap((directory) => walk(path.join(root, directory)))
  .filter((file) => /\.(?:ts|tsx)$/.test(file) && !/\.(?:test|spec)\./.test(file))

for (const file of sourceFiles) {
  const sourceText = fs.readFileSync(file, 'utf8')
  const source = ts.createSourceFile(
    file,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  )

  function visit(node) {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 't' &&
      node.arguments.length > 0 &&
      ts.isStringLiteralLike(node.arguments[0])
    ) {
      const key = node.arguments[0].text
      if (translationKeyPattern.test(key) && !runtimeContentKeys.test(key)) {
        const missing = languages.filter((language) => !dictionaries[language].has(key))
        if (missing.length > 0) {
          const position = source.getLineAndCharacterOfPosition(node.getStart(source))
          errors.push(
            `${path.relative(root, file)}:${position.line + 1}: ${key} missing in ${missing.join(', ')}`
          )
        }
      }
    }
    ts.forEachChild(node, visit)
  }

  visit(source)
}

const breadcrumbsFile = path.join(root, 'components', 'AppBreadcrumbs.tsx')
const breadcrumbsSource = ts.createSourceFile(
  breadcrumbsFile,
  fs.readFileSync(breadcrumbsFile, 'utf8'),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX
)
const breadcrumbSegments = new Set()

function collectBreadcrumbSegments(node) {
  if (
    ts.isVariableDeclaration(node) &&
    ts.isIdentifier(node.name) &&
    node.name.text === 'segmentLabelKeys' &&
    node.initializer &&
    ts.isObjectLiteralExpression(node.initializer)
  ) {
    for (const property of node.initializer.properties) {
      if (!ts.isPropertyAssignment(property) || !ts.isStringLiteralLike(property.initializer)) continue
      const segment = ts.isIdentifier(property.name) || ts.isStringLiteralLike(property.name)
        ? property.name.text
        : null
      if (!segment) continue
      breadcrumbSegments.add(segment)
      const key = property.initializer.text
      const missing = languages.filter((language) => !dictionaries[language].has(key))
      if (missing.length > 0) {
        errors.push(`components/AppBreadcrumbs.tsx: ${key} missing in ${missing.join(', ')}`)
      }
    }
  }
  ts.forEachChild(node, collectBreadcrumbSegments)
}

collectBreadcrumbSegments(breadcrumbsSource)

const routeSegments = new Set(
  walk(path.join(root, 'app', '[lang]'))
    .filter((file) => /(?:^|\\|\/)page\.tsx$/.test(file))
    .flatMap((file) => path.relative(path.join(root, 'app', '[lang]'), path.dirname(file)).split(path.sep))
    .filter((segment) => segment && !segment.startsWith('['))
)
for (const segment of routeSegments) {
  if (!breadcrumbSegments.has(segment) && segment !== 'category') {
    errors.push(`components/AppBreadcrumbs.tsx: route segment "${segment}" has no localized label`)
  }
}

if (errors.length > 0) {
  console.error(`Translation usage check failed:\n${errors.map((error) => `- ${error}`).join('\n')}`)
  process.exit(1)
}

console.log(`Translation usage check passed: ${sourceFiles.length} source files checked.`)
