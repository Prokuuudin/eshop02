import { promises as fs } from 'fs'
import path from 'path'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@/generated/prisma/client'

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

export async function readPriceGroupsData(): Promise<PriceGroupsData> {
  const row = await prisma.keyValueSetting.findUnique({ where: { key: KV_KEY } })
  if (!row) return readFromFile()
  return row.value as PriceGroupsData
}

async function writePriceGroupsData(data: PriceGroupsData): Promise<void> {
  await prisma.keyValueSetting.upsert({
    where: { key: KV_KEY },
    create: { key: KV_KEY, value: data as unknown as Prisma.InputJsonValue },
    update: { value: data as unknown as Prisma.InputJsonValue },
  })
}

export async function getPriceGroups(): Promise<PriceGroup[]> {
  const data = await readPriceGroupsData()
  return data.groups
}

export async function createPriceGroup(
  group: Omit<PriceGroup, 'id' | 'createdAt'>
): Promise<{ success: boolean; group?: PriceGroup; error?: string }> {
  try {
    const data = await readPriceGroupsData()
    const newGroup: PriceGroup = {
      ...group,
      id: `group-${Date.now()}`,
      createdAt: new Date().toISOString(),
    }
    data.groups.push(newGroup)
    await writePriceGroupsData(data)
    return { success: true, group: newGroup }
  } catch {
    return { success: false, error: 'write_failed' }
  }
}

export async function updatePriceGroup(
  id: string,
  updates: Partial<Omit<PriceGroup, 'id' | 'createdAt'>>
): Promise<{ success: boolean; error?: string }> {
  try {
    const data = await readPriceGroupsData()
    const idx = data.groups.findIndex((g) => g.id === id)
    if (idx === -1) return { success: false, error: 'not_found' }
    data.groups[idx] = { ...data.groups[idx], ...updates }
    await writePriceGroupsData(data)
    return { success: true }
  } catch {
    return { success: false, error: 'write_failed' }
  }
}

export async function deletePriceGroup(
  id: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const data = await readPriceGroupsData()
    data.groups = data.groups.filter((g) => g.id !== id)
    data.overrides = data.overrides.filter((o) => o.groupId !== id)
    await writePriceGroupsData(data)
    return { success: true }
  } catch {
    return { success: false, error: 'write_failed' }
  }
}

export async function setOverride(
  groupId: string,
  productId: string,
  price: number
): Promise<{ success: boolean; error?: string }> {
  try {
    const data = await readPriceGroupsData()
    if (!data.groups.some((group) => group.id === groupId)) {
      return { success: false, error: 'not_found' }
    }
    const idx = data.overrides.findIndex(
      (o) => o.groupId === groupId && o.productId === productId
    )
    if (idx === -1) {
      data.overrides.push({ groupId, productId, price })
    } else {
      data.overrides[idx].price = price
    }
    await writePriceGroupsData(data)
    return { success: true }
  } catch {
    return { success: false, error: 'write_failed' }
  }
}

export async function removeOverride(
  groupId: string,
  productId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const data = await readPriceGroupsData()
    data.overrides = data.overrides.filter(
      (o) => !(o.groupId === groupId && o.productId === productId)
    )
    await writePriceGroupsData(data)
    return { success: true }
  } catch {
    return { success: false, error: 'write_failed' }
  }
}
