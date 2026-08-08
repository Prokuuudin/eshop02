import { z } from 'zod'

export const adminOrderUpdateSchema = z.object({
  orderId: z.string().trim().min(1).max(100),
  items: z.array(z.object({
    id: z.string().trim().min(1).max(200),
    quantity: z.number().int().min(1).max(10_000),
    lineKey: z.string().trim().max(300).optional(),
    variantLabel: z.string().trim().max(300).optional(),
  })).min(1).max(500),
  address: z.string().trim().min(1).max(500),
  city: z.string().trim().min(1).max(200),
  postalCode: z.string().trim().max(50).optional(),
  deliveryMethod: z.enum(['courier', 'pickup', 'post']),
}).strict()

export const paymentMethodSchema = z.enum(['card', 'bank', 'cash'])
export const deliveryMethodSchema = z.enum(['courier', 'pickup', 'post'])

export const returnRequestSchema = z.object({
  orderId: z.string().trim().min(1).max(100),
  reason: z.enum(['defective', 'wrong_item', 'changed_mind', 'not_as_described', 'damaged', 'other']),
  comment: z.string().trim().max(2_000).optional(),
  firstName: z.string().trim().max(100).optional(),
  lastName: z.string().trim().max(100).optional(),
  phone: z.string().trim().max(50).optional(),
  items: z.array(z.object({
    productId: z.string().trim().min(1).max(200),
    quantity: z.number().int().min(1).max(10_000),
  }).strict()).min(1).max(500),
}).strict()
