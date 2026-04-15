import type { Language } from './translations'

export type BlogHeadingBlock = {
  type: 'heading'
  level: 1 | 2 | 3
  text: string
}

export type BlogParagraphBlock = {
  type: 'paragraph'
  text: string
}

export type BlogListBlock = {
  type: 'list'
  ordered?: boolean
  items: string[]
}

export type BlogQuoteBlock = {
  type: 'quote'
  text: string
  author?: string
}

export type BlogImageBlock = {
  type: 'image'
  src: string
  alt: string
  caption?: string
}

export type BlogGalleryBlock = {
  type: 'gallery'
  images: Array<{
    src: string
    alt: string
    caption?: string
  }>
}

export type BlogContentBlock =
  | BlogHeadingBlock
  | BlogParagraphBlock
  | BlogListBlock
  | BlogQuoteBlock
  | BlogImageBlock
  | BlogGalleryBlock

export interface BlogPost {
  id: string
  slug: string
  title: string
  excerpt: string
  content: string
  contentBlocks?: BlogContentBlock[]
  author: string
  image: string
  category: string
  readTime: number
  createdAt: Date
  updatedAt?: Date
  featured?: boolean
  translations?: Partial<Record<Language, Partial<Pick<BlogPost, 'title' | 'excerpt' | 'content' | 'contentBlocks' | 'author' | 'category'>>>>
}

export const localizeBlogPost = (post: BlogPost, language: Language): BlogPost => {
  const localized = post.translations?.[language]

  if (!localized) {
    return post
  }

  return {
    ...post,
    title: localized.title ?? post.title,
    excerpt: localized.excerpt ?? post.excerpt,
    content: localized.content ?? post.content,
    contentBlocks: localized.contentBlocks ?? post.contentBlocks,
    author: localized.author ?? post.author,
    category: localized.category ?? post.category
  }
}

