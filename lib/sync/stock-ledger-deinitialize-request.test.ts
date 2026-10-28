import { mkdirSync, mkdtempSync, rmSync } from 'fs'
import os from 'os'
import path from 'path'
import { afterAll, describe, expect, it } from 'vitest'
import { MAX_REQUEST_LIFETIME_MS, assertPrivatePath, parseDeinitializeRequest } from './stock-ledger-deinitialize-request'

const base = mkdtempSync(path.join(os.tmpdir(), 'deinit-request-'))
const appRoot = path.join(base, 'vhost', 'staging-httpdocs')
const privateDir = path.join(base, 'vhost', 'grins-ops')
const httpdocsChild = path.join(base, 'vhost', 'httpdocs', 'ops')
for (const dir of [appRoot, path.join(appRoot, 'ops'), privateDir, httpdocsChild]) mkdirSync(dir, { recursive: true })
afterAll(() => rmSync(base, { recursive: true, force: true }))

const now = new Date('2026-10-13T10:00:00Z')
const request = {
  requestId: '11111111-1111-4111-8111-111111111111',
  target: 'staging',
  environmentProfile: 'C:\\private\\grins-environments.json',
  confirmOperation: '22222222-2222-4222-8222-222222222222',
  actor: 'admin-user',
  notAfter: '2026-10-13T10:30:00Z',
}
const raw = (patch: Record<string, unknown> = {}) => JSON.stringify({ ...request, ...patch })

describe('deinitialize request: private location', () => {
  it('accepts an absolute existing directory outside the app root', () => {
    expect(assertPrivatePath(privateDir, appRoot, 'operations_dir').toLowerCase()).toBe(privateDir.toLowerCase())
  })

  it('refuses relative, missing, in-app-root and web-served locations', () => {
    expect(() => assertPrivatePath(undefined, appRoot, 'operations_dir')).toThrow('operations_dir_not_private')
    expect(() => assertPrivatePath('grins-ops', appRoot, 'operations_dir')).toThrow('operations_dir_not_private')
    expect(() => assertPrivatePath(path.join(base, 'absent'), appRoot, 'operations_dir')).toThrow('operations_dir_missing')
    expect(() => assertPrivatePath(appRoot, appRoot, 'operations_dir')).toThrow('operations_dir_not_private')
    expect(() => assertPrivatePath(path.join(appRoot, 'ops'), appRoot, 'operations_dir')).toThrow('operations_dir_not_private')
    expect(() => assertPrivatePath(httpdocsChild, appRoot, 'environment_profile')).toThrow('environment_profile_not_private')
  })
})

describe('deinitialize request: content', () => {
  it('accepts a complete dry-run request', () => {
    expect(parseDeinitializeRequest(raw(), 'dry-run', now).requestId).toBe(request.requestId)
  })

  it('requires the instanceId confirmation and the dry-run fingerprint for execute', () => {
    expect(() => parseDeinitializeRequest(raw(), 'execute', now)).toThrow('operation_request_invalid')
    expect(() => parseDeinitializeRequest(raw({ confirmDeinitialize: request.confirmOperation, dryRunFingerprint: 'abc' }), 'execute', now))
      .toThrow('operation_request_invalid')
    expect(parseDeinitializeRequest(raw({ confirmDeinitialize: request.confirmOperation, dryRunFingerprint: 'a'.repeat(64) }), 'execute', now).dryRunFingerprint)
      .toBe('a'.repeat(64))
  })

  it('rejects malformed JSON, missing fields, bad ids and unknown targets', () => {
    expect(() => parseDeinitializeRequest('{', 'dry-run', now)).toThrow('operation_request_invalid')
    expect(() => parseDeinitializeRequest(raw({ requestId: 'not-a-uuid' }), 'dry-run', now)).toThrow('operation_request_invalid')
    expect(() => parseDeinitializeRequest(raw({ target: 'dev' }), 'dry-run', now)).toThrow('operation_request_invalid')
    expect(() => parseDeinitializeRequest(raw({ actor: '' }), 'dry-run', now)).toThrow('operation_request_invalid')
    expect(() => parseDeinitializeRequest(raw({ notAfter: 'tomorrow' }), 'dry-run', now)).toThrow('operation_request_invalid')
  })

  it('enforces expiry and a bounded lifetime', () => {
    expect(() => parseDeinitializeRequest(raw({ notAfter: '2026-10-13T09:59:59Z' }), 'dry-run', now)).toThrow('operation_request_expired')
    expect(() => parseDeinitializeRequest(raw({ notAfter: now.toISOString() }), 'dry-run', now)).toThrow('operation_request_expired')
    const tooLong = new Date(now.getTime() + MAX_REQUEST_LIFETIME_MS + 1_000).toISOString()
    expect(() => parseDeinitializeRequest(raw({ notAfter: tooLong }), 'dry-run', now)).toThrow('operation_request_lifetime_too_long')
  })
})
