// Получить товар по id
export function getProductById(id: string): Product | undefined {
  return PRODUCTS.find((p) => p.id === id);
}

// Fix: Define missing types for badges and category
export type BadgeType = 'sale' | 'bestseller' | 'new';
export type CategoryType = 'hair' | 'face' | 'body' | 'nails' | 'equipment' | 'new';

export interface Product {
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
  image: string
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
}

export const isProductOnSale = (product: Product): boolean => {
  return !!product.badges?.includes('sale') || (!!product.oldPrice && product.oldPrice > product.price)
}


const baseProducts: Product[] = [
  {
    id: 'p1',
    title: 'Крем для лица Revitaluxe 50ml',
    brand: 'sanctuaryspa',
    price: 2500,
    oldPrice: 3200,
    rating: 4.7,
    image: '/products/p1.jpg',
    badges: ['sale', 'bestseller', 'new'],
    category: 'face',
    stock: 3,
    purpose: 'Для увлажнения',
    relatedProductIds: ['p3', 'p7'],
    oftenBoughtTogether: ['p3', 'p5'],
    // B2B fields
    sku: 'REVIT-50-001',
    unitOfMeasure: 'мл',
    technicalSpecs: {
      'Объём': '50 мл',
      'Тип': 'Крем для лица',
      'Страна производства': 'Швейцария',
      'Основные ингредиенты': 'Гиалуроновая кислота, витамин E',
      'pH': '5.5-6.5'
    },
    certificates: [
      'https://example.com/certs/dermatology.pdf',
      'https://example.com/certs/iso-9001.pdf'
    ],
    bulkPricingTiers: [
      { quantity: 10, pricePerUnit: 2400 },
      { quantity: 25, pricePerUnit: 2300 },
      { quantity: 50, pricePerUnit: 2200 }
    ],
    compatibleEquipment: ['SkinPro-X', 'MicroBlast-3000']
  },
  {
    id: 'p2',
    title: 'Шампунь Professional Shine 300ml',
    brand: 'black',
    price: 1200,
    rating: 4.4,
    image: '/products/p2.jpg',
    badges: ['bestseller'],
    category: 'hair',
    stock: 8,
    purpose: 'Для роста',
    minOrderQuantities: {
      master: 3,
      salon: 6,
      distributor: 12
    },
    relatedProductIds: ['p4', 'p8'],
    oftenBoughtTogether: ['p4']
  },
  {
    id: 'p3',
    title: 'Сыворотка омолаживающая 30ml',
    brand: 'feetcalm',
    price: 4100,
    oldPrice: 4800,
    rating: 4.9,
    image: '/products/p3.jpg',
    badges: ['new'],
    category: 'face',
    stock: 22,
    purpose: 'Для омоложения',
    relatedProductIds: ['p1', 'p7'],
    oftenBoughtTogether: ['p1', 'p5']
  },
  {
    id: 'p4',
    title: 'Маска для волос Nutri-Repair 200ml',
    brand: 'frutti',
    price: 900,
    rating: 4.2,
    image: '/products/p4.jpg',
    category: 'hair',
    stock: 0,
    purpose: 'Для восстановления',
    relatedProductIds: ['p2', 'p8'],
    oftenBoughtTogether: ['p2']
  },
  {
    id: 'p5',
    title: 'Крем для тела SilkTouch 200ml',
    brand: 'luxina',
    price: 1500,
    rating: 4.3,
    image: '/products/p5.jpg',
    badges: ['sale'],
    category: 'body',
    stock: 12,
    purpose: 'Для питания',
    relatedProductIds: ['p1', 'p3'],
    oftenBoughtTogether: ['p1', 'p3']
  },
  {
    id: 'p6',
    title: 'Аппарат для микродермабразии ProSkin',
    brand: 'ceriotti',
    price: 18500,
    rating: 4.8,
    image: '/products/p6.jpg',
    category: 'equipment',
    stock: 3,
    purpose: 'Для очищения',
    minOrderQuantities: {
      master: 1,
      salon: 1,
      distributor: 2
    },
    relatedProductIds: ['p8'],
    oftenBoughtTogether: ['p1', 'p3'],
    // B2B fields
    sku: 'PROSKIN-MD-2024',
    unitOfMeasure: 'шт',
    technicalSpecs: {
      'Мощность': '100 Вт',
      'Частота вибраций': '25 кГц',
      'Насадки': '3 шт (алмазные, стальные)',
      'Питание': '220V AC',
      'Размеры': '25 x 15 x 10 см',
      'Вес': '2.5 кг',
      'Гарантия': '2 года'
    },
    certificates: [
      'https://example.com/certs/ce-mark.pdf',
      'https://example.com/certs/medical-device.pdf'
    ],
    bulkPricingTiers: [
      { quantity: 3, pricePerUnit: 18000 },
      { quantity: 5, pricePerUnit: 17500 }
    ]
  },
  {
    id: 'p7',
    title: 'Тональная основа PerfectFinish 30ml',
    brand: 'ilu',
    price: 2100,
    rating: 4.1,
    image: '/products/p7.jpg',
    category: 'face',
    stock: 18,
    purpose: 'Для маскировки',
    relatedProductIds: ['p1', 'p3'],
    oftenBoughtTogether: ['p1']
  },
  {
    id: 'p8',
    title: 'Профессиональный фен SalonDry 2200W',
    brand: 'cera',
    price: 7200,
    rating: 4.6,
    image: '/products/p8.jpg',
    badges: ['bestseller'],
    category: 'equipment',
    stock: 5,
    purpose: 'Для сушки',
    minOrderQuantities: {
      master: 2,
      salon: 4,
      distributor: 8
    },
    relatedProductIds: ['p2', 'p6'],
    oftenBoughtTogether: ['p2', 'p4']
  }
];

