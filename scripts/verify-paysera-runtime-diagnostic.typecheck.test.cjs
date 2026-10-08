const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

// Exercise main's environment gate with mocked file reads and a blocked Prisma import.
// No database, HTTP request or real environment mutation is possible in this fixture.
const source = fs.readFileSync(path.join(__dirname, 'verify-paysera-runtime-diagnostic.ts'), 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText

function fixture(overrides = {}) {
  const root = path.resolve('C:/Inetpub/vhosts/hairshoppro.lv/staging-httpdocs')
  const config = {
    STAGING_SITE_URL: 'https://staging.hairshoppro.lv',
    STAGING_RELEASE_SHA: '0cbb7df0475d4518beb6f3c65fab589a998a8992',
    STAGING_NEON_BRANCH_NAME: 'delivery-staging-2026-10-06',
    STAGING_EXPECTED_NEON_HOST: 'ep-plain-pine-aqlhpigq.c-8.us-east-1.aws.neon.tech',
    STAGING_HOST_ALLOWLIST_CONFIRMED: true,
    STAGING_ENV_SOURCE: 'owner-confirmed-plesk-staging',
    STAGING_PAYSERA_TEST_MODE_CONFIRMED: true,
    STAGING_ENV_FILE: path.resolve(root, '.env.local'),
  }
  const env = {
    DATABASE_URL: `postgresql://fixture:fixture@${config.STAGING_EXPECTED_NEON_HOST}/fixture?sslmode=require`,
    NEXT_PUBLIC_SITE_URL: config.STAGING_SITE_URL,
    PAYSERA_CLIENT_ID: 'fixture', PAYSERA_CLIENT_SECRET: 'fixture', PAYSERA_PROJECT_ID: 'fixture',
    ...overrides,
  }
  const childProcess = {
    argv: ['node', 'fixture-tests', 'gate', 'config.json'], cwd: () => root,
    env: { NODE_ENV: 'development', KEEP: 'fixture', POSTGRES_URL: 'must-be-removed' },
  }
  const exportsObject = {}
  let importAttempts = 0
  vm.runInNewContext(compiled, {
    exports: exportsObject, module: { exports: exportsObject }, process: childProcess,
    URL, console, AbortSignal,
    require: name => {
      if (name === 'node:fs/promises') return { readFile: async file => file === config.STAGING_ENV_FILE ? 'fixture-env' : JSON.stringify(config) }
      if (name === 'node:util') return { parseEnv: () => env }
      if (name.startsWith('node:')) return require(name)
      importAttempts++
      throw new Error('fixture blocks application import')
    },
  })
  return { ...exportsObject, childProcess, importAttempts: () => importAttempts }
}

for (const databaseUrl of [undefined, 'not-a-url']) {
  test(`invalid database URL (${databaseUrl}) fails before application import`, async () => {
    const f = fixture({ DATABASE_URL: databaseUrl })
    await assert.rejects(f.main(), error => f.safeCode(error) === 'RUNTIME_DB_URL_PARSE_FAILED')
    assert.equal(f.importAttempts(), 0)
    assert.equal(f.childProcess.env.NODE_ENV, 'development')
  })
}

for (const credential of [undefined, 'present']) {
  test(`invalid GrinS credential (${credential}) fails closed`, async () => {
    const f = fixture({ GRINS_HOST: credential })
    await assert.rejects(f.main(), error => f.safeCode(error) === 'GRINS_CREDENTIALS_PRESENT')
    assert.equal(f.importAttempts(), 0)
  })
}

test('valid environment sets production and clears alternate URLs only in the child', async () => {
  const f = fixture({ GRINS_HOST: '  ' })
  const originalEnv = f.childProcess.env
  await assert.rejects(f.main(), error => f.safeCode(error) === 'RUNTIME_PRISMA_IMPORT_OR_INIT_FAILED')
  assert.equal(f.importAttempts(), 1)
  assert.equal(f.childProcess.env.NODE_ENV, 'production')
  assert.equal(f.childProcess.env.KEEP, 'fixture')
  assert.equal(f.childProcess.env.POSTGRES_URL, undefined)
  assert.match(f.childProcess.env.DATABASE_URL, /^postgresql:/)
  assert.equal(originalEnv.NODE_ENV, 'development')
})
