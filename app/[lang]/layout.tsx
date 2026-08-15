import '@/styles/globals.css'
import type { ReactNode } from 'react'
import type { Metadata } from 'next'
import { Instrument_Sans } from 'next/font/google'
import ThemeInitScript from '@/components/ThemeInitScript'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import AppBreadcrumbs from '@/components/AppBreadcrumbs'
import RouteTransition from '@/components/RouteTransition'
import { Providers } from './providers'
import RouteUiEffects from '@/components/RouteUiEffects'
import AuthHydrator from '@/components/auth/AuthHydrator'
import AccountGuard from '@/components/account/AccountGuard'
import { getMetadataBase, getSiteUrl } from '@/lib/site-url'
import { LANGUAGES, resolveLanguage } from '@/lib/i18n-routing'
import { serializeJsonLd } from '@/lib/json-ld'
import { COMPANY } from '@/data/company'
import { getCachedBonusConfig, getCachedLocaleConfig, getCachedSaleBanners } from '@/lib/storefront-cache'

type LayoutProps = {
  children: ReactNode
  params: Promise<{ lang: string }>
}

const instrumentSans = Instrument_Sans({
  subsets: ['latin', 'latin-ext'],
  display: 'swap',
})

export function generateStaticParams(): Array<{ lang: string }> {
  return LANGUAGES.map((lang) => ({ lang }))
}

const metadataBaseUrl = getSiteUrl()

export const metadata: Metadata = {
  metadataBase: getMetadataBase(),
  title: 'Hairshop-Pro - Professional Cosmetics',
  description: 'Professional cosmetics online store',
  openGraph: {
    title: 'Hairshop-Pro - Professional Cosmetics',
    description: 'Professional cosmetics online store',
    type: 'website',
    url: metadataBaseUrl
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Hairshop-Pro - Professional Cosmetics',
    description: 'Professional cosmetics online store'
  }
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
}

export default async function RootLayout({ children, params }: LayoutProps): Promise<React.ReactElement> {
  const { lang } = await params
  const language = resolveLanguage(lang)
  const siteUrl = getSiteUrl()
  const [bonusConfig, localeConfig, saleBanners] = await Promise.all([
    getCachedBonusConfig(),
    getCachedLocaleConfig(),
    getCachedSaleBanners(),
  ])
  const promo = saleBanners[0]
    ? { title: saleBanners[0].title, link: saleBanners[0].link || '/catalog' }
    : null

  const organizationSchema = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${siteUrl}/#organization`,
    name: 'Hairshop-Pro',
    legalName: COMPANY.name,
    url: siteUrl,
    logo: `${siteUrl}/logo.svg`,
    email: COMPANY.email,
    telephone: COMPANY.phone,
    sameAs: COMPANY.sameAs,
    address: {
      '@type': 'PostalAddress',
      streetAddress: COMPANY.legalAddress,
      addressCountry: 'LV',
    },
  }

  const websiteSchema = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${siteUrl}/#website`,
    name: 'Hairshop-Pro',
    url: siteUrl,
    publisher: { '@id': `${siteUrl}/#organization` },
    potentialAction: {
      '@type': 'SearchAction',
      target: `${siteUrl}/catalog?search={search_term_string}`,
      'query-input': 'required name=search_term_string'
    }
  }

  return (
    <html lang={language}>
      <body className={instrumentSans.className}>
        <ThemeInitScript />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(organizationSchema) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(websiteSchema) }} />
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-[100] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground focus:shadow-lg"
        >
          Skip to content
        </a>
        <Providers initialLanguage={language} bonusConfig={bonusConfig} localeConfig={localeConfig}>
          <RouteUiEffects />
          <AuthHydrator />
          {/* Global gate: a hard-blocked user (B2B shared-card / access-request
              Welcome1! default) can't use any page but /account until they set
              their own password. Soft-eligible card+PK users instead get a
              dismissible banner (see PasswordChangeBanner) and aren't blocked. */}
          <AccountGuard>
            <Header />
            <main id="main-content" className="w-full pb-6">
              <div className="mx-auto mt-2 w-full max-w-[1440px] px-4">
                <AppBreadcrumbs />
              </div>
              <RouteTransition>{children}</RouteTransition>
            </main>
            <Footer initialPromo={promo} />
          </AccountGuard>
        </Providers>
      </body>
    </html>
  );
}
