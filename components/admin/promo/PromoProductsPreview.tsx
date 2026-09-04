'use client'

import { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { useAdminLocale } from '@/lib/use-admin-locale'

type PreviewProduct = { id: string; title: string; brand: string; image: string | null; isActive: boolean }

export function PromoProductsPreview({ appliesTo = 'all', categories = [], subcategories = [], brands = [], productIds = [], excludedProductIds = [], excludeSaleItems = false }: {
  appliesTo?: 'all' | 'products' | 'brands' | 'categories' | 'rules'
  categories?: string[]
  subcategories?: string[]
  brands?: string[]
  productIds?: string[]
  excludedProductIds?: string[]
  excludeSaleItems?: boolean
}): React.ReactElement {
  const { l } = useAdminLocale()
  const payload = useMemo(() => ({ appliesTo, categories, subcategories, brands, productIds, excludedProductIds, excludeSaleItems }), [appliesTo, categories, subcategories, brands, productIds, excludedProductIds, excludeSaleItems])
  const [result, setResult] = useState<{ total: number; products: PreviewProduct[] } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      setLoading(true)
      fetch('/api/admin/promo-products-preview', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: controller.signal,
      }).then(async (response) => {
        if (!response.ok) throw new Error('preview_failed')
        return response.json() as Promise<{ total: number; products: PreviewProduct[] }>
      }).then(setResult).catch((error: unknown) => {
        if ((error as { name?: string })?.name !== 'AbortError') setResult(null)
      }).finally(() => setLoading(false))
    }, 250)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [payload])

  return <section className="sm:col-span-2 lg:col-span-4 rounded-lg border border-primary/20 bg-primary/5 p-4">
    <div className="flex items-center justify-between gap-3">
      <h3 className="font-medium text-foreground">{l('Результат фильтрации', 'Filter result', 'Filtra rezultāts')}</h3>
      <span className="rounded-full bg-primary px-3 py-1 text-sm font-semibold text-primary-foreground">
        {loading ? '…' : result?.total ?? 0} {l('товаров', 'products', 'produkti')}
      </span>
    </div>
    {!loading && result?.total === 0 && <p className="mt-3 text-sm text-destructive">{l('Ни один товар не соответствует выбранным условиям.', 'No products match the selected conditions.', 'Neviens produkts neatbilst izvēlētajiem nosacījumiem.')}</p>}
    {(result?.products.length ?? 0) > 0 && <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
      {result!.products.map((product) => <div key={product.id} className="flex items-center gap-3 rounded-md border border-border bg-card p-2">
        <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded bg-muted">
          {product.image && <Image src={product.image} alt="" fill sizes="40px" className="object-contain" />}
        </div>
        <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{product.title}</p><p className="truncate text-xs text-muted-foreground">{product.brand} · ID {product.id}</p></div>
        {!product.isActive && <span className="text-xs text-muted-foreground">{l('Скрыт', 'Hidden', 'Paslēpts')}</span>}
      </div>)}
    </div>}
    {(result?.total ?? 0) > 8 && <p className="mt-2 text-xs text-muted-foreground">{l('Показаны первые 8 из', 'Showing the first 8 of', 'Parādīti pirmie 8 no')} {result!.total}</p>}
  </section>
}
