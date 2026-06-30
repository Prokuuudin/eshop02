import { config } from 'dotenv'
config({ path: '.env.local' })

import { Pool } from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../generated/prisma/client'
import bcrypt from 'bcryptjs'
import { randomUUID, randomBytes } from 'node:crypto'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function main() {
  // Seed promo codes
  const promoCodes = [
    { id: 'promo_welcome10', code: 'WELCOME10', discount: 10, minOrder: 0, description: 'Скидка 10% на первый заказ' },
    { id: 'promo_spring20',  code: 'SPRING20',  discount: 20, minOrder: 2000, description: 'Весенняя скидка 20% от 2000' },
    { id: 'promo_beauty30',  code: 'BEAUTY30',  discount: 30, minOrder: 5000, description: 'Скидка 30% от 5000' },
    { id: 'promo_summer15',  code: 'SUMMER15',  discount: 15, minOrder: 1500, description: 'Летняя скидка 15% от 1500' },
  ]
  for (const p of promoCodes) {
    await prisma.promoCode.upsert({
      where: { code: p.code },
      update: {},
      create: { id: p.id, code: p.code, discount: p.discount, minOrder: p.minOrder, description: p.description, active: true },
    })
  }
  console.log(`Seeded ${promoCodes.length} promo codes`)

  // Seed admin user (idempotent — skips if already exists)
  const adminEmail = process.env.SEED_ADMIN_EMAIL
  if (!adminEmail) {
    console.log('Skipping admin seed: SEED_ADMIN_EMAIL not set')
  } else {
    const existing = await prisma.user.findUnique({ where: { email: adminEmail } })
    if (!existing) {
      // Use provided password or generate a random one (never use a hardcoded default)
      const providedPassword = process.env.SEED_ADMIN_PASSWORD
      const generatedPassword = providedPassword ? null : randomBytes(16).toString('hex')
      const adminPassword = providedPassword ?? generatedPassword!
      const passwordHash = await bcrypt.hash(adminPassword, 10)
      await prisma.user.create({
        data: {
          id: randomUUID(),
          email: adminEmail,
          passwordHash,
          name: 'Admin',
          platformRole: 'admin',
          bonusPoints: 0,
        },
      })
      console.log(`Created admin user: ${adminEmail}`)
      if (generatedPassword) {
        console.log(`⚠️  Auto-generated password (save it now — will not be shown again): ${generatedPassword}`)
      }
    } else {
      console.log(`Admin user already exists: ${adminEmail}`)
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
