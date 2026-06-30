// Fix: Define missing types for badges and category
export type BadgeType = 'sale' | 'bestseller' | 'new';
export type CategoryType = 'hair' | 'face' | 'body' | 'nails' | 'equipment' | 'new';

export interface Product {
    barcode?: string // Штрихкод товара
  id: string
  titleKey?: string
  title: string
  titleEn?: string
  titleLv?: string
  description?: string
  brand: string
  price: number
  oldPrice?: number
  rating: number // 0-5
  ratingCount?: number
  reviewCount?: number
  image?: string // для обратной совместимости
  images?: string[]
  metaTitle?: string
  metaDescription?: string
  ogImage?: string
  ogAlt?: string
  badges?: BadgeType[]
  category: CategoryType
  stock: number
  purpose?: string
  purposeEn?: string
  purposeLv?: string
  relatedProductIds?: string[] // Similar products
  oftenBoughtTogether?: string[] // Frequently bought together
  minOrderQuantities?: Record<string, number>
  // B2B fields (optional, don't break existing retail products)
  sku?: string // Product article number
  unitOfMeasure?: string // шт, л, кг, etc
  technicalSpecs?: Record<string, string> // Technical characteristics
  certificates?: string[] // URLs to certificate PDFs
  packagingSize?: number // Units per package
  compatibleEquipment?: string[] // Equipment compatibility
  bulkPricingTiers?: Array<{ quantity: number; pricePerUnit: number }> // Volume discounts
  /**
   * URL к демонстрационному видео (mp4, webm и т.д.)
   * demoVideo: { src: string; poster?: string }[]
   */
  demoVideo?: {
    src: string;
    poster?: string;
  }[];
  manufacturerName?: string
  manufacturerAddress?: string
  manufacturerEmail?: string
  bonusRate?: number // Bonus points earned per unit purchased
  distributorName?: { ru: string; en: string; lv: string }
  distributorAddress?: { ru: string; en: string; lv: string }
  distributorEmail?: string
  // Характеристики-карточки (отображаются на странице товара в блоке features)
  feature1?: string
  feature1En?: string
  feature1Lv?: string
  feature2?: string
  feature2En?: string
  feature2Lv?: string
  feature3?: string
  feature3En?: string
  feature3Lv?: string
  feature4?: string
  feature4En?: string
  feature4Lv?: string
  // Краткие характеристики (объём, тип, страна) для блока spec на странице товара
  specVolume?: string
  specType?: string
  specCountry?: string
}

export const isProductOnSale = (product: Product): boolean => {
  return !!product.badges?.includes('sale') || (!!product.oldPrice && product.oldPrice > product.price)
}
