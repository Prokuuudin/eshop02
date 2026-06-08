import { config } from 'dotenv'
config({ path: '.env.local' })

import { Pool } from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../generated/prisma/client'
import { PRODUCTS } from '../data/products'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function main() {
  let count = 0
  for (const p of PRODUCTS) {
    await prisma.product.upsert({
      where: { id: p.id },
      update: {},
      create: {
        id: p.id,
        title: p.title,
        titleKey: p.titleKey ?? null,
        titleEn: p.titleEn ?? null,
        titleLv: p.titleLv ?? null,
        description: p.description ?? null,
        brand: p.brand,
        price: p.price,
        oldPrice: p.oldPrice ?? null,
        rating: p.rating,
        ratingCount: p.ratingCount ?? 0,
        reviewCount: p.reviewCount ?? 0,
        image: p.image ?? null,
        images: p.images ?? [],
        metaTitle: p.metaTitle ?? null,
        metaDescription: p.metaDescription ?? null,
        ogImage: p.ogImage ?? null,
        ogAlt: p.ogAlt ?? null,
        badges: (p.badges ?? []) as string[],
        category: p.category,
        stock: p.stock,
        barcode: p.barcode ?? null,
        purpose: p.purpose ?? null,
        purposeEn: p.purposeEn ?? null,
        purposeLv: p.purposeLv ?? null,
        relatedProductIds: p.relatedProductIds ?? [],
        oftenBoughtTogether: p.oftenBoughtTogether ?? [],
        minOrderQuantities: p.minOrderQuantities ?? undefined,
        technicalSpecs: p.technicalSpecs ?? undefined,
        bulkPricingTiers: p.bulkPricingTiers ?? undefined,
        demoVideo: p.demoVideo ?? undefined,
        distributorName: p.distributorName ?? undefined,
        distributorAddress: p.distributorAddress ?? undefined,
        sku: p.sku ?? null,
        unitOfMeasure: p.unitOfMeasure ?? null,
        certificates: p.certificates ?? [],
        packagingSize: p.packagingSize ?? null,
        compatibleEquipment: p.compatibleEquipment ?? [],
        manufacturerName: p.manufacturerName ?? null,
        manufacturerAddress: p.manufacturerAddress ?? null,
        manufacturerEmail: p.manufacturerEmail ?? null,
        distributorEmail: p.distributorEmail ?? null,
        bonusRate: p.bonusRate ?? null,
        feature1: p.feature1 ?? null,
        feature1En: p.feature1En ?? null,
        feature1Lv: p.feature1Lv ?? null,
        feature2: p.feature2 ?? null,
        feature2En: p.feature2En ?? null,
        feature2Lv: p.feature2Lv ?? null,
        feature3: p.feature3 ?? null,
        feature3En: p.feature3En ?? null,
        feature3Lv: p.feature3Lv ?? null,
        feature4: p.feature4 ?? null,
        feature4En: p.feature4En ?? null,
        feature4Lv: p.feature4Lv ?? null,
        specVolume: p.specVolume ?? null,
        specType: p.specType ?? null,
        specCountry: p.specCountry ?? null,
      },
    })
    count++
  }
  console.log(`Seeded ${count} products`)

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
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
