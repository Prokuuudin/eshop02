import { promises as fs } from 'fs'
import path from 'path'
import { prisma, type ExtendedTransactionClient } from '@/lib/prisma'
import { Prisma } from '@/generated/prisma/client'

export type EmailTemplate = {
  id: string
  name: string
  subject: string
  body: string
  variables: string[]
  updatedAt: string
}

type TemplatesData = {
  templates: EmailTemplate[]
}

const DATA_PATH = path.join(process.cwd(), 'data', 'email-templates.json')
const KV_KEY = 'email-templates'
const RETIRED_TEMPLATE_IDS = new Set([
  'store-launch-ru', 'store-launch-en', 'store-launch-lv',
  'access-request-approved-ru', 'access-request-approved-en', 'access-request-approved-lv',
  'registration', 'registration-ru', 'registration-en', 'registration-lv',
  'order-confirmation', 'order-shipped', 'order-delivered', 'password-reset', 'rfq-response',
])

async function readFromFile(): Promise<TemplatesData> {
  try {
    const raw = await fs.readFile(DATA_PATH, 'utf-8')
    return JSON.parse(raw) as TemplatesData
  } catch {
    return { templates: [] }
  }
}

function mergeWithDefaults(stored: TemplatesData, defaults: TemplatesData): TemplatesData {
  const defaultById = new Map(defaults.templates.map((template) => [template.id, template]))
  const activeStoredTemplates = stored.templates.filter((template) => !RETIRED_TEMPLATE_IDS.has(template.id))
  const templates = activeStoredTemplates.map((current) => {
    const template = defaultById.get(current.id)
    if (!template) return current
    const currentUpdatedAt = Date.parse(current.updatedAt)
    const defaultUpdatedAt = Date.parse(template.updatedAt)
    return Number.isFinite(defaultUpdatedAt) && (!Number.isFinite(currentUpdatedAt) || defaultUpdatedAt > currentUpdatedAt)
      ? template
      : current
  })

  // A real registry contains many templates; tiny collections are also used by
  // tests and may be deliberate custom installations. Complete only an existing
  // full registry, without deleting any custom templates.
  if (stored.templates.length >= 10) {
    const storedIds = new Set(activeStoredTemplates.map((template) => template.id))
    templates.push(...defaults.templates.filter((template) => !storedIds.has(template.id)))
  }
  return {
    templates,
  }
}

export async function readTemplatesData(): Promise<TemplatesData> {
  const [row, defaults] = await Promise.all([
    prisma.keyValueSetting.findUnique({ where: { key: KV_KEY } }),
    readFromFile(),
  ])
  if (!row) return defaults
  return mergeWithDefaults(row.value as TemplatesData, defaults)
}

// Same read, but against the transaction client passed into `prisma.$transaction`
// rather than the top-level `prisma` handle - used by upsertTemplate so its
// read-modify-write of the single shared KV row happens inside the lock below.
const readTemplatesDataTx = async (tx: ExtendedTransactionClient): Promise<TemplatesData> => {
  const [row, defaults] = await Promise.all([
    tx.keyValueSetting.findUnique({ where: { key: KV_KEY } }),
    readFromFile(),
  ])
  if (!row) return defaults
  return mergeWithDefaults(row.value as TemplatesData, defaults)
}

const writeTemplatesDataTx = async (tx: ExtendedTransactionClient, data: TemplatesData): Promise<void> => {
  await tx.keyValueSetting.upsert({
    where: { key: KV_KEY },
    create: { key: KV_KEY, value: data as unknown as Prisma.InputJsonValue },
    update: { value: data as unknown as Prisma.InputJsonValue },
  })
}

export async function getTemplates(): Promise<EmailTemplate[]> {
  const data = await readTemplatesData()
  return data.templates
}

export async function upsertTemplate(
  id: string,
  updates: Partial<Omit<EmailTemplate, 'id'>>
): Promise<{ success: boolean; template?: EmailTemplate; error?: string }> {
  try {
    return await prisma.$transaction(async (tx) => {
      // All email templates live as one JSON array inside a single KeyValueSetting
      // row (KV_KEY), so a plain read-modify-write races: two admins editing two
      // *different* templates at nearly the same time can both read the row before
      // either writes, and the later write silently overwrites the earlier one's
      // edit. hashtext(KV_KEY) namespaces this lock to that one row - it's derived
      // from the 'email-templates' string itself, so it's automatically distinct
      // from the other hashtext(<key>) locks in this codebase (product-overrides,
      // deleted-products-archive, payment records, per-order-meta locks) and from
      // the unrelated literal-integer lock server-audit.ts uses for the audit-log
      // hash chain (203948721) - no shared bottleneck with either.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${KV_KEY}))`

      const data = await readTemplatesDataTx(tx)
      const idx = data.templates.findIndex((t) => t.id === id)
      if (idx === -1) return { success: false, error: 'not_found' }
      data.templates[idx] = {
        ...data.templates[idx],
        ...updates,
        updatedAt: new Date().toISOString(),
      }
      await writeTemplatesDataTx(tx, data)
      return { success: true, template: data.templates[idx] }
    })
  } catch {
    return { success: false, error: 'write_failed' }
  }
}
