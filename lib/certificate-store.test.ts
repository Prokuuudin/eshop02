import { describe, it, expect, vi } from 'vitest'
import {
  certKey,
  parseDataUrl,
  saveCertificate,
  readCertificate,
  deleteCertificate,
  MAX_CERT_DATA_LENGTH,
} from './certificate-store'
import type { ExtendedPrismaClient } from '@/lib/prisma'

const JPEG_URL = 'data:image/jpeg;base64,' + Buffer.from('fake-jpeg').toString('base64')

describe('certKey', () => {
  it('строит ключ KV по id заявки', () => {
    expect(certKey('req1')).toBe('access-request-cert-req1')
  })
})

describe('parseDataUrl', () => {
  it('data URL → contentType и байты', () => {
    const parsed = parseDataUrl(JPEG_URL)!
    expect(parsed.contentType).toBe('image/jpeg')
    expect(Buffer.from(parsed.buffer).toString()).toBe('fake-jpeg')
  })

  it('pdf проходит', () => {
    const url = 'data:application/pdf;base64,' + Buffer.from('%PDF').toString('base64')
    expect(parseDataUrl(url)!.contentType).toBe('application/pdf')
  })

  it('мусор и опасные типы → null', () => {
    expect(parseDataUrl('not-a-data-url')).toBeNull()
    expect(parseDataUrl('data:text/html;base64,PGI+')).toBeNull()
  })
})

describe('save/read/delete', () => {
  it('saveCertificate кладёт данные в KV по ключу заявки', async () => {
    const upsert = vi.fn()
    const db = { keyValueSetting: { upsert } } as unknown as ExtendedPrismaClient
    await saveCertificate(db, 'req1', { data: JPEG_URL, name: 'diploms.jpg' })
    const args = upsert.mock.calls[0][0]
    expect(args.where.key).toBe('access-request-cert-req1')
    expect(args.create.value.data).toBe(JPEG_URL)
    expect(args.create.value.name).toBe('diploms.jpg')
  })

  it('readCertificate возвращает null если ключа нет', async () => {
    const db = {
      keyValueSetting: { findUnique: vi.fn().mockResolvedValue(null) },
    } as unknown as ExtendedPrismaClient
    expect(await readCertificate(db, 'req1')).toBeNull()
  })

  it('deleteCertificate удаляет ключ идемпотентно', async () => {
    const deleteMany = vi.fn().mockResolvedValue({ count: 0 })
    const db = { keyValueSetting: { deleteMany } } as unknown as ExtendedPrismaClient
    await deleteCertificate(db, 'req1')
    expect(deleteMany.mock.calls[0][0].where.key).toBe('access-request-cert-req1')
  })
})

describe('MAX_CERT_DATA_LENGTH', () => {
  it('влезает в лимит запроса Vercel (~4.5 МБ), но не меньше 1 МБ полезного', () => {
    expect(MAX_CERT_DATA_LENGTH).toBeGreaterThanOrEqual(1_400_000)
    expect(MAX_CERT_DATA_LENGTH).toBeLessThanOrEqual(3_000_000)
  })
})
