import 'server-only'
import { createHash } from 'node:crypto'
import type { NextRequest } from 'next/server'
import { Prisma, type Banner as PrismaBanner } from '@/generated/prisma/client'
import { prisma, type ExtendedTransactionClient } from '@/lib/prisma'
import { getBannerGroups, getBannerGroupsTx, DEFAULT_GROUP_ID, type BannerGroup, type BannerZone, type BannerDisplayType, type BannerScrollMode } from '@/lib/banner-groups-store'
import { getBannerGroupAssignments, saveBannerGroupAssignment } from '@/lib/banner-group-assignment-store'
import { appendServerAudit } from '@/lib/server-audit'
import type { ServerUser } from '@/lib/server-auth'

export type BannerType = 'sale' | 'image' | 'video'
export type TextColor = 'light' | 'dark'
export type CtaStyle = 'primary' | 'secondary' | 'outline'
export type BannerPlacement = BannerDisplayType
export type { BannerZone, BannerGroup, BannerScrollMode }
export { BANNER_ZONES } from '@/lib/banner-groups-store'

export type Banner = {
  id: string
  type: BannerType
  title: string
  subtitle: string
  image: string
  link: string
  ctaLabel: string
  ctaStyle: CtaStyle
  bgColor: string
  textColor: TextColor
  active: boolean
  order: number
  groupId: string
  // Derived from the banner's group - kept as plain fields so storefront
  // components don't need to know groups exist.
  placement: BannerPlacement
  zone: BannerZone
  scrollMode: BannerScrollMode
  createdAt: string
  updatedAt: string
}

export type BannersData = {
  banners: Banner[]
}

type AuditContext = { actor: ServerUser; request: NextRequest }
type Tx = ExtendedTransactionClient
const ASSIGNMENTS_KEY = 'banner-group-assignments'
const BANNERS_LOCK_KEY = 'admin-banners'
const MUTABLE_FIELDS = [
  'type', 'title', 'subtitle', 'image', 'link', 'ctaLabel', 'ctaStyle',
  'bgColor', 'textColor', 'active', 'order', 'groupId',
] as const satisfies ReadonlyArray<keyof Banner>

function mapDbToBanner(row: PrismaBanner, assignments: Record<string, string>, groupsById: Map<string, BannerGroup>): Banner {
  const groupId = assignments[row.id] ?? DEFAULT_GROUP_ID
  const group = groupsById.get(groupId) ?? groupsById.get(DEFAULT_GROUP_ID)
  return {
    id: row.id,
    type: row.type as BannerType,
    title: row.title,
    subtitle: row.subtitle,
    image: row.image,
    link: row.link,
    ctaLabel: row.ctaLabel,
    ctaStyle: row.ctaStyle as CtaStyle,
    bgColor: row.bgColor,
    textColor: row.textColor as TextColor,
    active: row.active,
    order: row.order,
    groupId,
    placement: group?.displayType ?? 'list',
    zone: group?.zone ?? 'sale',
    scrollMode: group?.scrollMode ?? 'auto',
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
  }
}

export async function readBannersData(): Promise<BannersData> {
  const [banners, assignments, groups] = await Promise.all([
    prisma.banner.findMany({ orderBy: [{ order: 'asc' }, { id: 'asc' }] }),
    getBannerGroupAssignments(),
    getBannerGroups(),
  ])
  const groupsById = new Map(groups.map((group) => [group.id, group]))
  return { banners: banners.map((row) => mapDbToBanner(row, assignments, groupsById)) }
}

export async function writeBannersData(data: BannersData): Promise<void> {
  await prisma.$transaction(async (tx) => {
    for (const b of data.banners) {
      await tx.banner.upsert({
        where: { id: b.id },
        create: {
          id: b.id, type: b.type, title: b.title, subtitle: b.subtitle,
          image: b.image, link: b.link, ctaLabel: b.ctaLabel, ctaStyle: b.ctaStyle,
          bgColor: b.bgColor, textColor: b.textColor, active: b.active, order: b.order,
        },
        update: {
          type: b.type, title: b.title, subtitle: b.subtitle,
          image: b.image, link: b.link, ctaLabel: b.ctaLabel, ctaStyle: b.ctaStyle,
          bgColor: b.bgColor, textColor: b.textColor, active: b.active, order: b.order,
        },
      })
    }
  })
  await Promise.all(data.banners.map((b) => saveBannerGroupAssignment(b.id, b.groupId ?? DEFAULT_GROUP_ID)))
}

