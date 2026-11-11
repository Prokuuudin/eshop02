import 'server-only'
import { createHash } from 'node:crypto'
import type { NextRequest } from 'next/server'
import { Prisma } from '@/generated/prisma/client'
import { prisma, type ExtendedTransactionClient } from '@/lib/prisma'
import type { ServerUser } from '@/lib/server-auth'
import { appendServerAudit } from '@/lib/server-audit'
import { brandLineIdList, invalidBrandLineIds } from '@/lib/brand-lines/brand-line-membership'
import {
  PROMO_CAMPAIGNS_KEY, campaignActiveFlag, parseCampaignType, readPromoCampaigns,
  secondItemProductsOutsideBrand, SECOND_ITEM_ONLY_FIELDS, validateSecondItemCampaignInput,
  type PromoCampaign,
} from '@/lib/promo-campaigns'
import { SECOND_ITEM_DISCOUNT_TYPE } from '@/lib/second-item-discount'

type AuditContext = { actor: ServerUser; request: NextRequest }
type Tx = ExtendedTransactionClient
type Failure = { ok: false; status: number; body: Record<string, unknown> }
type Success<T> = { ok: true; value: T; changed: boolean }
export type CampaignMutationResult<T> = Success<T> | Failure

const CAMPAIGN_FIELDS = [
  'name', 'description', 'showOldPrice', 'type', 'discountPercent', 'startDate', 'endDate',
  'active', 'targetCategories', 'targetSubcategories', 'targetBrands', 'targetBrandLineIds',
  'minOrderAmount', 'productIds', 'excludedProductIds', 'excludeSaleItems', 'maxPairs', 'createdAt',
] as const satisfies ReadonlyArray<keyof PromoCampaign>

function fingerprint(value: unknown) {
  const text = typeof value === 'string' ? value : JSON.stringify(value ?? null)
  return { bytes: Buffer.byteLength(text), sha256: createHash('sha256').update(text).digest('hex') }
}

function comparable(value: unknown): string {
  return JSON.stringify(value ?? null)
}

function campaignChanges(before: PromoCampaign | null, after: PromoCampaign | null) {
  const fields = CAMPAIGN_FIELDS.filter((field) => comparable(before?.[field]) !== comparable(after?.[field]))
  const value = (field: keyof PromoCampaign, item: PromoCampaign | null) =>
    field === 'description' ? fingerprint(item?.[field]) : item?.[field] ?? null
  return {
    fields,
    before: Object.fromEntries(fields.map((field) => [field, value(field, before)])),
    after: Object.fromEntries(fields.map((field) => [field, value(field, after)])),
  }
}

async function writeCampaigns(tx: Tx, data: PromoCampaign[]): Promise<void> {
  await tx.keyValueSetting.upsert({
    where: { key: PROMO_CAMPAIGNS_KEY },
    create: { key: PROMO_CAMPAIGNS_KEY, value: data as unknown as Prisma.InputJsonValue },
    update: { value: data as unknown as Prisma.InputJsonValue },
  })
}

export async function getAdminCampaigns(): Promise<PromoCampaign[]> {
  return readPromoCampaigns(prisma)
}

function invalid(status: number, body: Record<string, unknown>): Failure {
  return { ok: false, status, body }
}

