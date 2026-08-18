import { z } from 'zod'

const shortText = z.string().trim().max(300)
const longText = z.string().trim().max(20_000)
const resource = z.string().trim().max(2_048)
const money = z.number().finite().min(0).max(99_999_999.99)
const id = z.string().trim().min(1).max(100).regex(/^[\p{L}\p{N}._:-]+$/u)
const stringList = z.array(z.string().trim().min(1).max(2_048)).max(100)
  .refine((items) => new Set(items).size === items.length, 'Duplicate values are not allowed')
const relatedIds = z.array(id).max(100)
  .refine((items) => new Set(items).size === items.length, 'Duplicate product references are not allowed')
const bulkTiers = z.array(z.object({
  quantity: z.number().int().min(1).max(1_000_000),
  pricePerUnit: money,
}).strict()).max(100).superRefine((tiers, ctx) => {
  for (let i = 1; i < tiers.length; i += 1) {
    if (tiers[i].quantity <= tiers[i - 1].quantity) ctx.addIssue({ code: 'custom', path: [i, 'quantity'], message: 'Tier quantities must be strictly increasing' })
    if (tiers[i].pricePerUnit > tiers[i - 1].pricePerUnit) ctx.addIssue({ code: 'custom', path: [i, 'pricePerUnit'], message: 'Tier price must not increase with quantity' })
  }
})
const multilingual = z.object({ ru: shortText, en: shortText, lv: shortText }).strict()

export const productChangesSchema = z.object({
  title: shortText.min(1), titleKey: shortText.optional(), titleEn: shortText.optional(), titleLv: shortText.optional(),
  description: longText.optional(), brand: shortText.min(1), category: z.enum(['hair', 'face', 'body', 'nails', 'equipment']),
  price: money, oldPrice: money.optional(), rating: z.number().finite().min(0).max(5).optional(),
  ratingCount: z.number().int().min(0).max(1_000_000_000).optional(), reviewCount: z.number().int().min(0).max(1_000_000_000).optional(),
  image: resource.optional(), images: stringList.optional(), badges: z.array(z.enum(['new', 'sale', 'bestseller'])).max(3).optional(),
  stock: z.number().int().min(0).max(1_000_000_000), barcode: shortText.optional(), sku: z.string().trim().max(100).optional(),
  isActive: z.boolean().optional(), minOrderQuantities: z.record(z.string().max(100), z.number().int().min(1).max(1_000_000)).optional(),
  technicalSpecs: z.record(z.string().max(200), z.string().max(10_000)).optional(), bulkPricingTiers: bulkTiers.optional(),
  relatedProductIds: relatedIds.optional(), oftenBoughtTogether: relatedIds.optional(),
  demoVideo: z.array(z.object({ src: resource.min(1), poster: resource.optional() }).strict()).max(20).optional(),
  compatibleEquipment: stringList.optional(), certificates: stringList.optional(), packagingSize: z.number().int().min(1).max(1_000_000).optional(),
  unitOfMeasure: shortText.optional(), metaTitle: z.string().trim().max(200).optional(), metaDescription: z.string().trim().max(500).optional(), ogImage: resource.optional(), ogAlt: shortText.optional(),
  manufacturerName: shortText.optional(), manufacturerAddress: z.string().trim().max(1_000).optional(), manufacturerEmail: z.string().trim().email().max(320).optional(),
  distributorName: multilingual.optional(), distributorAddress: multilingual.optional(), distributorEmail: z.string().trim().email().max(320).optional(),
  bonusRate: z.number().finite().min(0).max(100).optional(),
  feature1: shortText.optional(), feature1En: shortText.optional(), feature1Lv: shortText.optional(), feature2: shortText.optional(), feature2En: shortText.optional(), feature2Lv: shortText.optional(),
  feature3: shortText.optional(), feature3En: shortText.optional(), feature3Lv: shortText.optional(), feature4: shortText.optional(), feature4En: shortText.optional(), feature4Lv: shortText.optional(),
  specVolume: shortText.optional(), specType: shortText.optional(), specCountry: shortText.optional(),
}).strict()

const updateProductChangesSchema = productChangesSchema.extend({ oldPrice: money.nullable().optional() })

export const updateProductRequestSchema = z.object({ id, revision: z.number().int().positive(), changes: updateProductChangesSchema.partial() }).strict()
  .refine((value) => Object.keys(value.changes).length > 0, { path: ['changes'], message: 'At least one change is required' })

export const createProductRequestSchema = z.object({ product: productChangesSchema.extend({ id }) }).strict()

export type ProductChanges = z.infer<typeof productChangesSchema>
