import { z } from 'zod'

const hexColor = z.string().regex(/^#[0-9a-f]{6}$/i, 'invalid_color')

export const priceGroupSchema = z.object({
  name: z.string().trim().min(1, 'name_required').max(80, 'name_too_long'),
  description: z.string().trim().max(300, 'description_too_long').default(''),
  multiplier: z.number().finite().min(0.01, 'multiplier_too_small').max(10, 'multiplier_too_large'),
  color: hexColor.default('#6b7280'),
})

export const priceOverrideSchema = z.object({
  action: z.literal('set_override'),
  productId: z.string().trim().min(1, 'product_required').max(200),
  price: z.number().finite().min(0, 'price_too_small').max(1_000_000, 'price_too_large'),
})

export const removeOverrideSchema = z.object({
  action: z.literal('remove_override'),
  productId: z.string().trim().min(1, 'product_required').max(200),
})
