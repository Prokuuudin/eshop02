'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import AdminGate from '@/components/admin/AdminGate'
import { Button } from '@/components/ui/button'
import { formatEuro } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

type CatalogProduct = {
  id: string
  title: string
  brand: string
  category: string
  price: number
  stock: number
  sku?: string
  image?: string
}

type DuplicateGroup = {
  key: string
  reason: 'title' | 'sku'
  reasonLabel: string
  products: CatalogProduct[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeTitle(t: string): string {
  return t.trim().toLowerCase().replace(/\s+/g, ' ')
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function DuplicatesPage() {
  const [products, setProducts] = useState<CatalogProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'title' | 'sku'>('all')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  useEffect(() => {
    fetch('/api/admin/products')
      .then((r) => r.json())
      .then((data: { data?: { products?: CatalogProduct[] } }) => {
        setProducts(data.data?.products ?? [])
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const groups = useMemo<DuplicateGroup[]>(() => {
    const result: DuplicateGroup[] = []
    const seen = new Set<string>()  // prevent same product appearing in two title-groups

    // ── By title
    const titleMap = new Map<string, CatalogProduct[]>()
    products.forEach((p) => {
      const key = normalizeTitle(p.title)
      if (!titleMap.has(key)) titleMap.set(key, [])
      titleMap.get(key)!.push(p)
    })
    titleMap.forEach((group, key) => {
      if (group.length < 2) return
      result.push({
        key: `title:${key}`,
        reason: 'title',
        reasonLabel: 'Одинаковое название',
        products: group,
      })
      group.forEach((p) => seen.add(p.id))
    })

    // ── By SKU (non-empty)
    const skuMap = new Map<string, CatalogProduct[]>()
    products.forEach((p) => {
      const sku = p.sku?.trim()
      if (!sku) return
      const key = sku.toLowerCase()
      if (!skuMap.has(key)) skuMap.set(key, [])
      skuMap.get(key)!.push(p)
    })
    skuMap.forEach((group, key) => {
      if (group.length < 2) return
      result.push({
        key: `sku:${key}`,
        reason: 'sku',
        reasonLabel: `Одинаковый SKU: ${group[0].sku}`,
        products: group,
      })
    })

    return result.sort((a, b) => b.products.length - a.products.length)
  }, [products])

  const filtered = filter === 'all' ? groups : groups.filter((g) => g.reason === filter)

  const counts = useMemo(() => ({
    title: groups.filter((g) => g.reason === 'title').length,
    sku: groups.filter((g) => g.reason === 'sku').length,
  }), [groups])

  const toggleExpand = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <AdminGate access="full">
      <main className="w-full py-4 space-y-6">

        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Дубликаты товаров</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Товары с одинаковым названием или SKU — возможные дубликаты после импорта.
            </p>
          </div>
          <div className="flex gap-2">
            <Link href="/admin/products"><Button variant="outline">← Товары</Button></Link>
          </div>
        </div>

        {loading ? (
          <div className="py-16 text-center text-sm text-gray-400">Загрузка каталога...</div>
        ) : groups.length === 0 ? (
          <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/10 px-5 py-8 text-center">
            <p className="text-lg font-semibold text-emerald-700 dark:text-emerald-300">Дубликатов не найдено</p>
            <p className="text-sm text-emerald-600 dark:text-emerald-400 mt-1">
              Все {products.length} товаров имеют уникальные названия и SKU.
            </p>
          </div>
        ) : (
          <>
            {/* Summary + filters */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex flex-wrap gap-2">
                {([
                  { value: 'all' as const, label: `Все (${groups.length})` },
                  { value: 'title' as const, label: `По названию (${counts.title})` },
                  { value: 'sku' as const, label: `По SKU (${counts.sku})` },
                ]).map((tab) => (
                  <button
                    key={tab.value}
                    type="button"
                    onClick={() => setFilter(tab.value)}
                    className={[
                      'rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors',
                      filter === tab.value
                        ? 'bg-primary border-primary text-white'
                        : 'border-border bg-card text-muted-foreground hover:border-gray-300',
                    ].join(' ')}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-400 dark:text-gray-500 ml-auto">
                {products.length} товаров проверено
              </p>
            </div>

            {/* Groups */}
            <div className="space-y-3">
              {filtered.map((group) => {
                const isOpen = expanded.has(group.key)
                return (
                  <div
                    key={group.key}
                    className={[
                      'rounded-xl border overflow-hidden',
                      group.reason === 'sku'
                        ? 'border-amber-200 dark:border-amber-800'
                        : 'border-orange-200 dark:border-orange-800',
                    ].join(' ')}
                  >
                    {/* Group header */}
                    <button
                      type="button"
                      onClick={() => toggleExpand(group.key)}
                      className={[
                        'w-full text-left px-5 py-3.5 flex items-center justify-between gap-3 transition-colors',
                        group.reason === 'sku'
                          ? 'bg-amber-50 dark:bg-amber-900/10 hover:bg-amber-100 dark:hover:bg-amber-900/20'
                          : 'bg-orange-50 dark:bg-orange-900/10 hover:bg-orange-100 dark:hover:bg-orange-900/20',
                      ].join(' ')}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className={[
                          'shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold',
                          group.reason === 'sku'
                            ? 'bg-amber-200 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300'
                            : 'bg-orange-200 text-orange-800 dark:bg-orange-900/60 dark:text-orange-300',
                        ].join(' ')}>
                          {group.products.length} товара
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">
                            {group.products[0].title}
                          </p>
                          <p className="text-xs text-muted-foreground">{group.reasonLabel}</p>
                        </div>
                      </div>
                      <span className="text-gray-400 text-xs shrink-0">{isOpen ? '▲' : '▼'}</span>
                    </button>

                    {/* Products in group */}
                    {isOpen && (
                      <div className="divide-y divide-gray-100 dark:divide-gray-800 bg-card">
                        {group.products.map((p, i) => (
                          <div key={p.id} className="flex items-center gap-4 px-5 py-3">
                            {/* Image */}
                            <div className="h-12 w-12 shrink-0 rounded-lg overflow-hidden bg-muted border border-border">
                              {p.image
                                ? <img src={p.image} alt={p.title} className="w-full h-full object-cover" />
                                : <div className="w-full h-full flex items-center justify-center text-xs text-gray-300 dark:text-gray-600">нет</div>
                              }
                            </div>

                            {/* Info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="text-sm font-medium text-foreground truncate">
                                  {p.title}
                                </p>
                                {i === 0 && (
                                  <span className="text-xs rounded-full bg-muted px-2 py-0.5 text-muted-foreground">оригинал?</span>
                                )}
                              </div>
                              <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5 text-xs text-muted-foreground">
                                <span>ID: <code className="font-mono">{p.id}</code></span>
                                {p.sku && <span>SKU: <code className="font-mono">{p.sku}</code></span>}
                                <span>{p.brand}</span>
                                <span className="capitalize">{p.category}</span>
                              </div>
                            </div>

                            {/* Price + stock */}
                            <div className="shrink-0 text-right">
                              <p className="text-sm font-semibold text-foreground">
                                {formatEuro(p.price, 'ru-RU')}
                              </p>
                              <p className={`text-xs mt-0.5 ${p.stock === 0 ? 'text-red-500' : 'text-gray-400'}`}>
                                {p.stock === 0 ? 'Нет в наличии' : `${p.stock} шт`}
                              </p>
                            </div>

                            {/* Edit link */}
                            <Link
                              href={`/admin/products/${p.id}`}
                              className="shrink-0 rounded-lg border border-primary/50 dark:border-primary/50 px-3 py-1.5 text-xs font-medium text-primary dark:text-primary hover:bg-primary/5 dark:hover:bg-indigo-900/20 transition-colors whitespace-nowrap"
                            >
                              Редактировать
                            </Link>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}
      </main>
    </AdminGate>
  )
}
