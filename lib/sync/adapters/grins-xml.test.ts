import { describe, expect, it, vi, beforeEach } from 'vitest'

const getFtpsConfigFromEnvMock = vi.hoisted(() => vi.fn())
const downloadFtpsFileMock = vi.hoisted(() => vi.fn())
const saveSnapshotMock = vi.hoisted(() => vi.fn())
const parseGrinsXmlMock = vi.hoisted(() => vi.fn())

vi.mock('../ftps-client', () => ({
  getFtpsConfigFromEnv: getFtpsConfigFromEnvMock,
  downloadFtpsFile: downloadFtpsFileMock,
}))
vi.mock('../xml-snapshot-store', () => ({
  saveSnapshot: saveSnapshotMock,
}))
vi.mock('../grins-xml-parser', () => ({
  parseGrinsXml: parseGrinsXmlMock,
}))

import { GrinsXmlAdapter } from './grins-xml'

beforeEach(() => {
  vi.clearAllMocks()
  getFtpsConfigFromEnvMock.mockReturnValue({ host: 'h', user: 'u', password: 'p', remotePath: 'export.xml' })
  downloadFtpsFileMock.mockResolvedValue('<root>...</root>')
  saveSnapshotMock.mockResolvedValue({ slot: 0, checksum: 'abc', sizeBytes: 10, downloadedAt: 'now' })
  parseGrinsXmlMock.mockReturnValue([{ externalId: 'e1', title: 'e1', price: 1, stock: 1 }])
})

describe('GrinsXmlAdapter', () => {
  it('downloads, snapshots, then parses, in that order', async () => {
    const adapter = new GrinsXmlAdapter()
    await adapter.fetchPage()

    expect(downloadFtpsFileMock).toHaveBeenCalledWith({ host: 'h', user: 'u', password: 'p', remotePath: 'export.xml' })
    expect(saveSnapshotMock).toHaveBeenCalledWith('<root>...</root>')
    expect(parseGrinsXmlMock).toHaveBeenCalledWith('<root>...</root>')

    const downloadOrder = downloadFtpsFileMock.mock.invocationCallOrder[0]
    const snapshotOrder = saveSnapshotMock.mock.invocationCallOrder[0]
    const parseOrder = parseGrinsXmlMock.mock.invocationCallOrder[0]
    expect(downloadOrder).toBeLessThan(snapshotOrder)
    expect(snapshotOrder).toBeLessThan(parseOrder)
  })

  it('returns a single full page — hasMore is always false', async () => {
    const adapter = new GrinsXmlAdapter()
    const result = await adapter.fetchPage()
    expect(result.hasMore).toBe(false)
    expect(result.products).toEqual([{ externalId: 'e1', title: 'e1', price: 1, stock: 1 }])
  })

  it('exposes a stable adapter name', () => {
    expect(new GrinsXmlAdapter().name).toBe('grins-xml')
  })
})
