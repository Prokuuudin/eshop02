import React from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { headers } from 'next/headers'
import { Button } from '@/components/ui/button'
import { PRODUCTS } from '@/data/products'
import { translations, type Language } from '@/data/translations'
import { formatEuro } from '@/lib/utils'

export default async function NotFound() {
  const headersList = await headers();
  const normalized = (headersList.get('accept-language') ?? '').toLowerCase()
  const language: Language = normalized.includes('ru') ? 'ru' : normalized.includes('lv') ? 'lv' : 'en'
  const locale = language === 'ru' ? 'ru-RU' : language === 'lv' ? 'lv-LV' : 'en-US'
  const t = translations[language]
  const suggestedProducts = PRODUCTS.slice(0, 4)

  return (
    <main className="w-full px-4 py-20">
      <div className="max-w-2xl mx-auto text-center mb-16">
        {/* 404 Graphic */}
        <div className="text-9xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-pink-600 mb-4">
          404
        </div>

        <h1 className="text-4xl font-bold mb-4">{t['notFound.title'] ?? 'Page not found'}</h1>

        <p className="text-xl text-gray-600 mb-8">
          {t['notFound.description'] ?? 'Looks like you reached a non-existing page. It may have been removed or the address is incorrect.'}
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center mb-12">
          <Link href="/">
            <Button size="lg">🏠 {t['notFound.home'] ?? 'Home'}</Button>
          </Link>
          <Link href="/catalog">
            <Button variant="outline" size="lg">
              🛍️ {t['notFound.catalog'] ?? 'Catalog'}
            </Button>
          </Link>
        </div>

        <div className="text-center text-gray-600 mb-12">
          <p className="mb-2">💬 {t['notFound.needHelp'] ?? 'Need help?'}</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center text-sm">
            <Link href="/contact" className="text-indigo-600 hover:underline">
              {t['notFound.contact'] ?? 'Contact us'}
            </Link>
            <span className="hidden sm:inline text-gray-400">•</span>
            <Link href="/about" className="text-indigo-600 hover:underline">
              {t['nav.about'] ?? 'About'}
            </Link>
            <span className="hidden sm:inline text-gray-400">•</span>
            <a href="tel:+79998887766" className="text-indigo-600 hover:underline">
              +7 (999) 888-77-66
            </a>
          </div>
        </div>
      </div>

      {/* Suggested Products */}
      <div className="mb-16">
        <h2 className="text-2xl font-bold mb-8 text-center">{t['notFound.suggested'] ?? 'You might be interested in'}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {suggestedProducts.map((product) => (
            <Link key={product.id} href={`/product/${product.id}`} className="group">
              <div className="bg-white rounded-lg border p-4 hover:shadow-lg transition">
                <div className="aspect-square bg-gray-100 rounded mb-3 overflow-hidden relative">
                  <Image
                    src={product.image}
                    alt={product.title}
                    fill
                    className="object-cover group-hover:scale-105 transition"
                  />
                </div>
                <h3 className="font-semibold text-sm group-hover:text-indigo-600 line-clamp-2">{product.title}</h3>
                <p className="text-xs text-gray-600 mt-1">{product.brand}</p>
                <div className="flex justify-between items-center mt-2">
                  <span className="text-indigo-600 font-bold">{formatEuro(product.price, locale)}</span>
                  <span className="text-xs text-yellow-500">★ {product.rating.toFixed(1)}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Quick Links */}
      <div className="bg-gradient-to-r from-indigo-50 to-pink-50 border border-indigo-200 rounded-lg p-8">
        <h2 className="text-xl font-bold mb-6 text-center">{t['notFound.quickLinks'] ?? 'Quick links'}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Link href="/catalog" className="p-4 bg-white rounded-lg hover:shadow-md transition text-center">
            <p className="text-2xl mb-2">🛍️</p>
            <p className="font-medium">{t['notFound.catalogProducts'] ?? 'Product catalog'}</p>
          </Link>
          <Link href="/auth/register" className="p-4 bg-white rounded-lg hover:shadow-md transition text-center">
            <p className="text-2xl mb-2">👤</p>
            <p className="font-medium">{t['auth.register'] ?? 'Register'}</p>
          </Link>
          <Link href="/about" className="p-4 bg-white rounded-lg hover:shadow-md transition text-center">
            <p className="text-2xl mb-2">ℹ️</p>
            <p className="font-medium">{t['nav.about'] ?? 'About'}</p>
          </Link>
          <Link href="/contact" className="p-4 bg-white rounded-lg hover:shadow-md transition text-center">
            <p className="text-2xl mb-2">📞</p>
            <p className="font-medium">{t['notFound.support'] ?? 'Support'}</p>
          </Link>
        </div>
      </div>
    </main>
  )
}
