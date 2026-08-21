import { z } from 'zod'

export const adminOrderCreateSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().max(100).optional().default(''),
  phone: z.string().trim().max(32).optional().default(''),
  items: z.array(z.object({
    id: z.string().trim().min(1).max(200),
    quantity: z.number().int().min(1).max(10_000),
    // Admin-entered manual orders may override the catalog price (e.g. a
    // negotiated discount) - unlike public checkout, which always recomputes
    // price from the DB.
    unitPrice: z.number().finite().min(0).max(1_000_000),
  })).min(1).max(200),
  deliveryMethod: z.enum(['courier', 'pickup', 'post', 'venipak']),
  address: z.string().trim().max(500).optional().default(''),
  city: z.string().trim().max(200).optional().default(''),
  postalCode: z.string().trim().max(50).optional(),
  paymentMethod: z.string().trim().min(1).max(100),
  paymentStatus: z.enum(['unpaid', 'paid']).optional().default('unpaid'),
  promoCode: z.string().trim().max(64).optional(),
  discount: z.number().finite().min(0).max(1_000_000).optional().default(0),
  notes: z.string().trim().max(2_000).optional(),
}).strict()

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
  deliveryMethod: z.enum(['courier', 'pickup', 'post', 'venipak']),
}).strict()

export const paymentMethodSchema = z.enum(['bank', 'cash'])
export const deliveryMethodSchema = z.enum(['courier', 'pickup', 'post', 'venipak'])

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
