import '../styles/globals.css'
import type { ReactNode } from 'react'
import type { Metadata } from 'next'
import ThemeInitScript from '../components/ThemeInitScript'
import { Inter } from 'next/font/google'
import Header from '../components/Header'
import Footer from '../components/Footer'
import AppBreadcrumbs from '../components/AppBreadcrumbs'
import { Providers } from './providers'
import RouteUiEffects from '../components/RouteUiEffects'
import { getMetadataBase, getSiteUrl } from '@/lib/site-url'

const inter = Inter({ subsets: ['latin', 'cyrillic'], display: 'swap', variable: '--font-inter' })

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

export default function RootLayout({ children }: { children: ReactNode }) {
  const siteUrl = getSiteUrl()

  const organizationSchema = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Eshop',
    url: siteUrl,
    logo: `${siteUrl}/logo.png`,
    sameAs: [
      `${siteUrl}/about`,
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
    <html lang="en">
      <body className={inter.variable}>
        <ThemeInitScript />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteSchema) }} />
        <Providers>
          <RouteUiEffects />
          <Header />
          <main className="w-full pt-[calc(var(--header-offset,150px))] pb-6">
            <div className="mx-auto mt-2 w-full max-w-7xl px-4">
              <AppBreadcrumbs />
            </div>
            {children}
          </main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
