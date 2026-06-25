import * as z from 'zod';

export const LANGUAGES = ['ru', 'en', 'lv'] as const;
export type Language = typeof LANGUAGES[number];

export const addProductSchema = z.object({
  // Идентификация
  id: z.string().min(1, 'ID обязателен'),
  sku: z.string().optional(),
  barcode: z.string().optional(),

  // Классификация
  brand: z.string().min(1, 'Бренд обязателен'),
  category: z.string().min(1, 'Категория обязательна'),
  status: z.enum(['active', 'hidden', 'draft']),

  // Названия (мультиязычные)
  title: z.string().min(1, 'Название RU обязательно'),
  titleEn: z.string().optional(),
  titleLv: z.string().optional(),

  // Описание и назначение
  description: z.string().optional(),
  purpose: z.string().optional(),
  purposeEn: z.string().optional(),
  purposeLv: z.string().optional(),

  // Цена
  price: z.number().min(0, 'Цена обязательна'),
  oldPrice: z.number().min(0).optional(),

  // Оптовые цены (структура совпадает с Product.bulkPricingTiers)
  bulkPricingTiers: z.array(
    z.object({ quantity: z.number().min(1), pricePerUnit: z.number().min(0) })
  ),

  // Склад
  stock: z.number().min(0),
  minOrder: z.number().min(1),
  unitOfMeasure: z.string().optional(),
  packagingSize: z.number().optional(),

  // Медиа
  image: z.string().optional(),
  images: z.array(z.string()),

  // Бейджи (совпадает с Product.BadgeType)
  badges: z.array(z.enum(['new', 'sale', 'bestseller'])),

  // Технические характеристики (ключ-значение, как в Product.technicalSpecs)
  technicalSpecs: z.array(z.object({ key: z.string(), value: z.string() })),

  // Совместимость (как Product.compatibleEquipment)
  compatibleEquipment: z.array(z.string()),

  // Сертификаты
  certificates: z.array(z.string()),

  // Связанные товары
  relatedProductIds: z.array(z.string()),
  oftenBoughtTogether: z.array(z.string()),

  // Демовидео
  demoVideo: z.array(z.object({ src: z.string(), poster: z.string().optional() })),

  // SEO
  metaTitle: z.string().optional(),
  metaDescription: z.string().optional(),
  ogImage: z.string().optional(),
  ogAlt: z.string().optional(),

  // Производитель
  manufacturerName: z.string().optional(),
  manufacturerAddress: z.string().optional(),
  manufacturerEmail: z.string().optional(),

  // Дистрибьютор
  distributorName: z.object({ ru: z.string(), en: z.string(), lv: z.string() }).optional(),
  distributorAddress: z.object({ ru: z.string(), en: z.string(), lv: z.string() }).optional(),
  distributorEmail: z.string().optional(),

  // Бонусы
  bonusRate: z.number().optional(),

  // Рейтинг (для ручного задания при импорте)
  rating: z.number().min(0).max(5).optional(),

  // Характеристики-карточки (feature1-4, мультиязычные)
  feature1: z.string().optional(),
  feature1En: z.string().optional(),
  feature1Lv: z.string().optional(),
  feature2: z.string().optional(),
  feature2En: z.string().optional(),
  feature2Lv: z.string().optional(),
  feature3: z.string().optional(),
  feature3En: z.string().optional(),
  feature3Lv: z.string().optional(),
  feature4: z.string().optional(),
  feature4En: z.string().optional(),
  feature4Lv: z.string().optional(),

  // Краткие характеристики (объём, тип, страна)
  specVolume: z.string().optional(),
  specType: z.string().optional(),
  specCountry: z.string().optional(),
});

export type AddProductFormValues = z.infer<typeof addProductSchema>;
