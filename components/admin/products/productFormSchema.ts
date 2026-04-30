import * as z from 'zod';

export const LANGUAGES = ['ru', 'en', 'lv'] as const;
export type Language = typeof LANGUAGES[number];

export const addProductSchema = z.object({
  id: z.string().min(1, 'ID обязателен'),
  sku: z.string().min(1, 'SKU обязателен'),
  barcode: z.string().optional(),
  brand: z.string().min(1, 'Бренд обязателен'),
  category: z.string().min(1, 'Категория обязательна'),
  type: z.string().min(1, 'Тип обязателен'),
  status: z.enum(['active', 'hidden', 'draft']),
  titles: z.object({ ru: z.string().min(1, 'Название RU обязательно'), en: z.string().min(1, 'Название EN обязательно'), lv: z.string().min(1, 'Название LV обязательно') }),
  shortDescriptions: z.object({ ru: z.string().min(1, 'Краткое описание RU обязательно'), en: z.string().min(1, 'Краткое описание EN обязательно'), lv: z.string().min(1, 'Краткое описание LV обязательно') }),
  fullDescriptions: z.object({ ru: z.string().min(1, 'Полное описание RU обязательно'), en: z.string().min(1, 'Полное описание EN обязательно'), lv: z.string().min(1, 'Полное описание LV обязательно') }),
  price: z.number().min(0, 'Цена обязательна'),
  oldPrice: z.number().min(0).optional(),
  currency: z.string().min(1),
  vatIncluded: z.boolean(),
  bulkPricing: z.array(z.object({ minQty: z.number().min(1), price: z.number().min(0) })),
  stock: z.number().min(0),
  minOrder: z.number().min(1),
  unit: z.string().min(1),
  mainImage: z.string().url('URL изображения обязателен'),
  gallery: z.array(z.string().url()),
  previewImage: z.string().url().optional(),
  labels: z.array(z.enum(['new', 'sale', 'bestseller', 'pro', 'limited'])),
  volume: z.string().optional(),
  size: z.string().optional(),
  country: z.string().optional(),
  material: z.string().optional(),
  compatibility: z.string().optional(),
  certificates: z.array(z.string()),
  metaTitles: z.object({ ru: z.string(), en: z.string(), lv: z.string() }),
  metaDescriptions: z.object({ ru: z.string(), en: z.string(), lv: z.string() }),
  slug: z.string().min(1, 'Слаг обязателен'),
  relatedProducts: z.array(z.string()),
  boughtTogether: z.array(z.string()),
});

export type AddProductFormValues = z.infer<typeof addProductSchema>;