export const BLOG_POSTS: BlogPost[] = [
  {
    id: 'post-1',
    slug: 'skincare-routine-guide',
    title: 'Полное руководство по уходу за кожей в 2026 году',
    excerpt: 'Узнайте о правильном порядке нанесения косметики и лучших практиках для здоровой кожи.',
    content: `
# Полное руководство по уходу за кожей

Правильный уход за кожей — это не просто косметика, это инвестиция в здоровье вашей кожи.

## Основные этапы

1. **Очищение** (утром и вечером)
   - Используйте мягкий очищающий средство
   - Массируйте лицо 60 секунд
   - Смойте теплой водой

2. **Тонер**
   - Увлажняет и подготавливает кожу
   - Наносится после очищения

3. **Сыворотка**
   - Концентрированные активные компоненты
   - Наносится на влажную кожу

4. **Крем**
   - Завершающий этап
   - Запечатывает влагу

## Частые ошибки

- Слишком частое очищение
- Игнорирование SPF
- Использование горячей воды
- Переусложнение рутины

Помните, что каждая кожа уникальна!
    `,
    author: 'Мария Косметолог',
    image: '/blog/skincare-guide.jpg',
    category: 'уход за лицом',
    readTime: 5,
    createdAt: new Date('2026-02-15'),
     featured: true,
     translations: {
      en: {
        title: 'Complete Skincare Guide for 2026',
        excerpt: 'Learn the right product layering order and best practices for healthy skin.',
        content: `
  # Complete Skincare Guide

  Proper skincare is not only about cosmetics — it is an investment in skin health.

  ## Core Steps

  1. **Cleansing** (morning and evening)
    - Use a gentle cleanser
    - Massage for 60 seconds
    - Rinse with lukewarm water

  2. **Toner**
    - Hydrates and preps the skin
    - Apply right after cleansing

  3. **Serum**
    - Concentrated active ingredients
    - Apply to slightly damp skin

  4. **Moisturizer**
    - Final step
    - Locks in hydration

  ## Common Mistakes

  - Over-cleansing
  - Skipping SPF
  - Using very hot water
  - Overcomplicating your routine

  Remember: every skin type is unique.
     `,
        author: 'Maria Cosmetologist'
      },
      lv: {
        title: 'Pilnīgs ādas kopšanas ceļvedis 2026. gadam',
        excerpt: 'Uzziniet pareizu līdzekļu lietošanas secību un labākās prakses veselīgai ādai.',
        content: `
  # Pilnīgs ādas kopšanas ceļvedis

  Pareiza ādas kopšana nav tikai kosmētika — tā ir investīcija ādas veselībā.

  ## Galvenie soļi

  1. **Attīrīšana** (no rīta un vakarā)
    - Lietojiet maigu attīrītāju
    - Masējiet 60 sekundes
    - Noskalojiet ar remdenu ūdeni

  2. **Toniks**
    - Mitrina un sagatavo ādu
    - Uzklājiet pēc attīrīšanas

  3. **Serums**
    - Koncentrētas aktīvās sastāvdaļas
    - Uzklājiet uz viegli mitras ādas

  4. **Krēms**
    - Noslēdzošais solis
    - Noslēdz mitrumu ādā

  ## Biežākās kļūdas

  - Pārāk bieža attīrīšana
  - SPF ignorēšana
  - Pārāk karsts ūdens
  - Pārāk sarežģīta rutīna

  Atcerieties: katra āda ir unikāla.
     `,
        author: 'Marija, kosmetoloģe'
      }
     }
  },
  {
    id: 'post-2',
    slug: 'hair-care-winter',
    title: 'Уход за волосами зимой: советы и средства',
    excerpt: 'Как защитить волосы от холода, сухого воздуха и минусовых температур.',
    content: `
# Уход за волосами в Зимний период

Зима — сложное время для волос. Холод, ветер и сухой воздух повреждают структуру волоса.

## Основные проблемы

- Ломкость
- Сухость
- Электризация
- Потеря блеска

## Решения

Используйте увлажняющие маски 2-3 раза в неделю.
Наносите масло перед сном для интенсивного питания.
Носите шапку для защиты.
    `,
    author: 'Анна Стилист',
    image: '/blog/winter-hair.jpg',
    category: 'уход за волосами',
    readTime: 4,
    createdAt: new Date('2026-02-10'),
    featured: true,
    translations: {
      en: {
        title: 'Winter Hair Care: Tips and Products',
        excerpt: 'How to protect your hair from cold weather, dry air, and sub-zero temperatures.',
        content: `
# Winter Hair Care

Winter is a challenging season for hair. Cold wind and dry indoor air can damage the hair fiber.

## Main Issues

- Breakage
- Dryness
- Static electricity
- Loss of shine

## Solutions

Use hydrating masks 2-3 times a week.
Apply hair oil before bed for deeper nourishment.
Wear a hat to protect your hair outside.
    `,
        author: 'Anna Stylist'
      },
      lv: {
        title: 'Matu kopšana ziemā: padomi un līdzekļi',
        excerpt: 'Kā pasargāt matus no aukstuma, sausa gaisa un mīnusa temperatūrām.',
        content: `
# Matu kopšana ziemā

Ziema matiem ir sarežģīts periods. Aukstums, vējš un sausais gaiss bojā matu struktūru.

## Galvenās problēmas

- Lūšana
- Sausums
- Elektrizēšanās
- Spīduma zudums

## Risinājumi

Lietojiet mitrinošas maskas 2-3 reizes nedēļā.
Pirms miega uzklājiet matu eļļu intensīvai barošanai.
Nēsājiet cepuri, lai pasargātu matus ārā.
    `,
        author: 'Anna, stiliste'
      }
    }
  },
  {
    id: 'post-3',
    slug: 'body-care-tips',
    title: 'SPA-уход за телом дома: 7 простых шагов',
    excerpt: 'Превратите ванную комнату в спа-салон с помощью простых процедур.',
    content: `
# SPA-уход за телом дома

Вам не нужен салон, чтобы получить качественный уход.

## Процедура

1. Горячая ванна 15 минут
2. Скраб для тела
3. Маска или масло
4. Лосьон для тела
5. Массаж

Регулярность — ключ к успеху!
    `,
    author: 'Елена Специалист',
    image: '/blog/body-care.jpg',
    category: 'уход за телом',
    readTime: 3,
    createdAt: new Date('2026-02-05'),
    translations: {
      en: {
        title: 'At-Home SPA Body Care: 7 Easy Steps',
        excerpt: 'Turn your bathroom into a mini spa with simple yet effective routines.',
        content: `
# At-Home SPA Body Care

You do not need a salon to get high-quality body care.

## Routine

1. Hot bath for 15 minutes
2. Body scrub
3. Mask or body oil
4. Body lotion
5. Massage

Consistency is the key to great results.
    `,
        author: 'Elena Specialist'
      },
      lv: {
        title: 'SPA ķermeņa kopšana mājās: 7 vienkārši soļi',
        excerpt: 'Pārvērtiet vannasistabu par mini spa ar vienkāršām procedūrām.',
        content: `
# SPA ķermeņa kopšana mājās

Lai iegūtu kvalitatīvu kopšanu, salons nav obligāts.

## Procedūra

1. Karsta vanna 15 minūtes
2. Ķermeņa skrubis
3. Maska vai eļļa
4. Ķermeņa losjons
5. Masāža

Regulāritāte ir panākumu atslēga.
    `,
        author: 'Elēna, speciāliste'
      }
    }
  },
  {
    id: 'post-4',
    slug: 'makeup-trends-2026',
    title: 'Тренды макияжа 2026: что в моде',
    excerpt: 'Актуальные тренды макияжа этого года — от nude до ярких цветов.',
    content: `
# Тренды макияжа 2026

Новый год — новые тренды в макияже.

## В моде

- Natural skin
- Graphic eyeliner
- Bold lips
- Glass skin effect

Экспериментируйте и найдите свой стиль!
    `,
    author: 'Ирина Визажист',
    image: '/blog/makeup-trends.jpg',
    category: 'макияж',
    readTime: 4,
    createdAt: new Date('2026-01-28'),
    translations: {
      en: {
        title: 'Makeup Trends 2026: What Is In',
        excerpt: 'This year’s key makeup trends — from clean nude looks to bold accents.',
        content: `
# Makeup Trends 2026

New year, new beauty trends.

## Trending Now

- Natural skin
- Graphic eyeliner
- Bold lips
- Glass skin effect

Experiment and find the style that fits you best.
    `,
        author: 'Irina Makeup Artist'
      },
      lv: {
        title: 'Grima tendences 2026: kas ir modē',
        excerpt: 'Aktuālās gada grima tendences — no nude līdz drosmīgiem akcentiem.',
        content: `
# Grima tendences 2026

Jauns gads — jaunas tendences grimā.

## Modē

- Dabiska āda
- Grafisks acu laineris
- Izteiksmīgas lūpas
- Glass skin efekts

Eksperimentējiet un atrodiet savu stilu.
    `,
        author: 'Irina, vizāžiste'
      }
    }
  },
  {
    id: 'post-5',
    slug: 'ingredient-spotlight-retinol',
    title: 'Ретинол: панацея от морщин или маркетинг?',
    excerpt: 'Научный взгляд на самый популярный антивозрастной ингредиент.',
    content: `
# Ретинол: полное руководство

Ретинол (витамин A) — один из наиболее изученных компонентов в косметике.

## Доказанные эффекты

- Уменьшение морщин
- Улучшение текстуры
- Выравнивание тона
- Стимуляция коллагена

## Как использовать

Начните с низкой концентрации.
Увеличивайте постепенно.
Используйте SPF днем!
    `,
    author: 'Доктор Смирнов',
    image: '/blog/retinol.jpg',
    category: 'ингредиенты',
    readTime: 6,
    createdAt: new Date('2026-01-20'),
    translations: {
      en: {
        title: 'Retinol: Wrinkle Cure or Marketing Hype?',
        excerpt: 'A science-based look at one of the most popular anti-age ingredients.',
        content: `
# Retinol: Complete Guide

Retinol (vitamin A) is one of the most researched ingredients in skincare.

## Proven Effects

- Reduced fine lines
- Better skin texture
- More even tone
- Collagen stimulation

## How to Use

Start with a low concentration.
Increase gradually.
Always use SPF during daytime.
    `,
        author: 'Dr. Smirnov'
      },
      lv: {
        title: 'Retinols: glābiņš pret grumbām vai mārketings?',
        excerpt: 'Zinātnisks skats uz vienu no populārākajām anti-age sastāvdaļām.',
        content: `
# Retinols: pilnīgs ceļvedis

Retinols (A vitamīns) ir viena no visvairāk pētītajām sastāvdaļām kosmētikā.

## Pierādītie efekti

- Grumbu mazināšana
- Ādas tekstūras uzlabošana
- Toņa izlīdzināšana
- Kolagēna stimulēšana

## Kā lietot

Sāciet ar zemāku koncentrāciju.
Pakāpeniski palieliniet.
Dienā vienmēr lietojiet SPF.
    `,
        author: 'Dr. Smirnovs'
      }
    }
  },
  {
    id: 'post-6',
    slug: 'spring-skin-reset-checklist',
    title: 'Весенний reset кожи: чеклист на 10 минут в день',
    excerpt: 'Простой план ухода на весну: как вернуть сияние, убрать сухость и не перегрузить кожу.',
    content: `
# Весенний reset кожи: чеклист

Весной кожа часто становится чувствительнее из-за перепадов температуры и сухого воздуха в помещениях.

## Что делать каждый день

1. **Мягкое очищение утром и вечером**
2. **Увлажняющая сыворотка** (например, с гиалуроновой кислотой)
3. **Крем по типу кожи**
4. **SPF утром** даже в пасмурную погоду

## Что делать 1-2 раза в неделю

- Энзимный или мягкий кислотный пилинг
- Успокаивающая маска

## Частые ошибки весной

- Резкая смена всей рутины сразу
- Игнорирование SPF
- Слишком агрессивное очищение

Главное правило: вводите новые средства постепенно и наблюдайте за реакцией кожи.
    `,
    contentBlocks: [
      { type: 'heading', level: 1, text: 'Весенний reset кожи: чеклист' },
      {
        type: 'paragraph',
        text: 'Весной кожа часто становится чувствительнее из-за перепадов температуры и сухого воздуха в помещениях.'
      },
      { type: 'heading', level: 2, text: 'Что делать каждый день' },
      {
        type: 'list',
        ordered: true,
        items: [
          'Мягкое очищение утром и вечером',
          'Увлажняющая сыворотка (например, с гиалуроновой кислотой)',
          'Крем по типу кожи',
          'SPF утром даже в пасмурную погоду'
        ]
      },
      {
        type: 'image',
        src: '/blog/skincare-guide.jpg',
        alt: 'Весенний уход за кожей: базовый набор средств',
        caption: 'Базовая рутина весной должна быть мягкой и стабильной.'
      },
      { type: 'heading', level: 2, text: 'Что делать 1-2 раза в неделю' },
      {
        type: 'list',
        items: [
          'Энзимный или мягкий кислотный пилинг',
          'Успокаивающая маска'
        ]
      },
      {
        type: 'gallery',
        images: [
          {
            src: '/blog/body-care.jpg',
            alt: 'Домашний уход и восстановление кожи',
            caption: 'Добавляйте мягкие восстанавливающие этапы.'
          },
          {
            src: '/blog/retinol.jpg',
            alt: 'Активные компоненты в уходе',
            caption: 'Новые активы вводите постепенно и по одному.'
          }
        ]
      },
      {
        type: 'quote',
        text: 'Главное правило: вводите новые средства постепенно и наблюдайте за реакцией кожи.',
        author: 'Ольга Дерматокосметолог'
      }
    ],
    author: 'Ольга Дерматокосметолог',
    image: '/blog/skincare-guide.jpg',
    category: 'уход за лицом',
    readTime: 4,
    createdAt: new Date('2026-03-12'),
    featured: false,
    translations: {
      en: {
        title: 'Spring Skin Reset: 10-Minute Daily Checklist',
        excerpt: 'A simple spring routine to restore glow, reduce dryness, and avoid overloading your skin.',
        content: `
# Spring Skin Reset Checklist

In spring, skin often becomes more reactive due to temperature changes and dry indoor air.

## Daily routine

1. **Gentle cleansing morning and evening**
2. **Hydrating serum** (for example, hyaluronic acid)
3. **Moisturizer for your skin type**
4. **SPF every morning**, even on cloudy days

## 1-2 times per week

- Enzyme or mild acid exfoliation
- Soothing mask

## Common spring mistakes

- Replacing the entire routine at once
- Skipping SPF
- Over-cleansing

Key rule: introduce new products gradually and monitor your skin response.
    `,
        contentBlocks: [
          { type: 'heading', level: 1, text: 'Spring Skin Reset Checklist' },
          {
            type: 'paragraph',
            text: 'In spring, skin often becomes more reactive due to temperature changes and dry indoor air.'
          },
          { type: 'heading', level: 2, text: 'Daily routine' },
          {
            type: 'list',
            ordered: true,
            items: [
              'Gentle cleansing morning and evening',
              'Hydrating serum (for example, hyaluronic acid)',
              'Moisturizer for your skin type',
              'SPF every morning, even on cloudy days'
            ]
          },
          {
            type: 'image',
            src: '/blog/skincare-guide.jpg',
            alt: 'Spring skincare essentials',
            caption: 'Keep your spring routine gentle and consistent.'
          },
          { type: 'heading', level: 2, text: '1-2 times per week' },
          {
            type: 'list',
            items: [
              'Enzyme or mild acid exfoliation',
              'Soothing mask'
            ]
          },
          {
            type: 'gallery',
            images: [
              {
                src: '/blog/body-care.jpg',
                alt: 'At-home skin recovery routine',
                caption: 'Add gentle recovery steps to your routine.'
              },
              {
                src: '/blog/retinol.jpg',
                alt: 'Active ingredients in skincare',
                caption: 'Introduce active ingredients gradually, one by one.'
              }
            ]
          },
          {
            type: 'quote',
            text: 'Key rule: introduce new products gradually and monitor your skin response.',
            author: 'Olga Dermacosmetologist'
          }
        ],
        author: 'Olga Dermacosmetologist'
      },
      lv: {
        title: 'Pavasara ādas reset: 10 minūšu ikdienas kontrolsaraksts',
        excerpt: 'Vienkārša pavasara rutīna, lai atjaunotu mirdzumu, mazinātu sausumu un nepārslogotu ādu.',
        content: `
# Pavasara ādas reset kontrolsaraksts

Pavasarī āda bieži kļūst jutīgāka temperatūras svārstību un sausa iekštelpu gaisa dēļ.

## Ikdienā

1. **Maiga attīrīšana no rīta un vakarā**
2. **Mitrinošs serums** (piemēram, ar hialuronskābi)
3. **Krēms atbilstoši ādas tipam**
4. **SPF katru rītu**, arī mākoņainā laikā

## 1-2 reizes nedēļā

- Enzīmu vai maigs skābju pīlings
- Nomierinoša maska

## Biežākās pavasara kļūdas

- Visa kopšanas plāna nomaiņa uzreiz
- SPF ignorēšana
- Pārāk agresīva attīrīšana

Galvenais noteikums: ieviesiet jaunus līdzekļus pakāpeniski un vērojiet ādas reakciju.
    `,
        contentBlocks: [
          { type: 'heading', level: 1, text: 'Pavasara ādas reset kontrolsaraksts' },
          {
            type: 'paragraph',
            text: 'Pavasarī āda bieži kļūst jutīgāka temperatūras svārstību un sausa iekštelpu gaisa dēļ.'
          },
          { type: 'heading', level: 2, text: 'Ikdienā' },
          {
            type: 'list',
            ordered: true,
            items: [
              'Maiga attīrīšana no rīta un vakarā',
              'Mitrinošs serums (piemēram, ar hialuronskābi)',
              'Krēms atbilstoši ādas tipam',
              'SPF katru rītu, arī mākoņainā laikā'
            ]
          },
          {
            type: 'image',
            src: '/blog/skincare-guide.jpg',
            alt: 'Pavasara ādas kopšanas pamatkomplekts',
            caption: 'Pavasarī rutīnai jābūt maigai un stabilai.'
          },
          { type: 'heading', level: 2, text: '1-2 reizes nedēļā' },
          {
            type: 'list',
            items: [
              'Enzīmu vai maigs skābju pīlings',
              'Nomierinoša maska'
            ]
          },
          {
            type: 'gallery',
            images: [
              {
                src: '/blog/body-care.jpg',
                alt: 'Mājas ādas atjaunošanas rutīna',
                caption: 'Papildiniet rutīnu ar maigiem atjaunojošiem soļiem.'
              },
              {
                src: '/blog/retinol.jpg',
                alt: 'Aktīvās sastāvdaļas kopšanā',
                caption: 'Jaunas aktīvās sastāvdaļas ieviesiet pakāpeniski, pa vienai.'
              }
            ]
          },
          {
            type: 'quote',
            text: 'Galvenais noteikums: ieviesiet jaunus līdzekļus pakāpeniski un vērojiet ādas reakciju.',
            author: 'Olga, dermakosmetoloģe'
          }
        ],
        author: 'Olga, dermakosmetoloģe'
      }
    }
  }
]
