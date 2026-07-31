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

// Clamps a stored nextSlot to a valid slot index so a corrupted/out-of-range stored
// value (e.g. from manual KV editing or a future schema change) can't make saveSnapshot
// write to a nonsensical content key.
function clampSlot(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.min(Math.max(0, Math.trunc(n)), MAX_SNAPSHOTS - 1)
}

async function getIndex(): Promise<SnapshotIndex> {
  const row = await prisma.keyValueSetting.findUnique({ where: { key: INDEX_KEY } })
  const parsed = row?.value as Partial<SnapshotIndex> | undefined
  return {
    nextSlot: typeof parsed?.nextSlot === 'number' ? clampSlot(parsed.nextSlot) : 0,
    entries: Array.isArray(parsed?.entries) ? parsed.entries : [],
  }
}

export async function getSnapshotHistory(): Promise<SnapshotMeta[]> {
  return (await getIndex()).entries
}

export async function saveSnapshot(xml: string): Promise<SnapshotMeta> {
  const index = await getIndex()
  const checksum = checksumOf(xml)

  // index.entries[0] is always the most recently written snapshot (saveSnapshot
  // unshifts the new entry on every write — see below). If this call's payload is
  // byte-identical to it, skip the write entirely instead of rotating the slot.
  //
  // Why this matters: the adapter calls saveSnapshot before parsing (grins-xml.ts),
  // and sync-runner retries a failing fetchPage up to 3 times per page across up to 5
  // consecutive failed pages before aborting. If a download succeeds but the payload is
  // bad/truncated (parse throws), that's up to ~15 saveSnapshot calls with the same bad
  // content in one failing run — enough to rotate through and destroy every previously
  // good snapshot in the 3-slot rollback trail, right when it's needed most.
  const mostRecent = index.entries[0]
  if (mostRecent && mostRecent.checksum === checksum) {
    return mostRecent
  }

  const slot = index.nextSlot

  const meta: SnapshotMeta = {
    slot,
    checksum,
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
