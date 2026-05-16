// Получить товар по id
export function getProductById(id: string): Product | undefined {
  return PRODUCTS.find((p) => p.id === id);
}

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
  images?: string[] // до 5 изображений
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
    images: [
      '/products/p1.jpg',
      '/products/p1-2.jpg',
      '/products/p1-3.jpg',
      '/products/p1-4.jpg',
      '/products/p1-5.jpg',
    ],
    demoVideo: [
      {
        src: '/products/demo/revitaluxe-demo.mp4',
        poster: '/products/p1.jpg'
      },
      {
        src: '/products/demo/revitaluxe-demo-2.mp4',
        poster: '/products/p1-2.jpg'
      },
      {
        src: '/products/demo/revitaluxe-demo-3.mp4',
        poster: '/products/p1-3.jpg'
      }
    ],
    badges: ['sale', 'bestseller', 'new'],
    category: 'face',
    stock: 3,
    purpose: 'Для увлажнения',
    relatedProductIds: ['p3', 'p7'],
    oftenBoughtTogether: ['p3', 'p5'],
    // B2B fields
    sku: 'REVIT-50-001',
    barcode: '4006381333931', // Сымитированный штрихкод
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
    compatibleEquipment: ['SkinPro-X', 'MicroBlast-3000'],
  },
  {
    id: 'p2',
    title: 'Шампунь Professional Shine 300ml',
    brand: 'black',
    price: 1200,
    rating: 4.4,
    image: '/products/p2.jpg',
    images: [
      '/products/p2.jpg',
      '/products/p2-2.jpg',
      '/products/p2-3.jpg',
      '/products/p2-4.jpg',
      '/products/p2-5.jpg',
    ],
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
    oftenBoughtTogether: ['p4'],
  },
  {
    id: 'p3',
    title: 'Сыворотка омолаживающая 30ml',
    brand: 'feetcalm',
    price: 4100,
    oldPrice: 4800,
    rating: 4.9,
    image: '/products/p3.jpg',
    images: [
      '/products/p3.jpg',
      '/products/p3-2.jpg',
      '/products/p3-3.jpg',
      '/products/p3-4.jpg',
      '/products/p3-5.jpg',
    ],
    badges: ['new'],
    category: 'face',
    stock: 22,
    purpose: 'Для омоложения',
    relatedProductIds: ['p1', 'p7'],
    oftenBoughtTogether: ['p1', 'p5'],
  },
  {
    id: 'p4',
    title: 'Маска для волос Nutri-Repair 200ml',
    brand: 'frutti',
    price: 900,
    rating: 4.2,
    image: '/products/p4.jpg',
    images: [
      '/products/p4.jpg',
      '/products/p4-2.jpg',
      '/products/p4-3.jpg',
      '/products/p4-4.jpg',
      '/products/p4-5.jpg',
    ],
    category: 'hair',
    stock: 0,
    purpose: 'Для восстановления',
    relatedProductIds: ['p2', 'p8'],
    oftenBoughtTogether: ['p2'],
  },
  {
    id: 'p5',
    title: 'Крем для тела SilkTouch 200ml',
    brand: 'luxina',
    price: 1500,
    rating: 4.3,
    image: '/products/p5.jpg',
    images: [
      '/products/p5.jpg',
      '/products/p5-2.jpg',
      '/products/p5-3.jpg',
      '/products/p5-4.jpg',
      '/products/p5-5.jpg',
    ],
    badges: ['sale'],
    category: 'body',
    stock: 12,
    purpose: 'Для питания',
    relatedProductIds: ['p1', 'p3'],
    oftenBoughtTogether: ['p1', 'p3'],
  },
  {
    id: 'p6',
    title: 'Аппарат для микродермабразии ProSkin',
    brand: 'proskinrus',
    price: 18500,
    rating: 4.8,
    image: '/products/p6.jpg',
    images: [
      '/products/p6.jpg',
      '/products/p6-2.jpg',
      '/products/p6-3.jpg',
      '/products/p6-4.jpg',
      '/products/p6-5.jpg',
    ],
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
    ],
  },
  {
    id: 'p7',
    title: 'Тональная основа PerfectFinish 30ml',
    brand: 'ilu',
    price: 2100,
    rating: 4.1,
    image: '/products/p7.jpg',
    images: [
      '/products/p7.jpg',
      '/products/p7-2.jpg',
      '/products/p7-3.jpg',
      '/products/p7-4.jpg',
      '/products/p7-5.jpg',
    ],
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
    images: [
      '/products/p8.jpg',
      '/products/p8-2.jpg',
      '/products/p8-3.jpg',
      '/products/p8-4.jpg',
      '/products/p8-5.jpg',
    ],
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
    images: [
      '/products/p9.jpg',
      '/products/p9-2.jpg',
      '/products/p9-3.jpg',
      '/products/p9-4.jpg',
      '/products/p9-5.jpg',
    ],
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
    images: [
      '/products/p10.jpg',
      '/products/p10-2.jpg',
      '/products/p10-3.jpg',
      '/products/p10-4.jpg',
      '/products/p10-5.jpg',
    ],
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
    images: [
      '/products/p11.jpg',
      '/products/p11-2.jpg',
      '/products/p11-3.jpg',
      '/products/p11-4.jpg',
      '/products/p11-5.jpg',
    ],
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
    images: [
      '/products/p12.jpg',
      '/products/p12-2.jpg',
      '/products/p12-3.jpg',
      '/products/p12-4.jpg',
      '/products/p12-5.jpg',
    ],
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
    images: [
      '/products/p13.jpg',
      '/products/p13-2.jpg',
      '/products/p13-3.jpg',
      '/products/p13-4.jpg',
      '/products/p13-5.jpg',
      '/products/p13-2.jpg',
    ],
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
    images: [
      '/products/p14.jpg',
      '/products/p14-2.jpg',
      '/products/p14-3.jpg',
      '/products/p14-4.jpg',
      '/products/p14-5.jpg',
    ],
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
    images: [
      '/products/p15.jpg',
      '/products/p15-2.jpg',
      '/products/p15-3.jpg',
      '/products/p15-4.jpg',
      '/products/p15-5.jpg',
    ],
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
    images: [
      '/products/p16.jpg',
      '/products/p16-2.jpg',
      '/products/p16-3.jpg',
      '/products/p16-4.jpg',
      '/products/p16-5.jpg',
    ],
    category: 'face',
    stock: 11,
    purpose: 'Матирование',
    relatedProductIds: ['p7', 'p14'],
    oftenBoughtTogether: ['p7']
  }
];
