import { createHash } from 'crypto'
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@/generated/prisma/client'

export interface SnapshotMeta {
  slot: number
  checksum: string
  sizeBytes: number
  downloadedAt: string
}

interface SnapshotIndex {
  nextSlot: number
  entries: SnapshotMeta[]
}

const MAX_SNAPSHOTS = 3
const INDEX_KEY = 'erp-xml-snapshot-index'
const contentKey = (slot: number) => `erp-xml-snapshot-content:${slot}`

export function checksumOf(xml: string): string {
  return createHash('sha256').update(xml, 'utf-8').digest('hex')
}

async function getIndex(): Promise<SnapshotIndex> {
  const row = await prisma.keyValueSetting.findUnique({ where: { key: INDEX_KEY } })
  const parsed = row?.value as Partial<SnapshotIndex> | undefined
  return {
    nextSlot: typeof parsed?.nextSlot === 'number' ? parsed.nextSlot : 0,
    entries: Array.isArray(parsed?.entries) ? parsed.entries : [],
  }
}

export async function getSnapshotHistory(): Promise<SnapshotMeta[]> {
  return (await getIndex()).entries
}

export async function saveSnapshot(xml: string): Promise<SnapshotMeta> {
  const index = await getIndex()
  const slot = index.nextSlot

  const meta: SnapshotMeta = {
    slot,
    checksum: checksumOf(xml),
    sizeBytes: Buffer.byteLength(xml, 'utf-8'),
    downloadedAt: new Date().toISOString(),
  }

  const nextEntries = [meta, ...index.entries.filter(e => e.slot !== slot)].slice(0, MAX_SNAPSHOTS)
  const nextIndex: SnapshotIndex = { nextSlot: (slot + 1) % MAX_SNAPSHOTS, entries: nextEntries }

  await prisma.$transaction([
    prisma.keyValueSetting.upsert({
      where: { key: contentKey(slot) },
      create: { key: contentKey(slot), value: { xml } as unknown as Prisma.InputJsonValue },
      update: { value: { xml } as unknown as Prisma.InputJsonValue },
    }),
    prisma.keyValueSetting.upsert({
      where: { key: INDEX_KEY },
      create: { key: INDEX_KEY, value: nextIndex as unknown as Prisma.InputJsonValue },
      update: { value: nextIndex as unknown as Prisma.InputJsonValue },
    }),
  ])

  return meta
}

export async function getSnapshotContent(slot: number): Promise<string | undefined> {
  const row = await prisma.keyValueSetting.findUnique({ where: { key: contentKey(slot) } })
  const parsed = row?.value as { xml?: string } | undefined
  return parsed?.xml
}
