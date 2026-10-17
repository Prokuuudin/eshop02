import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

const accessMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const downloadToMock = vi.hoisted(() =>
  vi.fn().mockImplementation(async (sink: NodeJS.WritableStream) => {
    sink.write(Buffer.from('<root></root>'))
    sink.end()
  }),
)
const closeMock = vi.hoisted(() => vi.fn())
const listMock = vi.hoisted(() => vi.fn().mockResolvedValue([]))

vi.mock('basic-ftp', () => ({
  Client: vi.fn().mockImplementation(() => ({
    access: accessMock,
    downloadTo: downloadToMock,
    close: closeMock,
    list: listMock,
  })),
}))

import { Client } from 'basic-ftp'
import { getFtpsConfigForSource, getFtpsConfigFromEnv, downloadFtpsFile, resolveFtpsRunFiles } from './ftps-client'

describe('getFtpsConfigFromEnv', () => {
  const ORIGINAL_ENV = process.env

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV }
  })

  afterEach(() => {
    process.env = ORIGINAL_ENV
  })

  it('throws when required env vars are missing', () => {
    delete process.env.GRINS_FTPS_HOST
    delete process.env.GRINS_FTPS_USER
    delete process.env.GRINS_FTPS_PASSWORD
    expect(() => getFtpsConfigFromEnv()).toThrow(/GRINS_FTPS_HOST/)
  })

  it('defaults remotePath to export.xml', () => {
    process.env.GRINS_FTPS_HOST = 'host'
    process.env.GRINS_FTPS_USER = 'user'
    process.env.GRINS_FTPS_PASSWORD = 'pass'
    delete process.env.GRINS_FTPS_REMOTE_PATH
    expect(getFtpsConfigFromEnv().remotePath).toBe('export.xml')
  })

  it('reads all four values when set', () => {
    process.env.GRINS_FTPS_HOST = 'ftp.example.com'
    process.env.GRINS_FTPS_USER = 'hairshop-pro'
    process.env.GRINS_FTPS_PASSWORD = 'secret'
    process.env.GRINS_FTPS_REMOTE_PATH = 'custom.xml'
    expect(getFtpsConfigFromEnv()).toEqual({
      host: 'ftp.example.com',
      user: 'hairshop-pro',
      password: 'secret',
      remotePath: 'custom.xml',
    })
  })
})

describe('getFtpsConfigForSource (FTPS source migration)', () => {
  const env = (vars: Record<string, string>) => vars as unknown as NodeJS.ProcessEnv
  const PRIMARY = { GRINS_FTPS_HOST: 'old.example', GRINS_FTPS_USER: 'old-user', GRINS_FTPS_PASSWORD: 'old-pass', GRINS_FTPS_REMOTE_PATH: 'export.xml' }
  const CANDIDATE = { GRINS_FTPS_CANDIDATE_HOST: 'new.example', GRINS_FTPS_CANDIDATE_USER: 'new-user', GRINS_FTPS_CANDIDATE_PASSWORD: 'new-pass', GRINS_FTPS_CANDIDATE_REMOTE_PATH: 'pro/export.xml', GRINS_FTPS_CANDIDATE_PORT: '2121' }
  const ORIGINAL_ENV = process.env
  afterEach(() => { process.env = ORIGINAL_ENV })

  it('reads the candidate source only from GRINS_FTPS_CANDIDATE_*', () => {
    expect(getFtpsConfigForSource('candidate', env({ ...PRIMARY, ...CANDIDATE }))).toEqual({ host: 'new.example', user: 'new-user', password: 'new-pass', remotePath: 'pro/export.xml', port: 2121 })
  })

  it('never fills missing candidate values from the primary source', () => {
    expect(() => getFtpsConfigForSource('candidate', env({ ...PRIMARY, GRINS_FTPS_CANDIDATE_HOST: 'new.example' }))).toThrow(/GRINS_FTPS_CANDIDATE_USER/)
  })

  it('production config (scheduled sync) ignores candidate variables entirely', () => {
    process.env = env({ ...CANDIDATE })
    expect(() => getFtpsConfigFromEnv()).toThrow(/GRINS_FTPS_HOST/)
    process.env = env({ ...PRIMARY, ...CANDIDATE })
    expect(getFtpsConfigFromEnv()).toEqual({ host: 'old.example', user: 'old-user', password: 'old-pass', remotePath: 'export.xml' })
  })

  it('accepts an optional primary port and rejects invalid ports', () => {
    expect(getFtpsConfigForSource('primary', env({ ...PRIMARY, GRINS_FTPS_PORT: '990' })).port).toBe(990)
    expect(getFtpsConfigForSource('primary', env({ ...PRIMARY, GRINS_FTPS_PORT: '' }))).not.toHaveProperty('port')
    expect(() => getFtpsConfigForSource('primary', env({ ...PRIMARY, GRINS_FTPS_PORT: 'abc' }))).toThrow(/GRINS_FTPS_PORT/)
    expect(() => getFtpsConfigForSource('candidate', env({ ...CANDIDATE, GRINS_FTPS_CANDIDATE_PORT: '70000' }))).toThrow(/GRINS_FTPS_CANDIDATE_PORT/)
  })
})

