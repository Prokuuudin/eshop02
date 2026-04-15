export type Subcategory = {
  slug: string
  key: string
  search: string
}

export type CategoryCardData = {
  id: string
  titleKey: string
  href: string
  image: string
}

export const CATEGORY_CARDS: CategoryCardData[] = [
  { id: 'hair', titleKey: 'categories.haircare', href: '/catalog?cat=hair', image: '/categories/hair.jpg' },
  { id: 'face', titleKey: 'categories.skincare', href: '/catalog?cat=face', image: '/categories/face.jpg' },
  { id: 'body', titleKey: 'categories.bodycare', href: '/catalog?cat=body', image: '/categories/body.jpg' },
  { id: 'nails', titleKey: 'categories.nails', href: '/catalog?cat=nails', image: '/categories/pro.jpg' },
  { id: 'equipment', titleKey: 'categories.equipment', href: '/catalog?cat=equipment', image: '/categories/equipment.jpg' },
  { id: 'new', titleKey: 'categories.newArrivals', href: '/catalog?cat=new', image: '/categories/new.jpg' }
]

export const SUBCATEGORIES_BY_ID: Record<string, Subcategory[]> = {
  hair: [
    { slug: 'conditioners', key: 'categories.hairSub.conditioners', search: 'КОНДИЦИОНЕРЫ' },
    { slug: 'masks', key: 'categories.hairSub.masks', search: 'МАСКИ ДЛЯ ВОЛОС' },
    { slug: 'coloring', key: 'categories.hairSub.coloring', search: 'ПОКРАСКА И ОТБЕЛИВАНИЕ ВОЛОС' },
    { slug: 'extra-care', key: 'categories.hairSub.extraCare', search: 'ДОПОЛНИТЕЛЬНЫЙ УХОД ЗА ВОЛОСАМИ' },
    { slug: 'shampoos', key: 'categories.hairSub.shampoos', search: 'ШАМПУНИ' },
    { slug: 'styling', key: 'categories.hairSub.styling', search: 'СРЕДСТВА ДЛЯ УКЛАДКИ' },
    { slug: 'barbershop-products', key: 'categories.hairSub.barbershop', search: 'ТОВАРЫ ДЛЯ БАРБЕРШОПОВ' }
  ],
  face: [
    { slug: 'face-care', key: 'categories.skinSub.face', search: 'ДЛЯ ЛИЦА' },
    { slug: 'leg-care', key: 'categories.skinSub.legs', search: 'ДЛЯ НОГ' },
    { slug: 'hand-care', key: 'categories.skinSub.hands', search: 'ДЛЯ РУК' },
    { slug: 'lashes-brows-care', key: 'categories.skinSub.lashesBrows', search: 'УХОД ЗА РЕСНИЦАМИ И БРОВЯМИ' },
    { slug: 'decorative-cosmetics', key: 'categories.skinSub.decorativeMakeup', search: 'ДЕКОРАТИВНАЯ КОСМЕТИКА' }
  ],
  body: [
    { slug: 'solarium-cosmetics', key: 'categories.bodySub.solarium', search: 'КОСМЕТИКА ДЛЯ СОЛЯРИЯ' },
    { slug: 'body-cosmetics', key: 'categories.bodySub.bodyCosmetics', search: 'КОСМЕТИКА ДЛЯ ТЕЛА' },
    { slug: 'waxing', key: 'categories.bodySub.waxing', search: 'ВАКСАЦИЯ' },
    { slug: 'oils', key: 'categories.bodySub.oils', search: 'МАСЛА' },
    { slug: 'perfumery', key: 'categories.bodySub.perfumery', search: 'ПАРФЮМЕРИЯ' }
  ],
  nails: [
    { slug: 'gel-tech-products', key: 'categories.nailsSub.gelTechHelpers', search: 'ВСПОМОГАТЕЛЬНЫЕ СРЕДСТВА ДЛЯ ГЕЛЕВЫХ ТЕХНОЛОГИЙ' },
    { slug: 'uv-gel', key: 'categories.nailsSub.uvGel', search: 'УФ ГЕЛЬ' },
    { slug: 'manicure-pedicure-tools', key: 'categories.nailsSub.manicurePedicureTools', search: 'ПРИНАДЛЕЖНОСТИ ДЛЯ МАНИКЮРА И ПЕДИКЮРА' },
    { slug: 'treatment-recovery', key: 'categories.nailsSub.treatmentRecovery', search: 'СРЕДСТВА ДЛЯ ЛЕЧЕНИЯ И ВОССТАНОВЛЕНИЯ' },
    { slug: 'nail-polishes', key: 'categories.nailsSub.nailPolishes', search: 'ЛАКИ ДЛЯ НОГТЕЙ' },
    { slug: 'gel-polishes', key: 'categories.nailsSub.gelPolishes', search: 'ГЕЛЬ ЛАКИ' },
    { slug: 'nail-care', key: 'categories.nailsSub.nailCare', search: 'УХОД ЗА НОГТЯМИ' }
  ],
  equipment: [
    { slug: 'furniture', key: 'categories.equipmentSub.furniture', search: 'МЕБЕЛЬ' },
    { slug: 'tools', key: 'categories.equipmentSub.tools', search: 'ИНСТРУМЕНТЫ' },
    { slug: 'electrical-goods', key: 'categories.equipmentSub.electrical', search: 'ЭЛЕКТРОТОВАРЫ' }
  ],
  new: [
    { slug: 'gift-ideas', key: 'categories.miscSub.giftIdeas', search: 'ИДЕИ ДЛЯ ПОДАРКОВ' },
    { slug: 'consumables', key: 'categories.miscSub.consumables', search: 'РАСХОДНЫЕ МАТЕРИАЛЫ' },
    { slug: 'salon-products', key: 'categories.miscSub.salonProducts', search: 'ТОВАРЫ ДЛЯ САЛОНОВ' },
    { slug: 'aprons-capes', key: 'categories.miscSub.apronsCapes', search: 'ПЕРЕДНИКИ И ПЕНЬЮАРЫ' },
    { slug: 'hair-accessories', key: 'categories.miscSub.hairAccessories', search: 'АКСЕССУАРЫ ДЛЯ ВОЛОС' },
    { slug: 'disinfection', key: 'categories.miscSub.disinfection', search: 'ДЕЗИНФЕКЦИЯ' }
  ]
}

