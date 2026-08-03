import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Products from '@/components/Products'
import { CATEGORY_CARDS, SUBCATEGORIES_BY_ID } from '@/data/categories'
import { getSiteUrl } from '@/lib/site-url'
import { localizePath, resolveLanguage } from '@/lib/i18n-routing'
import { buildPublicPageMetadata } from '@/lib/page-metadata'
import { getInitialCatalogProducts } from '@/lib/initial-catalog-products'
import { serializeJsonLd } from '@/lib/json-ld'

type PageProps = {
  params: Promise<{ lang: string; slug: string }>
  searchParams: Promise<{ subcat?: string }>
}

const copy = {
  ru: {
    hair: ['Уход за волосами', 'Профессиональные средства для очищения, окрашивания, восстановления и укладки волос.'],
    nails: ['Товары для ногтей', 'Профессиональные материалы и инструменты для маникюра, педикюра и ухода за ногтями.'],
    face: ['Уход за лицом', 'Профессиональная косметика для ежедневного и салонного ухода за кожей лица.'],
    body: ['Уход за телом', 'Профессиональная косметика для ухода за телом, руками и ногами.'],
    equipment: ['Оборудование и инструменты', 'Оборудование, инструменты и расходные материалы для салонов красоты.'],
  },
  en: {
    hair: ['Professional hair care', 'Professional products for cleansing, colouring, restoring and styling hair.'],
    nails: ['Professional nail products', 'Professional materials and tools for manicure, pedicure and nail care.'],
    face: ['Professional face care', 'Professional cosmetics for daily and salon facial skin care.'],
    body: ['Professional body care', 'Professional cosmetics for body, hand and foot care.'],
    equipment: ['Salon equipment and tools', 'Equipment, tools and consumables for beauty professionals and salons.'],
  },
  lv: {
    hair: ['Profesionāla matu kopšana', 'Profesionāli līdzekļi matu attīrīšanai, krāsošanai, atjaunošanai un veidošanai.'],
    nails: ['Profesionāli nagu kopšanas produkti', 'Profesionāli materiāli un instrumenti manikīram, pedikīram un nagu kopšanai.'],
    face: ['Profesionāla sejas kopšana', 'Profesionāla kosmētika ikdienas un salona sejas ādas kopšanai.'],
    body: ['Profesionāla ķermeņa kopšana', 'Profesionāla kosmētika ķermeņa, roku un kāju kopšanai.'],
    equipment: ['Salonu aprīkojums un instrumenti', 'Aprīkojums, instrumenti un materiāli skaistumkopšanas speciālistiem un saloniem.'],
  },
} as const

const isCategory = (slug: string): slug is keyof typeof copy.ru =>
  CATEGORY_CARDS.some((category) => category.id === slug)

export function generateStaticParams(): Array<{ slug: string }> {
  return CATEGORY_CARDS.map(({ id }) => ({ slug: id }))
}

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const { lang, slug } = await params
  const language = resolveLanguage(lang)
  if (!isCategory(slug)) notFound()
  const [title, description] = copy[language][slug]
  const { subcat } = await searchParams
  const path = `/category/${slug}`
  return {
    ...buildPublicPageMetadata({ language, path, title, description }),
    ...(subcat ? { robots: { index: false, follow: true } } : {}),
  }
}

export default async function CategoryPage({ params, searchParams }: PageProps): Promise<React.ReactElement> {
  const { lang, slug } = await params
  const language = resolveLanguage(lang)
  if (!isCategory(slug)) notFound()
  const { subcat } = await searchParams
  const validSubcategory = SUBCATEGORIES_BY_ID[slug]?.some((item) => item.slug === subcat) ? subcat : ''
  const initialCatalog = await getInitialCatalogProducts({
    language,
    category: slug,
    subcategory: validSubcategory || undefined,
  })
  const [title, description] = copy[language][slug]
  const siteUrl = getSiteUrl()
  const url = `${siteUrl}${localizePath(`/category/${slug}`, language)}`
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': `${url}#collection`,
    name: title,
    description,
    url,
    isPartOf: { '@id': `${siteUrl}/#website` },
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(schema) }} />
      <section className="mx-auto w-full max-w-7xl px-4 pt-6">
        <h1 className="text-3xl font-bold text-foreground">{title}</h1>
        <p className="mt-3 max-w-3xl text-muted-foreground">{description}</p>
      </section>
      <Products
        initialProducts={initialCatalog.products}
        baseCategory={slug}
        initialSubcat={validSubcategory}
        initialFilters={{ group: slug }}
      />
    </>
  )
}