describe('downloadFtpsFile', () => {
  beforeEach(() => vi.clearAllMocks())

  it('connects with explicit TLS, downloads the configured path, and returns its text', async () => {
    const config = { host: 'h', user: 'u', password: 'p', remotePath: 'export.xml' }
    const result = await downloadFtpsFile(config)
    expect(accessMock).toHaveBeenCalledWith({ host: 'h', user: 'u', password: 'p', secure: true })
    expect(downloadToMock).toHaveBeenCalledWith(expect.anything(), 'export.xml')
    expect(result).toBe('<root></root>')
  })

  it('passes a configured port to the explicit-TLS connection', async () => {
    await downloadFtpsFile({ host: 'h', user: 'u', password: 'p', remotePath: 'export.xml', port: 2121 })
    expect(accessMock).toHaveBeenCalledWith({ host: 'h', user: 'u', password: 'p', port: 2121, secure: true })
  })

  it('always closes the client, even on failure', async () => {
    accessMock.mockRejectedValueOnce(new Error('connection refused'))
    const config = { host: 'h', user: 'u', password: 'p', remotePath: 'export.xml' }
    await expect(downloadFtpsFile(config)).rejects.toThrow('connection refused')
    expect(closeMock).toHaveBeenCalled()
  })

  it('configures a connection timeout so a hung socket cannot stall a run indefinitely', async () => {
    const config = { host: 'h', user: 'u', password: 'p', remotePath: 'export.xml' }
    await downloadFtpsFile(config)
    expect(Client).toHaveBeenCalledWith(30_000)
  })
})

describe('run-files source layout (GRINS_FTPS_SOURCE_LAYOUT)', () => {
  const env = (vars: Record<string, string>) => vars as unknown as NodeJS.ProcessEnv
  const PRIMARY = { GRINS_FTPS_HOST: 'h', GRINS_FTPS_USER: 'u', GRINS_FTPS_PASSWORD: 'p' }
  const R1 = '20261017T100000000000Z-1'
  const R2 = '20261017T110000000000Z-1'
  const file = (name: string) => ({ name, isFile: true })
  beforeEach(() => vi.clearAllMocks())

  it('keeps the fixed layout (unchanged config) by default', () => {
    expect(getFtpsConfigForSource('primary', env(PRIMARY))).toEqual({ host: 'h', user: 'u', password: 'p', remotePath: 'export.xml' })
    expect(getFtpsConfigForSource('primary', env({ ...PRIMARY, GRINS_FTPS_SOURCE_LAYOUT: 'fixed', GRINS_FTPS_REMOTE_DIR: '/x' }))).not.toHaveProperty('layout')
  })

  it('reads layout and directory per source and validates them', () => {
    expect(getFtpsConfigForSource('primary', env({ ...PRIMARY, GRINS_FTPS_SOURCE_LAYOUT: 'run-files', GRINS_FTPS_REMOTE_DIR: '/grins-feed/' })))
      .toMatchObject({ layout: 'run-files', remoteDir: '/grins-feed' })
    expect(getFtpsConfigForSource('candidate', env({ GRINS_FTPS_CANDIDATE_HOST: 'h', GRINS_FTPS_CANDIDATE_USER: 'u', GRINS_FTPS_CANDIDATE_PASSWORD: 'p', GRINS_FTPS_CANDIDATE_SOURCE_LAYOUT: 'run-files' })))
      .toMatchObject({ layout: 'run-files', remoteDir: '' })
    expect(() => getFtpsConfigForSource('primary', env({ ...PRIMARY, GRINS_FTPS_SOURCE_LAYOUT: 'latest' }))).toThrow(/GRINS_FTPS_SOURCE_LAYOUT/)
    expect(() => getFtpsConfigForSource('primary', env({ ...PRIMARY, GRINS_FTPS_SOURCE_LAYOUT: 'run-files', GRINS_FTPS_REMOTE_DIR: '../up' }))).toThrow(/GRINS_FTPS_REMOTE_DIR/)
  })

  it('lists the directory over explicit TLS and selects the newest complete pair', async () => {
    listMock.mockResolvedValueOnce([
      file(`export-${R1}.xml`), file(`export-${R1}.manifest.json`), file(`export-${R2}.xml`),
      { name: `export-${R2}.manifest.json`, isFile: false },
    ])
    const selection = await resolveFtpsRunFiles({ host: 'h', user: 'u', password: 'p', remotePath: 'export.xml', layout: 'run-files', remoteDir: '/grins-feed' })
    expect(accessMock).toHaveBeenCalledWith({ host: 'h', user: 'u', password: 'p', secure: true })
    expect(listMock).toHaveBeenCalledWith('/grins-feed')
    expect(selection.runId).toBe(R1)
    expect(selection.manifestPath).toBe(`/grins-feed/export-${R1}.manifest.json`)
    expect(closeMock).toHaveBeenCalled()
  })

  it('fails closed without a complete pair and still closes the client', async () => {
    listMock.mockResolvedValueOnce([file(`export-${R2}.xml`)])
    await expect(resolveFtpsRunFiles({ host: 'h', user: 'u', password: 'p', remotePath: 'export.xml', layout: 'run-files', remoteDir: '' }))
      .rejects.toThrow('no_complete_export')
    expect(closeMock).toHaveBeenCalled()
  })

  it('refuses a fixed-path download (FULL, backfill, compare) for a run-files source', async () => {
    const config = { host: 'h', user: 'u', password: 'p', remotePath: 'export.xml', layout: 'run-files' as const, remoteDir: '' }
    await expect(downloadFtpsFile(config)).rejects.toThrow(/run_files_layout_requires_a_selected_run_file/)
    expect(accessMock).not.toHaveBeenCalled()
    await downloadFtpsFile({ ...config, remotePath: `/grins-feed/export-${R1}.xml` })
    expect(downloadToMock).toHaveBeenCalledWith(expect.anything(), `/grins-feed/export-${R1}.xml`)
  })
})