const SUBCATEGORY_SEARCH_BY_SLUG: Record<string, string> = Object.values(SUBCATEGORIES_BY_ID)
  .flat()
  .reduce<Record<string, string>>((accumulator, item) => {
    accumulator[item.slug] = item.search
    return accumulator
  }, {})

export const getSubcategorySearchBySlug = (slug: string | undefined): string => {
  if (!slug) return ''
  return SUBCATEGORY_SEARCH_BY_SLUG[slug] ?? ''
}

const SUBCATEGORY_PRODUCT_IDS_BY_CATEGORY: Record<string, Record<string, string[]>> = {
  hair: {
    conditioners: [],
    masks: ['p4'],
    coloring: [],
    'extra-care': ['p10'],
    shampoos: ['p2'],
    styling: ['p15'],
    'barbershop-products': ['p8']
  },
  face: {
    'face-care': ['p1', 'p3', 'p7', 'p9', 'p14', 'p16'],
    'leg-care': [],
    'hand-care': ['p13'],
    'lashes-brows-care': [],
    'decorative-cosmetics': ['p7', 'p16']
  },
  body: {
    'solarium-cosmetics': [],
    'body-cosmetics': ['p5', 'p11', 'p13'],
    waxing: [],
    oils: ['p10'],
    perfumery: []
  },
  nails: {
    'gel-tech-products': [],
    'uv-gel': [],
    'manicure-pedicure-tools': [],
    'treatment-recovery': [],
    'nail-polishes': [],
    'gel-polishes': [],
    'nail-care': []
  },
  equipment: {
    furniture: [],
    tools: ['p6', 'p12'],
    'electrical-goods': ['p8']
  },
  new: {
    'gift-ideas': ['p3', 'p6', 'p8', 'p12'],
    consumables: ['p1', 'p2', 'p5', 'p11', 'p13'],
    'salon-products': ['p3', 'p9'],
    'aprons-capes': [],
    'hair-accessories': ['p15'],
    disinfection: []
  }
}

const SUBCATEGORY_PRODUCT_IDS_BY_SLUG: Record<string, string[]> = Object.values(SUBCATEGORY_PRODUCT_IDS_BY_CATEGORY)
  .reduce<Record<string, string[]>>((accumulator, categoryMap) => {
    Object.entries(categoryMap).forEach(([slug, productIds]) => {
      accumulator[slug] = productIds
    })
    return accumulator
  }, {})

export const getSubcategoryProductIdsBySlug = (slug: string | undefined): Set<string> | null => {
  if (!slug) return null
  const ids = SUBCATEGORY_PRODUCT_IDS_BY_SLUG[slug]
  return ids ? new Set(ids) : null
}

const CATEGORY_PRODUCT_IDS_OVERRIDE_BY_ID: Record<string, string[]> = {
  new: Array.from(new Set(Object.values(SUBCATEGORY_PRODUCT_IDS_BY_CATEGORY.new).flat()))
}

export const getCategoryProductIdsOverrideById = (categoryId: string | undefined): Set<string> | null => {
  if (!categoryId) return null
  const ids = CATEGORY_PRODUCT_IDS_OVERRIDE_BY_ID[categoryId]
  return ids ? new Set(ids) : null
}
