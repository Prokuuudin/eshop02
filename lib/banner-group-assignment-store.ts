import 'server-only'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@/generated/prisma/client'
import { DEFAULT_GROUP_ID } from '@/lib/banner-groups-store'

const BANNER_GROUP_ASSIGNMENTS_KEY = 'banner-group-assignments'

async function readAssignmentsMap(): Promise<Record<string, string>> {
  const row = await prisma.keyValueSetting.findUnique({ where: { key: BANNER_GROUP_ASSIGNMENTS_KEY } })
  return (row?.value as Record<string, string> | null) ?? {}
}

export async function getBannerGroupAssignments(): Promise<Record<string, string>> {
  return readAssignmentsMap()
}

export async function saveBannerGroupAssignment(bannerId: string, groupId: string): Promise<void> {
  const current = await readAssignmentsMap()
  const next = { ...current }
  if (!groupId || groupId === DEFAULT_GROUP_ID) delete next[bannerId]
  else next[bannerId] = groupId
  await prisma.keyValueSetting.upsert({
    where: { key: BANNER_GROUP_ASSIGNMENTS_KEY },
    create: { key: BANNER_GROUP_ASSIGNMENTS_KEY, value: next as unknown as Prisma.InputJsonValue },
    update: { value: next as unknown as Prisma.InputJsonValue },
  })
}

export async function removeBannerGroupAssignment(bannerId: string): Promise<void> {
  const current = await readAssignmentsMap()
  if (!(bannerId in current)) return
  const next = { ...current }
  delete next[bannerId]
  await prisma.keyValueSetting.upsert({
    where: { key: BANNER_GROUP_ASSIGNMENTS_KEY },
    create: { key: BANNER_GROUP_ASSIGNMENTS_KEY, value: next as unknown as Prisma.InputJsonValue },
    update: { value: next as unknown as Prisma.InputJsonValue },
  })
}
