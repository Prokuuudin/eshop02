import type { Metadata } from 'next'
import type { Language } from '@/data/translations'
import { localizePath, pageAlternates } from '@/lib/i18n-routing'

export const SITE_NAME = 'Hairshop-Pro'

type PublicPageMetadataOptions = {
  language: Language
  path: string
  title: string
  description: string
  image?: { url: string; alt: string }
  type?: 'website' | 'article'
}

export function withSiteName(title: string): string {
  return title.includes(SITE_NAME) ? title : `${title} | ${SITE_NAME}`
}

export function buildPublicPageMetadata({
  language,
  path,
  title,
  description,
  image,
  type = 'website',
}: PublicPageMetadataOptions): Metadata {
  const pageTitle = withSiteName(title)
  const images = image ? [image] : undefined

  return {
    title: pageTitle,
    description,
    alternates: pageAlternates(path, language),
    openGraph: {
      title: pageTitle,
      description,
      url: localizePath(path, language),
      type,
      ...(images ? { images } : {}),
    },
    twitter: {
      card: image ? 'summary_large_image' : 'summary',
      title: pageTitle,
      description,
      ...(images ? { images: images.map(({ url }) => url) } : {}),
    },
  }
}
