import { config } from 'dotenv'
config({ path: '.env.local' })

import { promises as fs } from 'node:fs'
import path from 'node:path'
import { Pool } from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../generated/prisma/client'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

const DATA_DIR = path.join(process.cwd(), 'data')

async function seedPromoCodes() {
  const raw = await fs.readFile(path.join(DATA_DIR, 'promo-codes.json'), 'utf-8')
  const codes = JSON.parse(raw) as Array<{
    id: string; code: string; discount: number; minOrder: number;
    maxUses: number | null; usedCount: number; expiresAt: string | null;
    active: boolean; description: string
  }>
  let count = 0
  for (const c of codes) {
    await prisma.promoCode.upsert({
      where: { id: c.id },
      update: {},
      create: {
        id: c.id,
        code: c.code.toUpperCase().trim(),
        discount: c.discount,
        minOrder: c.minOrder ?? 0,
        maxUses: c.maxUses ?? null,
        usedCount: c.usedCount ?? 0,
        expiresAt: c.expiresAt ? new Date(c.expiresAt) : null,
        active: c.active ?? true,
        description: c.description ?? '',
      },
    })
    count++
  }
  console.log(`Seeded ${count} promo codes`)
}

async function seedShippingSettings() {
  try {
    const raw = await fs.readFile(path.join(DATA_DIR, 'shipping-settings.json'), 'utf-8')
    const value = JSON.parse(raw) as object
    await prisma.keyValueSetting.upsert({
      where: { key: 'shipping-settings' },
      update: {},
      create: { key: 'shipping-settings', value },
    })
    console.log('Seeded shipping-settings')
  } catch {
    console.log('No shipping-settings.json found, skipping')
  }
}

async function seedSiteContent() {
  try {
    const raw = await fs.readFile(path.join(DATA_DIR, 'site-content.json'), 'utf-8')
    const value = JSON.parse(raw) as object
    await prisma.keyValueSetting.upsert({
      where: { key: 'site-content' },
      update: {},
      create: { key: 'site-content', value },
    })
    console.log('Seeded site-content')
  } catch {
    console.log('No site-content.json found, skipping')
  }
}

async function main() {
  await seedPromoCodes()
  await seedShippingSettings()
  await seedSiteContent()
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
