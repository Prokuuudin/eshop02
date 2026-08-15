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

async function readFromFile(): Promise<TemplatesData> {
  try {
    const raw = await fs.readFile(DATA_PATH, 'utf-8')
    return JSON.parse(raw) as TemplatesData
  } catch {
    return { templates: [] }
  }
}

export async function readTemplatesData(): Promise<TemplatesData> {
  const row = await prisma.keyValueSetting.findUnique({ where: { key: KV_KEY } })
  if (!row) return readFromFile()
  return row.value as TemplatesData
}

// Same read, but against the transaction client passed into `prisma.$transaction`
// rather than the top-level `prisma` handle - used by upsertTemplate so its
// read-modify-write of the single shared KV row happens inside the lock below.
const readTemplatesDataTx = async (tx: ExtendedTransactionClient): Promise<TemplatesData> => {
  const row = await tx.keyValueSetting.findUnique({ where: { key: KV_KEY } })
  if (!row) return readFromFile()
  return row.value as TemplatesData
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
      // deleted-products-archive, stripe-payments, per-order-meta locks) and from
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
