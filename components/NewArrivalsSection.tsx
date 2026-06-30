"use client";
import React from 'react'
import Link from 'next/link'
import type { Product } from '../data/products'
import ProductCard from './ProductCard'
import { useTranslation } from '@/lib/use-translation'

export default function NewArrivalsSection() {
  const { t } = useTranslation()
  const [newArrivals, setNewArrivals] = React.useState<Product[]>([])

  React.useEffect(() => {
    fetch('/api/products', { cache: 'no-store' })
      .then((r) => r.json())
      .then((p: { data?: { products?: Product[] } }) => {
        const products = p.data?.products ?? []
        setNewArrivals(products.filter((item) => item.badges?.includes('new')).slice(0, 8))
      })
      .catch(() => setNewArrivals([]))
  }, [])

  if (!newArrivals.length) return null

  return (
    <section className="newarrivals py-8">
      <div className="w-full px-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 mb-4">
          <h2 className="text-2xl font-semibold text-foreground">{t('products.newArrivals')}</h2>
          <Link
            href="/catalog"
            className="inline-flex w-full sm:w-auto justify-center items-center px-3 py-2 min-h-[44px] rounded bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-100 transition-colors"
            style={{ textDecoration: 'none', fontWeight: 500 }}
          >
            {t('nav.catalog')}
          </Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {newArrivals.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      </div>
    </section>
  )
}
