import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

const accessMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const downloadToMock = vi.hoisted(() =>
  vi.fn().mockImplementation(async (sink: NodeJS.WritableStream) => {
    sink.write(Buffer.from('<root></root>'))
    sink.end()
  }),
)
const closeMock = vi.hoisted(() => vi.fn())

vi.mock('basic-ftp', () => ({
  Client: vi.fn().mockImplementation(() => ({
    access: accessMock,
    downloadTo: downloadToMock,
    close: closeMock,
  })),
}))

import { Client } from 'basic-ftp'
import { getFtpsConfigFromEnv, downloadFtpsFile } from './ftps-client'

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

describe('downloadFtpsFile', () => {
  beforeEach(() => vi.clearAllMocks())

  it('connects with explicit TLS, downloads the configured path, and returns its text', async () => {
    const config = { host: 'h', user: 'u', password: 'p', remotePath: 'export.xml' }
    const result = await downloadFtpsFile(config)
    expect(accessMock).toHaveBeenCalledWith({ host: 'h', user: 'u', password: 'p', secure: true })
    expect(downloadToMock).toHaveBeenCalledWith(expect.anything(), 'export.xml')
    expect(result).toBe('<root></root>')
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
