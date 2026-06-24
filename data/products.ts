// Получить товар по id
export function getProductById(id: string): Product | undefined {
  return PRODUCTS.find((p) => p.id === id);
}

// Fix: Define missing types for badges and category
export type BadgeType = 'sale' | 'bestseller' | 'new';
export type CategoryType = 'hair' | 'face' | 'body' | 'nails' | 'equipment' | 'new';

export interface VariantOption {
  value: string // код как в исходнике: "A-11", "111", "WHITE" — не переводим, не маппим на hex
  priceAdjustment?: number
}

export interface VariantGroup {
  name: string // как в исходнике: "Krāsu numurs", "Izmērs"...
  required: boolean
  options: VariantOption[]
}

export interface SelectedVariant {
  groupName: string
  value: string
  priceAdjustment?: number
}

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
  variantGroups?: VariantGroup[] // Цвет/комплектация — выбор перед добавлением в корзину
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


const DISTRIBUTOR_MIKS_PLUS = {
  distributorName: { ru: 'ООО "MIKS PLUS"', en: 'MIKS PLUS LLC', lv: 'SIA "MIKS PLUS"' },
  distributorAddress: { ru: 'ул. Ренцену, 10A, Рига', en: '10A Rencenu St., Riga', lv: 'Rencēnu iela 10A, Rīga' },
  distributorEmail: 'office@miksplus.eu',
};

const DISTRIBUTOR_BEAUTYLINE = {
  distributorName: { ru: 'BeautyLine Europe B.V.', en: 'BeautyLine Europe B.V.', lv: 'BeautyLine Europe B.V.' },
  distributorAddress: { ru: 'Herengracht 182, 1016 BR Амстердам, Нидерланды', en: 'Herengracht 182, 1016 BR Amsterdam, Netherlands', lv: 'Herengracht 182, 1016 BR Amsterdam, Nīderlande' },
  distributorEmail: 'info@beautyline-eu.com',
};

const DISTRIBUTOR_PROBEAUTY = {
  distributorName: { ru: 'ProBeauty Distribution GmbH', en: 'ProBeauty Distribution GmbH', lv: 'ProBeauty Distribution GmbH' },
  distributorAddress: { ru: 'Kurfürstendamm 55, 10707 Берлин, Германия', en: 'Kurfürstendamm 55, 10707 Berlin, Germany', lv: 'Kurfürstendamm 55, 10707 Berlīne, Vācija' },
  distributorEmail: 'contact@probeauty.de',
};

