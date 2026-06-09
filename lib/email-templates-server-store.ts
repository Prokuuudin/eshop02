import { promises as fs } from 'fs'
import path from 'path'
import { prisma } from '@/lib/prisma'
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

async function writeTemplatesData(data: TemplatesData): Promise<void> {
  await prisma.keyValueSetting.upsert({
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
    const data = await readTemplatesData()
    const idx = data.templates.findIndex((t) => t.id === id)
    if (idx === -1) return { success: false, error: 'not_found' }
    data.templates[idx] = {
      ...data.templates[idx],
      ...updates,
      updatedAt: new Date().toISOString(),
    }
    await writeTemplatesData(data)
    return { success: true, template: data.templates[idx] }
  } catch {
    return { success: false, error: 'write_failed' }
  }
}
