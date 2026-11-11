import { promises as fs } from 'fs'
import path from 'path'
import type { NextRequest } from 'next/server'
import { Prisma } from '@/generated/prisma/client'
import { prisma, type ExtendedTransactionClient } from '@/lib/prisma'
import { appendServerAudit } from '@/lib/server-audit'
import type { ServerUser } from '@/lib/server-auth'

export type PriceGroup = {
  id: string
  name: string
  description: string
  multiplier: number
  color: string
  createdAt: string
}

export type PriceOverride = {
  groupId: string
  productId: string
  price: number
}

type PriceGroupsData = {
  groups: PriceGroup[]
  overrides: PriceOverride[]
}

type AuditContext = { actor: ServerUser; request: NextRequest }
type Tx = ExtendedTransactionClient

const DATA_PATH = path.join(process.cwd(), 'data', 'price-groups.json')
const KV_KEY = 'price-groups'

async function readFromFile(): Promise<PriceGroupsData> {
  try {
    const raw = await fs.readFile(DATA_PATH, 'utf-8')
    return JSON.parse(raw) as PriceGroupsData
  } catch {
    return { groups: [], overrides: [] }
  }
}

function copyData(data: PriceGroupsData): PriceGroupsData {
  return {
    groups: data.groups.map((group) => ({ ...group })),
    overrides: data.overrides.map((override) => ({ ...override })),
  }
}

export async function readPriceGroupsData(): Promise<PriceGroupsData> {
  const row = await prisma.keyValueSetting.findUnique({ where: { key: KV_KEY } })
  if (!row) return readFromFile()
  return copyData(row.value as PriceGroupsData)
}

async function readPriceGroupsDataTx(tx: Tx, fallback: PriceGroupsData): Promise<PriceGroupsData> {
  const row = await tx.keyValueSetting.findUnique({ where: { key: KV_KEY } })
  return copyData(row ? row.value as PriceGroupsData : fallback)
}

async function writePriceGroupsDataTx(tx: Tx, data: PriceGroupsData): Promise<void> {
  await tx.keyValueSetting.upsert({
    where: { key: KV_KEY },
    create: { key: KV_KEY, value: data as unknown as Prisma.InputJsonValue },
    update: { value: data as unknown as Prisma.InputJsonValue },
  })
}