function fingerprint(value: string) {
  return { bytes: Buffer.byteLength(value), sha256: createHash('sha256').update(value).digest('hex') }
}

function auditValue(field: keyof Banner, value: unknown): unknown {
  return field === 'image' ? fingerprint(String(value ?? '')) : value ?? null
}

function bannerChanges(before: Banner | null, after: Banner | null) {
  const fields = MUTABLE_FIELDS.filter((field) => before?.[field] !== after?.[field])
  return {
    fields,
    before: Object.fromEntries(fields.map((field) => [field, auditValue(field, before?.[field])])),
    after: Object.fromEntries(fields.map((field) => [field, auditValue(field, after?.[field])])),
  }
}

async function assignmentsTx(tx: Tx): Promise<Record<string, string>> {
  const row = await tx.keyValueSetting.findUnique({ where: { key: ASSIGNMENTS_KEY } })
  return (row?.value as Record<string, string> | null) ?? {}
}

async function writeAssignmentTx(tx: Tx, assignments: Record<string, string>): Promise<void> {
  await tx.keyValueSetting.upsert({
    where: { key: ASSIGNMENTS_KEY },
    create: { key: ASSIGNMENTS_KEY, value: assignments as unknown as Prisma.InputJsonValue },
    update: { value: assignments as unknown as Prisma.InputJsonValue },
  })
}

function assignmentValue(assignments: Record<string, string>, id: string): string {
  return assignments[id] ?? DEFAULT_GROUP_ID
}

function setAssignment(assignments: Record<string, string>, id: string, groupId: string): boolean {
  const before = assignmentValue(assignments, id)
  if (!groupId || groupId === DEFAULT_GROUP_ID) delete assignments[id]
  else assignments[id] = groupId
  return before !== assignmentValue(assignments, id)
}

function groupFor(groups: BannerGroup[], requested: unknown): BannerGroup {
  const id = typeof requested === 'string' && groups.some((group) => group.id === requested)
    ? requested
    : DEFAULT_GROUP_ID
  return groups.find((group) => group.id === id) ?? groups.find((group) => group.id === DEFAULT_GROUP_ID)!
}

function rowData(banner: Banner) {
  return {
    type: banner.type, title: banner.title, subtitle: banner.subtitle,
    image: banner.image, link: banner.link, ctaLabel: banner.ctaLabel,
    ctaStyle: banner.ctaStyle, bgColor: banner.bgColor, textColor: banner.textColor,
    active: banner.active, order: banner.order,
  }
}