const DISTRIBUTOR_COSMOTRADE = {
  distributorName: { ru: 'CosmoTrade S.r.l.', en: 'CosmoTrade S.r.l.', lv: 'CosmoTrade S.r.l.' },
  distributorAddress: { ru: 'Via Montenapoleone 8, 20121 Милан, Италия', en: 'Via Montenapoleone 8, 20121 Milan, Italy', lv: 'Via Montenapoleone 8, 20121 Milāna, Itālija' },
  distributorEmail: 'sales@cosmotrade.it',
};

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
    bonusRate: 25,
    manufacturerName: 'Sanctuary Spa Ltd. (United Kingdom)',
    manufacturerAddress: '12 Bath Road, London, EC1A 1BB, United Kingdom',
    manufacturerEmail: 'info@sanctuaryspa.com',
    ...DISTRIBUTOR_BEAUTYLINE,
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
    bonusRate: 12,
    manufacturerName: 'Black Professional S.r.l. (Italy)',
    manufacturerAddress: 'Via Torino 45, 20123 Milan, Italy',
    manufacturerEmail: 'info@blackprofessional.it',
    ...DISTRIBUTOR_COSMOTRADE,
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
    bonusRate: 41,
    manufacturerName: 'Feetcalm S.A. (Spain)',
    manufacturerAddress: 'Carrer de Balmes 78, 08007 Barcelona, Spain',
    manufacturerEmail: 'contact@feetcalm.es',
    ...DISTRIBUTOR_PROBEAUTY,
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
    bonusRate: 9,
    manufacturerName: 'Frutti Professional Sp. z o.o. (Poland)',
    manufacturerAddress: 'ul. Krakowska 12, 00-001 Warsaw, Poland',
    manufacturerEmail: 'info@fruttiprofessional.pl',
    ...DISTRIBUTOR_MIKS_PLUS,
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
    bonusRate: 15,
    manufacturerName: 'Luxina Cosmetici S.r.l. (Italy)',
    manufacturerAddress: 'Via Roma 100, 50123 Florence, Italy',
    manufacturerEmail: 'info@luxina.it',
    ...DISTRIBUTOR_COSMOTRADE,
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
    bonusRate: 185,
    manufacturerName: 'ProSkin Technologies OOO (Russia)',
    manufacturerAddress: 'ул. Ленина, 15, 123456 Moscow, Russia',
    manufacturerEmail: 'info@proskin.ru',
    ...DISTRIBUTOR_MIKS_PLUS,
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
    oftenBoughtTogether: ['p1'],
    bonusRate: 21,
    manufacturerName: 'ILU Beauty Co., Ltd. (South Korea)',
    manufacturerAddress: '45 Gangnam-daero, Gangnam-gu, Seoul, South Korea',
    manufacturerEmail: 'contact@ilubeauty.kr',
    ...DISTRIBUTOR_BEAUTYLINE,
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
    oftenBoughtTogether: ['p2', 'p4'],
    bonusRate: 72,
    manufacturerName: 'Cera Professional AB (Sweden)',
    manufacturerAddress: 'Storgatan 22, 111 23 Stockholm, Sweden',
    manufacturerEmail: 'info@ceraprofessional.se',
    ...DISTRIBUTOR_MIKS_PLUS,
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
    oftenBoughtTogether: ['p5'],
    bonusRate: 11,
    manufacturerName: 'FreshLine Cosmetics Ltd. (Greece)',
    manufacturerAddress: '15 Kifissias Ave., 115 23 Athens, Greece',
    manufacturerEmail: 'info@freshline.gr',
    ...DISTRIBUTOR_PROBEAUTY,
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
    oftenBoughtTogether: ['p2'],
    bonusRate: 17,
    manufacturerName: 'HairLab International GmbH (Germany)',
    manufacturerAddress: 'Hamburger Str. 34, 20095 Hamburg, Germany',
    manufacturerEmail: 'contact@hairlab.de',
    ...DISTRIBUTOR_PROBEAUTY,
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
    oftenBoughtTogether: ['p5', 'p1'],
    bonusRate: 14,
    manufacturerName: 'SilkTouch Beauty S.r.l. (Italy)',
    manufacturerAddress: 'Via Venezia 7, 35121 Padova, Italy',
    manufacturerEmail: 'info@silktouch.it',
    ...DISTRIBUTOR_COSMOTRADE,
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
    oftenBoughtTogether: ['p6'],
    bonusRate: 199,
    manufacturerName: 'ProEquip Technologies GmbH (Germany)',
    manufacturerAddress: 'Münchner Str. 88, 80331 Munich, Germany',
    manufacturerEmail: 'info@proequip.de',
    ...DISTRIBUTOR_PROBEAUTY,
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
    oftenBoughtTogether: ['p11'],
    bonusRate: 8,
    manufacturerName: 'Revitaluxe International S.A. (Switzerland)',
    manufacturerAddress: 'Bahnhofstrasse 12, 8001 Zurich, Switzerland',
    manufacturerEmail: 'contact@revitaluxe.ch',
    ...DISTRIBUTOR_BEAUTYLINE,
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
    oftenBoughtTogether: ['p3'],
    bonusRate: 32,
    manufacturerName: 'DermaCure Laboratories GmbH (Germany)',
    manufacturerAddress: 'Berliner Allee 55, 40212 Düsseldorf, Germany',
    manufacturerEmail: 'info@dermacure.de',
    ...DISTRIBUTOR_PROBEAUTY,
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
    oftenBoughtTogether: ['p2'],
    bonusRate: 10,
    manufacturerName: 'Stylo Professional S.r.l. (Italy)',
    manufacturerAddress: 'Via Emilia 33, 40121 Bologna, Italy',
    manufacturerEmail: 'info@styloprofessional.it',
    ...DISTRIBUTOR_COSMOTRADE,
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
    oftenBoughtTogether: ['p7'],
    bonusRate: 18,
    manufacturerName: 'MakeupPro Cosmetics S.A. (Spain)',
    manufacturerAddress: 'Calle Gran Vía 22, 28013 Madrid, Spain',
    manufacturerEmail: 'contact@makeuppro.es',
    ...DISTRIBUTOR_MIKS_PLUS,
  }
];
