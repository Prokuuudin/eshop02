'use client'

import { Fragment, useMemo } from 'react'
import { usePathname } from 'next/navigation'

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb'
import { BLOG_POSTS, localizeBlogPost } from '@/data/blog'
import { BRANDS } from '@/data/brands'
import { PRODUCTS } from '@/data/products'
import { useTranslation } from '@/lib/use-translation'

interface Crumb {
  href: string
  label: string
}

const segmentLabelKeys: Record<string, string> = {
  catalog: 'nav.catalog',
  blog: 'nav.blog',
  about: 'nav.about',
  contact: 'nav.contact',
  account: 'nav.account',
  analytics: 'account.analyticsTitle',
  invoices: 'account.invoicesTitle',
  wishlist: 'nav.wishlist',
  cart: 'nav.cart',
  admin: 'nav.admin',
  checkout: 'checkout.title',
  order: 'order.title',
  product: 'common.product',
  brand: 'nav.brands',
  auth: 'common.auth',
  login: 'auth.login',
  register: 'auth.register'
}

function normalizeSegment(segment: string): string {
  return decodeURIComponent(segment).replace(/-/g, ' ')
}

function getProductTitle(segment: string): string | null {
  const product = PRODUCTS.find((item) => item.id === decodeURIComponent(segment))
  return product?.title ?? null
}

function getBrandName(segment: string): string | null {
  const brand = BRANDS.find((item) => item.id === decodeURIComponent(segment))
  return brand?.name ?? null
}

function getBlogPostTitle(segment: string, language: 'ru' | 'en' | 'lv'): string | null {
  const post = BLOG_POSTS.find((item) => item.slug === decodeURIComponent(segment))

  if (!post) {
    return null
  }

  return localizeBlogPost(post, language).title
}

export default function AppBreadcrumbs() {
  const pathname = usePathname()
  const { t, language } = useTranslation()

  const crumbs = useMemo<Crumb[]>(() => {
    if (!pathname || pathname === '/') return []

    const segments = pathname.split('/').filter(Boolean)
    return segments.map((segment, index) => {
      const href = `/${segments.slice(0, index + 1).join('/')}`
      const key = segmentLabelKeys[segment]
      const isProductIdSegment = segments[index - 1] === 'product'
      const isBrandIdSegment = segments[index - 1] === 'brand'
      const isBlogSlugSegment = segments[index - 1] === 'blog'
      const resolvedEntityLabel = isProductIdSegment
        ? getProductTitle(segment)
        : isBrandIdSegment
          ? getBrandName(segment)
          : isBlogSlugSegment
            ? getBlogPostTitle(segment, language)
          : null
      const label = resolvedEntityLabel ?? (key ? t(key, normalizeSegment(segment)) : normalizeSegment(segment))

      return { href, label }
    })
  }, [language, pathname, t])

  return (
    <Breadcrumb aria-label={t('breadcrumbs.aria')} className="mb-4 border-b border-gray-200 pb-2 dark:border-gray-800">
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink href="/">{t('nav.home')}</BreadcrumbLink>
        </BreadcrumbItem>

        {crumbs.map((crumb, index) => {
          const isLast = index === crumbs.length - 1

          return (
            <Fragment key={crumb.href}>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                {isLast ? (
                  <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink href={crumb.href}>{crumb.label}</BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </Fragment>
          )
        })}
      </BreadcrumbList>
    </Breadcrumb>
  )
}