export async function createAdminCampaign(
  body: Omit<PromoCampaign, 'id' | 'createdAt' | 'updatedAt'>,
  audit: AuditContext,
): Promise<CampaignMutationResult<PromoCampaign>> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${PROMO_CAMPAIGNS_KEY}))`
    const data = await readPromoCampaigns(tx)
    const name = String(body.name ?? '').trim()
    const type = parseCampaignType(body.type)
    const startDate = String(body.startDate ?? '').slice(0, 10)
    const endDate = String(body.endDate ?? '').slice(0, 10)
    if (!name) return invalid(400, { error: 'name_required' })
    if (!type) return invalid(400, { error: 'unsupported_type' })
    if (!startDate || (endDate && endDate < startDate)) return invalid(400, { error: 'invalid_dates' })
    let secondItem: Extract<ReturnType<typeof validateSecondItemCampaignInput>, { ok: true }>['fields'] | undefined
    if (type === SECOND_ITEM_DISCOUNT_TYPE) {
      const checked = validateSecondItemCampaignInput(body as Record<string, unknown>, data, { startDate, endDate })
      if (!checked.ok) return invalid(checked.status, checked.body)
      const outsideBrand = await secondItemProductsOutsideBrand(tx, checked.fields)
      if (outsideBrand.length > 0) return invalid(422, { error: 'products_not_in_brand', ids: outsideBrand })
      secondItem = checked.fields
    }
    const targetBrandLineIds = secondItem ? [] : brandLineIdList(body.targetBrandLineIds)
    const invalidLines = await invalidBrandLineIds(tx, targetBrandLineIds)
    if (invalidLines.length > 0) return invalid(422, { error: 'invalid_brand_lines', ids: invalidLines })
    const now = new Date().toISOString()
    let timestamp = Date.now()
    while (data.some((campaign) => campaign.id === `campaign-${timestamp}`)) timestamp += 1
    const item: PromoCampaign = {
      id: `campaign-${timestamp}`, name, description: String(body.description ?? '').trim(),
      showOldPrice: body.showOldPrice !== false, type,
      discountPercent: type === 'discount' ? Math.min(100, Math.max(0, Number(body.discountPercent) || 0)) : 0,
      startDate, endDate, active: campaignActiveFlag(startDate, body.active),
      targetCategories: Array.isArray(body.targetCategories) ? [...new Set(body.targetCategories.map(String).filter(Boolean))] : [],
      targetSubcategories: Array.isArray(body.targetSubcategories) ? [...new Set(body.targetSubcategories.map(String).filter(Boolean))] : [],
      targetBrands: Array.isArray(body.targetBrands) ? [...new Set(body.targetBrands.map(String).filter(Boolean))] : [],
      targetBrandLineIds, minOrderAmount: Math.max(0, Number(body.minOrderAmount) || 0),
      ...secondItem, createdAt: now, updatedAt: now,
    }
    data.push(item)
    await writeCampaigns(tx, data)
    await appendServerAudit(tx, audit.request, audit.actor, {
      action: 'campaign.created', entityType: 'campaign', entityId: item.id,
      entityTitle: item.name, after: campaignChanges(null, item).after,
    })
    return { ok: true, value: item, changed: true }
  })
}

export async function updateAdminCampaign(
  id: string, body: Partial<PromoCampaign>, audit: AuditContext,
): Promise<CampaignMutationResult<PromoCampaign>> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${PROMO_CAMPAIGNS_KEY}))`
    const data = await readPromoCampaigns(tx)
    const idx = data.findIndex((item) => item.id === id)
    if (idx === -1) return invalid(404, { error: 'not_found' })
    const before = data[idx]
    const merged = { ...before, ...body }
    const name = String(merged.name ?? '').trim()
    const type = parseCampaignType(merged.type)
    const startDate = String(merged.startDate ?? '').slice(0, 10)
    const endDate = String(merged.endDate ?? '').slice(0, 10)
    if (!name) return invalid(400, { error: 'name_required' })
    if (!type) return invalid(400, { error: 'unsupported_type' })
    if (!startDate || (endDate && endDate < startDate)) return invalid(400, { error: 'invalid_dates' })
    let secondItem: Extract<ReturnType<typeof validateSecondItemCampaignInput>, { ok: true }>['fields'] | undefined
    if (type === SECOND_ITEM_DISCOUNT_TYPE) {
      const checked = validateSecondItemCampaignInput(merged as Record<string, unknown>, data, { id, startDate, endDate })
      if (!checked.ok) return invalid(checked.status, checked.body)
      const listsSubmitted = body.targetBrands !== undefined || body.productIds !== undefined || body.excludedProductIds !== undefined
      const outsideBrand = listsSubmitted ? await secondItemProductsOutsideBrand(tx, checked.fields) : []
      if (outsideBrand.length > 0) return invalid(422, { error: 'products_not_in_brand', ids: outsideBrand })
      secondItem = checked.fields
    }
    const targetBrandLineIds = secondItem ? [] : brandLineIdList(merged.targetBrandLineIds)
    if (!secondItem && body.targetBrandLineIds !== undefined) {
      const invalidLines = await invalidBrandLineIds(tx, targetBrandLineIds)
      if (invalidLines.length > 0) return invalid(422, { error: 'invalid_brand_lines', ids: invalidLines })
    }
    const candidate: PromoCampaign = {
      ...before, ...body, id, name, type, startDate, endDate,
      active: campaignActiveFlag(startDate, merged.active),
      description: String(merged.description ?? '').trim(), showOldPrice: merged.showOldPrice !== false,
      discountPercent: type === 'discount' ? Math.min(100, Math.max(0, Number(merged.discountPercent) || 0)) : 0,
      minOrderAmount: Math.max(0, Number(merged.minOrderAmount) || 0),
      targetCategories: Array.isArray(merged.targetCategories) ? [...new Set(merged.targetCategories.map(String).filter(Boolean))] : [],
      targetSubcategories: Array.isArray(merged.targetSubcategories) ? [...new Set(merged.targetSubcategories.map(String).filter(Boolean))] : [],
      targetBrands: Array.isArray(merged.targetBrands) ? [...new Set(merged.targetBrands.map(String).filter(Boolean))] : [],
      targetBrandLineIds, ...(secondItem ?? SECOND_ITEM_ONLY_FIELDS), updatedAt: before.updatedAt,
    }
    const changes = campaignChanges(before, candidate)
    if (changes.fields.length === 0) return { ok: true, value: before, changed: false }
    candidate.updatedAt = new Date().toISOString()
    data[idx] = candidate
    await writeCampaigns(tx, data)
    await appendServerAudit(tx, audit.request, audit.actor, {
      action: 'campaign.updated', entityType: 'campaign', entityId: id,
      entityTitle: candidate.name, before: changes.before, after: changes.after,
    })
    return { ok: true, value: candidate, changed: true }
  })
}

export async function deleteAdminCampaign(
  id: string, audit: AuditContext,
): Promise<CampaignMutationResult<{ ok: true }>> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${PROMO_CAMPAIGNS_KEY}))`
    const data = await readPromoCampaigns(tx)
    const idx = data.findIndex((item) => item.id === id)
    if (idx === -1) return invalid(404, { error: 'not_found' })
    const removed = data[idx]
    data.splice(idx, 1)
    await writeCampaigns(tx, data)
    await appendServerAudit(tx, audit.request, audit.actor, {
      action: 'campaign.deleted', entityType: 'campaign', entityId: id,
      entityTitle: removed.name, before: campaignChanges(removed, null).before,
    })
    return { ok: true, value: { ok: true } as const, changed: true }
  })
}
