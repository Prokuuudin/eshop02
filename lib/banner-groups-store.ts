import 'server-only'
import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@/generated/prisma/client'
import type { ExtendedTransactionClient } from '@/lib/prisma'
import { appendServerAudit } from '@/lib/server-audit'
import type { ServerUser } from '@/lib/server-auth'

// Named after the homepage section each zone's block renders next to;
// 'catalog' banners render as product-sized tiles inside the catalog grid.
export const BANNER_ZONES = [
  'top', 'hero', 'benefits', 'sale', 'bestsellers', 'categories', 'brands',
  'productRequest', 'retail', 'bonus', 'faq', 'catalog',
] as const

export type BannerZone = typeof BANNER_ZONES[number]
export type BannerDisplayType = 'list' | 'carousel'
export type BannerScrollMode = 'manual' | 'auto'

export type BannerGroup = {
  id: string
  name: string
  zone: BannerZone
  displayType: BannerDisplayType
  // Only meaningful when displayType is 'carousel'.
  scrollMode: BannerScrollMode
  order: number
}

export const DEFAULT_GROUP_ID = 'default'

const DEFAULT_GROUP: BannerGroup = {
  id: DEFAULT_GROUP_ID,
  name: 'Акции',
  zone: 'sale',
  displayType: 'list',
  scrollMode: 'auto',
  order: 0,
}

const BANNER_GROUPS_KEY = 'banner-groups'
type AuditContext = { actor: ServerUser; request: NextRequest }
type Tx = ExtendedTransactionClient

function isBannerZone(value: unknown): value is BannerZone {
  return typeof value === 'string' && (BANNER_ZONES as readonly string[]).includes(value)
}

function normalizeGroup(input: Partial<BannerGroup>, order: number): BannerGroup | null {
  if (typeof input.id !== 'string' || !input.id.trim()) return null
  return {
    id: input.id,
    name: typeof input.name === 'string' && input.name.trim() ? input.name.trim() : input.id,
    zone: isBannerZone(input.zone) ? input.zone : 'sale',
    displayType: input.displayType === 'carousel' ? 'carousel' : 'list',
    scrollMode: input.scrollMode === 'manual' ? 'manual' : 'auto',
    order: typeof input.order === 'number' ? input.order : order,
  }
}

function groupsFromValue(value: unknown): BannerGroup[] {
  const stored = (value as { groups?: Partial<BannerGroup>[] } | null)?.groups
  const groups = (stored ?? [])
    .map((item, index) => normalizeGroup(item, index))
    .filter((item): item is BannerGroup => item !== null)
  if (!groups.some((group) => group.id === DEFAULT_GROUP_ID)) groups.unshift(DEFAULT_GROUP)
  return groups.sort((a, b) => a.order - b.order)
}

export async function getBannerGroupsTx(tx: Pick<Tx, 'keyValueSetting'>): Promise<BannerGroup[]> {
  const row = await tx.keyValueSetting.findUnique({ where: { key: BANNER_GROUPS_KEY } })
  return groupsFromValue(row?.value ?? null)
}

export async function getBannerGroups(): Promise<BannerGroup[]> {
  const row = await prisma.keyValueSetting.findUnique({ where: { key: BANNER_GROUPS_KEY } })
  return groupsFromValue(row?.value ?? null)
}

const GROUP_FIELDS = ['name', 'zone', 'displayType', 'scrollMode', 'order'] as const

function groupChanges(before: BannerGroup[], after: BannerGroup[]) {
  const beforeById = new Map(before.map((group) => [group.id, group]))
  const afterById = new Map(after.map((group) => [group.id, group]))
  const ids = [...new Set([...beforeById.keys(), ...afterById.keys()])].sort()
  const previous: Array<Record<string, unknown>> = []
  const next: Array<Record<string, unknown>> = []
  for (const id of ids) {
    const oldGroup = beforeById.get(id)
    const newGroup = afterById.get(id)
    const fields = GROUP_FIELDS.filter((field) => oldGroup?.[field] !== newGroup?.[field])
    if (fields.length === 0) continue
    previous.push({ id, ...Object.fromEntries(fields.map((field) => [field, oldGroup?.[field] ?? null])) })
    next.push({ id, ...Object.fromEntries(fields.map((field) => [field, newGroup?.[field] ?? null])) })
  }
  return { before: { groups: previous }, after: { groups: next }, changed: next.length > 0 }
}

export async function saveBannerGroups(
  groups: BannerGroup[],
  audit: AuditContext,
): Promise<{ groups: BannerGroup[]; changed: boolean }> {
  const normalized = groups
    .map((item, index) => normalizeGroup(item, index))
    .filter((item): item is BannerGroup => item !== null)
  if (!normalized.some((group) => group.id === DEFAULT_GROUP_ID)) normalized.unshift(DEFAULT_GROUP)
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${BANNER_GROUPS_KEY}))`
    const before = await getBannerGroupsTx(tx)
    const changes = groupChanges(before, normalized)
    if (!changes.changed) return { groups: before, changed: false }
    await tx.keyValueSetting.upsert({
      where: { key: BANNER_GROUPS_KEY },
      create: { key: BANNER_GROUPS_KEY, value: { groups: normalized } as unknown as Prisma.InputJsonValue },
      update: { value: { groups: normalized } as unknown as Prisma.InputJsonValue },
    })
    await appendServerAudit(tx, audit.request, audit.actor, {
      action: 'banner_groups.updated', entityType: 'banner_group_config', entityId: BANNER_GROUPS_KEY,
      before: changes.before, after: changes.after,
    })
    return { groups: normalized, changed: true }
  })
}
