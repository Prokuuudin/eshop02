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
  title: 'Eshop - Professional Cosmetics',
  description: 'Professional cosmetics online store',
  openGraph: {
    title: 'Eshop - Professional Cosmetics',
    description: 'Professional cosmetics online store',
    type: 'website',
    url: metadataBaseUrl
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Eshop - Professional Cosmetics',
    description: 'Professional cosmetics online store'
  }
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
}

export default async function RootLayout({ children, params }: LayoutProps) {
  const { lang } = await params
  const language = resolveLanguage(lang)
  const siteUrl = getSiteUrl()

  const organizationSchema = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Eshop',
    url: siteUrl,
    logo: `${siteUrl}/logo.png`,
    sameAs: [
      `${siteUrl}/contact`
    ]
  }

  const websiteSchema = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Eshop',
    url: siteUrl,
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
          Пропустить к содержимому / Skip to content
        </a>
        <Providers initialLanguage={language}>
          <RouteUiEffects />
          <AuthHydrator />
          {/* Global gate: a cardholder who hasn't set their own password yet
              (mustChangePassword) must not be able to use any page, not just
              /account — the shared welcome password only unlocks this modal. */}
          <AccountGuard>
            <Header />
            <main id="main-content" className="w-full pb-6">
              <div className="mx-auto mt-2 w-full max-w-7xl px-4">
                <AppBreadcrumbs />
              </div>
              <RouteTransition>{children}</RouteTransition>
            </main>
            <Footer />
          </AccountGuard>
        </Providers>
      </body>
    </html>
  );
}