export async function createAdminBanner(
  item: Partial<Banner>, audit: AuditContext,
): Promise<Banner> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${BANNERS_LOCK_KEY}))`
    const [rows, assignments, groups] = await Promise.all([
      tx.banner.findMany({ orderBy: [{ order: 'asc' }, { id: 'asc' }] }),
      assignmentsTx(tx),
      getBannerGroupsTx(tx),
    ])
    const group = groupFor(groups, item.groupId)
    let timestamp = Date.now()
    while (rows.some((row) => row.id === `banner-${timestamp}`)) timestamp += 1
    const now = new Date().toISOString()
    const banner: Banner = {
      id: `banner-${timestamp}`,
      type: item.type === 'video' ? 'video' : item.type === 'image' ? 'image' : 'sale',
      title: item.title ?? '', subtitle: item.subtitle ?? '', image: item.image ?? '',
      link: item.link ?? '', ctaLabel: item.ctaLabel ?? '', ctaStyle: item.ctaStyle ?? 'primary',
      bgColor: item.bgColor ?? '#ffffff', textColor: item.textColor ?? 'dark', active: item.active ?? true,
      groupId: group.id, placement: group.displayType, zone: group.zone, scrollMode: group.scrollMode,
      order: rows.reduce((max, row) => Math.max(max, row.order), 0) + 1,
      createdAt: now, updatedAt: now,
    }
    const created = await tx.banner.create({ data: { id: banner.id, ...rowData(banner) } })
    if (setAssignment(assignments, banner.id, banner.groupId)) await writeAssignmentTx(tx, assignments)
    const saved = mapDbToBanner(created, assignments, new Map(groups.map((candidate) => [candidate.id, candidate])))
    const changes = bannerChanges(null, saved)
    await appendServerAudit(tx, audit.request, audit.actor, {
      action: 'banner.created', entityType: 'banner', entityId: saved.id,
      entityTitle: saved.title || saved.id, after: changes.after,
    })
    return saved
  })
}

export async function updateAdminBanner(
  id: string, updates: Partial<Banner>, audit: AuditContext,
): Promise<{ status: 'updated' | 'unchanged' | 'not_found'; banner?: Banner }> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${BANNERS_LOCK_KEY}))`
    const row = await tx.banner.findUnique({ where: { id } })
    if (!row) return { status: 'not_found' as const }
    const [assignments, groups] = await Promise.all([assignmentsTx(tx), getBannerGroupsTx(tx)])
    const groupsById = new Map(groups.map((group) => [group.id, group]))
    const before = mapDbToBanner(row, assignments, groupsById)
    const requestedGroup = updates.groupId !== undefined && updates.groupId !== before.groupId
      ? groupFor(groups, updates.groupId)
      : groupFor(groups, before.groupId)
    const after: Banner = {
      ...before, ...updates, id,
      groupId: requestedGroup.id,
      placement: requestedGroup.displayType,
      zone: requestedGroup.zone,
      scrollMode: requestedGroup.scrollMode,
      createdAt: before.createdAt,
      updatedAt: before.updatedAt,
    }
    const changes = bannerChanges(before, after)
    if (changes.fields.length === 0) return { status: 'unchanged' as const, banner: before }
    const savedRow = await tx.banner.update({ where: { id }, data: rowData(after) })
    if (setAssignment(assignments, id, after.groupId)) await writeAssignmentTx(tx, assignments)
    const saved = mapDbToBanner(savedRow, assignments, groupsById)
    await appendServerAudit(tx, audit.request, audit.actor, {
      action: 'banner.updated', entityType: 'banner', entityId: id,
      entityTitle: saved.title || id, before: changes.before, after: changes.after,
    })
    return { status: 'updated' as const, banner: saved }
  })
}

export async function deleteAdminBanner(
  id: string, audit: AuditContext,
): Promise<{ status: 'deleted' | 'not_found'; banner?: Banner }> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${BANNERS_LOCK_KEY}))`
    const row = await tx.banner.findUnique({ where: { id } })
    if (!row) return { status: 'not_found' as const }
    const [assignments, groups] = await Promise.all([assignmentsTx(tx), getBannerGroupsTx(tx)])
    const banner = mapDbToBanner(row, assignments, new Map(groups.map((group) => [group.id, group])))
    await tx.banner.delete({ where: { id } })
    if (id in assignments) {
      delete assignments[id]
      await writeAssignmentTx(tx, assignments)
    }
    await appendServerAudit(tx, audit.request, audit.actor, {
      action: 'banner.deleted', entityType: 'banner', entityId: id,
      entityTitle: banner.title || id, before: bannerChanges(banner, null).before,
    })
    return { status: 'deleted' as const, banner }
  })
}

export async function reorderAdminBanner(
  id: string, direction: 'up' | 'down', audit: AuditContext,
): Promise<'moved' | 'unchanged' | 'not_found'> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${BANNERS_LOCK_KEY}))`
    const banners = await tx.banner.findMany({
      orderBy: [{ order: 'asc' }, { id: 'asc' }], select: { id: true, order: true },
    })
    const index = banners.findIndex((banner) => banner.id === id)
    if (index === -1) return 'not_found'
    const next = index + (direction === 'up' ? -1 : 1)
    if (next < 0 || next >= banners.length) return 'unchanged'
    const before = banners.map((banner) => banner.id)
    ;[banners[index], banners[next]] = [banners[next], banners[index]]
    for (const [position, banner] of banners.entries()) {
      const order = position + 1
      if (banner.order !== order) await tx.banner.update({ where: { id: banner.id }, data: { order } })
    }
    const after = banners.map((banner) => banner.id)
    await appendServerAudit(tx, audit.request, audit.actor, {
      action: 'banner.reordered', entityType: 'banner', entityId: id,
      before: { order: before }, after: { order: after },
    })
    return 'moved'
  })
}