export const PRODUCTS: Product[] = [
  ...baseProducts,
  // Новые отличающиеся товары
  {
    id: 'p9',
    title: 'Гель для умывания FreshClean 150ml',
    brand: 'freshline',
    price: 1100,
    rating: 4.5,
    image: '/products/p9.jpg',
    badges: ['new', 'bestseller'],
    category: 'face',
    stock: 20,
    purpose: 'Для очищения',
    relatedProductIds: ['p1', 'p3'],
    oftenBoughtTogether: ['p5']
  },
  {
    id: 'p10',
    title: 'Масло для волос ShineOil 100ml',
    brand: 'hairlab',
    price: 1700,
    rating: 4.3,
    image: '/products/p10.jpg',
    badges: ['bestseller'],
    category: 'hair',
    stock: 10,
    purpose: 'Для блеска',
    relatedProductIds: ['p2', 'p4'],
    oftenBoughtTogether: ['p2']
  },
  {
    id: 'p11',
    title: 'Скраб для тела BodyPolish 250ml',
    brand: 'silktouch',
    price: 1350,
    rating: 4.0,
    image: '/products/p11.jpg',
    badges: ['bestseller'],
    category: 'body',
    stock: 14,
    purpose: 'Для обновления кожи',
    relatedProductIds: ['p5'],
    oftenBoughtTogether: ['p5', 'p1']
  },
  {
    id: 'p12',
    title: 'Аппарат для ультразвуковой чистки SkinSonic',
    brand: 'proequip',
    price: 19900,
    rating: 4.9,
    image: '/products/p12.jpg',
    badges: ['bestseller'],
    category: 'equipment',
    stock: 2,
    purpose: 'Для глубокой чистки',
    relatedProductIds: ['p6', 'p8'],
    oftenBoughtTogether: ['p6']
  },
  {
    id: 'p13',
    title: 'Крем для рук HandCare 75ml',
    brand: 'revitaluxe',
    price: 800,
    rating: 4.2,
    image: '/products/p13.jpg',
    badges: ['bestseller'],
    category: 'body',
    stock: 30,
    purpose: 'Для смягчения',
    relatedProductIds: ['p1', 'p11'],
    oftenBoughtTogether: ['p11']
  },
  {
    id: 'p14',
    title: 'Маска для лица NightRepair 50ml',
    brand: 'dermacure',
    price: 3200,
    rating: 4.6,
    image: '/products/p14.jpg',
    badges: ['sale'],
    category: 'face',
    stock: 9,
    purpose: 'Восстановление ночью',
    relatedProductIds: ['p3', 'p9'],
    oftenBoughtTogether: ['p3']
  },
  {
    id: 'p15',
    title: 'Лак для волос StrongFix 250ml',
    brand: 'stylo',
    price: 950,
    rating: 4.1,
    image: '/products/p15.jpg',
    category: 'hair',
    stock: 16,
    purpose: 'Сильная фиксация',
    relatedProductIds: ['p2', 'p10'],
    oftenBoughtTogether: ['p2']
  },
  {
    id: 'p16',
    title: 'Пудра для лица VelvetSkin 10g',
    brand: 'makeuppro',
    price: 1800,
    rating: 4.4,
    image: '/products/p16.jpg',
    category: 'face',
    stock: 11,
    purpose: 'Матирование',
    relatedProductIds: ['p7', 'p14'],
    oftenBoughtTogether: ['p7']
  }
];