async function lockedMutation<T>(
  run: (tx: Tx, data: PriceGroupsData) => Promise<T>,
): Promise<T> {
  const fallback = await readFromFile()
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${KV_KEY}))`
    return run(tx, await readPriceGroupsDataTx(tx, fallback))
  })
}

function mutableGroup(group: PriceGroup): Omit<PriceGroup, 'id' | 'createdAt'> {
  return {
    name: group.name,
    description: group.description,
    multiplier: group.multiplier,
    color: group.color,
  }
}

function changedGroupFields(
  before: PriceGroup,
  after: PriceGroup,
): { before: Record<string, unknown>; after: Record<string, unknown> } {
  const previous = mutableGroup(before)
  const next = mutableGroup(after)
  const changed = (Object.keys(next) as Array<keyof typeof next>)
    .filter((key) => previous[key] !== next[key])
  return {
    before: Object.fromEntries(changed.map((key) => [key, previous[key]])),
    after: Object.fromEntries(changed.map((key) => [key, next[key]])),
  }
}

function nextGroupId(data: PriceGroupsData): string {
  let timestamp = Date.now()
  while (data.groups.some((group) => group.id === `group-${timestamp}`)) timestamp += 1
  return `group-${timestamp}`
}

export async function getPriceGroups(): Promise<PriceGroup[]> {
  const data = await readPriceGroupsData()
  return data.groups
}

export async function createPriceGroup(
  group: Omit<PriceGroup, 'id' | 'createdAt'>,
  audit: AuditContext,
): Promise<{ success: boolean; group?: PriceGroup; error?: string }> {
  try {
    return await lockedMutation(async (tx, data) => {
      const newGroup: PriceGroup = {
        ...group,
        id: nextGroupId(data),
        createdAt: new Date().toISOString(),
      }
      data.groups.push(newGroup)
      await writePriceGroupsDataTx(tx, data)
      await appendServerAudit(tx, audit.request, audit.actor, {
        action: 'price_group.created', entityType: 'price_group', entityId: newGroup.id,
        entityTitle: newGroup.name, after: mutableGroup(newGroup),
      })
      return { success: true, group: newGroup }
    })
  } catch {
    return { success: false, error: 'write_failed' }
  }
}

export async function updatePriceGroup(
  id: string,
  updates: Partial<Omit<PriceGroup, 'id' | 'createdAt'>>,
  audit: AuditContext,
): Promise<{ success: boolean; error?: string }> {
  try {
    return await lockedMutation(async (tx, data) => {
      const idx = data.groups.findIndex((group) => group.id === id)
      if (idx === -1) return { success: false, error: 'not_found' }
      const before = data.groups[idx]
      const after = { ...before, ...updates }
      const changed = changedGroupFields(before, after)
      if (Object.keys(changed.after).length === 0) return { success: true }
      data.groups[idx] = after
      await writePriceGroupsDataTx(tx, data)
      await appendServerAudit(tx, audit.request, audit.actor, {
        action: 'price_group.updated', entityType: 'price_group', entityId: id,
        entityTitle: after.name, before: changed.before, after: changed.after,
      })
      return { success: true }
    })
  } catch {
    return { success: false, error: 'write_failed' }
  }
}

export async function deletePriceGroup(
  id: string,
  audit: AuditContext,
): Promise<{ success: boolean; error?: string }> {
  try {
    return await lockedMutation(async (tx, data) => {
      const group = data.groups.find((candidate) => candidate.id === id)
      if (!group) return { success: true }
      const removedOverrides = data.overrides
        .filter((override) => override.groupId === id)
        .map(({ productId, price }) => ({ productId, price }))
      data.groups = data.groups.filter((candidate) => candidate.id !== id)
      data.overrides = data.overrides.filter((override) => override.groupId !== id)
      await writePriceGroupsDataTx(tx, data)
      await appendServerAudit(tx, audit.request, audit.actor, {
        action: 'price_group.deleted', entityType: 'price_group', entityId: id,
        entityTitle: group.name,
        before: { group: mutableGroup(group), overrides: removedOverrides },
        after: { group: null, overrides: [] },
      })
      return { success: true }
    })
  } catch {
    return { success: false, error: 'write_failed' }
  }
}

export async function setOverride(
  groupId: string,
  productId: string,
  price: number,
  audit: AuditContext,
): Promise<{ success: boolean; error?: string }> {
  try {
    return await lockedMutation(async (tx, data) => {
      const group = data.groups.find((candidate) => candidate.id === groupId)
      if (!group) return { success: false, error: 'not_found' }
      const existing = data.overrides.find(
        (override) => override.groupId === groupId && override.productId === productId,
      )
      if (existing?.price === price) return { success: true }
      const beforePrice = existing?.price ?? null
      if (existing) existing.price = price
      else data.overrides.push({ groupId, productId, price })
      await writePriceGroupsDataTx(tx, data)
      await appendServerAudit(tx, audit.request, audit.actor, {
        action: 'price_group.product_price_set', entityType: 'price_group_product_price',
        entityId: `${groupId}:${productId}`, entityTitle: group.name,
        before: { groupId, productId, price: beforePrice },
        after: { groupId, productId, price },
      })
      return { success: true }
    })
  } catch {
    return { success: false, error: 'write_failed' }
  }
}

export async function removeOverride(
  groupId: string,
  productId: string,
  audit: AuditContext,
): Promise<{ success: boolean; error?: string }> {
  try {
    return await lockedMutation(async (tx, data) => {
      const group = data.groups.find((candidate) => candidate.id === groupId)
      if (!group) return { success: true }
      const existing = data.overrides.find(
        (override) => override.groupId === groupId && override.productId === productId,
      )
      if (!existing) return { success: true }
      data.overrides = data.overrides.filter(
        (override) => !(override.groupId === groupId && override.productId === productId),
      )
      await writePriceGroupsDataTx(tx, data)
      await appendServerAudit(tx, audit.request, audit.actor, {
        action: 'price_group.product_price_removed', entityType: 'price_group_product_price',
        entityId: `${groupId}:${productId}`, entityTitle: group.name,
        before: { groupId, productId, price: existing.price },
        after: { groupId, productId, price: null },
      })
      return { success: true }
    })
  } catch {
    return { success: false, error: 'write_failed' }
  }
}
