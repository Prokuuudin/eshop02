import { promises as fs } from 'fs'
import path from 'path'

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

export async function readPriceGroupsData(): Promise<PriceGroupsData> {
  const raw = await fs.readFile(DATA_PATH, 'utf-8')
  return JSON.parse(raw) as PriceGroupsData
}

async function writePriceGroupsData(data: PriceGroupsData): Promise<void> {
  await fs.writeFile(DATA_PATH, JSON.stringify(data, null, 2), 'utf-8')
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
