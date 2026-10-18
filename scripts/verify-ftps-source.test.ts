import { readFileSync } from 'fs'
import { describe, expect, it } from 'vitest'

// verify:ftps runs from Plesk (Node.js → Run script) inside the app root on the
// production-like host: it must stay database-free and must not leave XML there.
describe('verify:ftps contract', () => {
  const script = readFileSync('scripts/verify-ftps-source.ts', 'utf-8')
  const scripts = JSON.parse(readFileSync('package.json', 'utf-8')).scripts as Record<string, string>

  it('reads the primary source with manifest and saves nothing', () => {
    expect(scripts['verify:ftps']).toBe('tsx scripts/verify-ftps-source.ts --source primary --manifest --no-save')
    expect(script).toMatch(/if \(save && result\.content !== undefined/u)
  })

  it('never touches the database', () => {
    expect(script).not.toMatch(/@\/lib\/prisma|@prisma|generated\/prisma/u)
  })

  it('reads run-files through the same one-session reader as the scheduled stock sync', () => {
    expect(script).toMatch(/readFtpsRunFilesSnapshot\(ftps,/u)
    expect(script).not.toMatch(/resolveFtpsRunFiles/u)
    expect(readFileSync('scripts/sync-products.ts', 'utf-8')).toMatch(/readRunFiles: \(\) => readFtpsRunFilesSnapshot\(stockFtpsConfig\(\),/u)
  })
})
