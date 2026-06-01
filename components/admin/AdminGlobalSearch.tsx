'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search, X, ShoppingCart, Package, Users, Tag } from 'lucide-react'
import { useOrders } from '@/lib/orders-store'

// ─── Types ────────────────────────────────────────────────────────────────────

type ResultGroup = {
  label: string
  icon: React.ElementType
  color: string
  items: ResultItem[]
}

type ResultItem = {
  id: string
  label: string
  sub: string
  href: string
}

type CatalogProduct = { id: string; title: string; brand: string; sku?: string }
type PromoCode = { code: string; discount: number; active: boolean; description?: string }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function match(q: string, ...fields: (string | undefined)[]): boolean {
  return fields.some((f) => f?.toLowerCase().includes(q))
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AdminGlobalSearch() {
  const router = useRouter()
  const orders = useOrders((s) => s.orders)

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [products, setProducts] = useState<CatalogProduct[]>([])
  const [promos, setPromos] = useState<PromoCode[]>([])
  const [selectedIdx, setSelectedIdx] = useState(0)

  const inputRef = useRef<HTMLInputElement>(null)

  // ── Load products + promos once ─────────────────────────────────────────────

  useEffect(() => {
    fetch('/api/admin/products')
      .then((r) => r.json())
      .then((d: { data?: { products?: CatalogProduct[] } }) => setProducts(d.data?.products ?? []))
      .catch(() => {})

    fetch('/api/admin/promo-codes')
      .then((r) => r.json())
      .then((d: unknown) => { if (Array.isArray(d)) setPromos(d as PromoCode[]) })
      .catch(() => {})
  }, [])

  // ── Keyboard shortcut Ctrl/⌘ + K ─────────────────────────────────────────

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen((v) => !v)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50)
      setQuery('')
      setSelectedIdx(0)
    }
  }, [open])

  // ── Search ─────────────────────────────────────────────────────────────────

  const groups = useMemo<ResultGroup[]>(() => {
    const q = query.trim().toLowerCase()
    if (q.length < 2) return []

    // Orders
    const orderItems: ResultItem[] = orders
      .filter((o) => match(q, o.id, o.email, o.firstName, o.lastName, `${o.firstName} ${o.lastName}`))
      .slice(0, 4)
      .map((o) => ({
        id: o.id,
        label: `${o.firstName} ${o.lastName}`,
        sub: `${o.id} · ${o.email}`,
        href: `/admin/orders?q=${encodeURIComponent(o.id)}`,
      }))

    // Products
    const productItems: ResultItem[] = products
      .filter((p) => match(q, p.title, p.brand, p.sku))
      .slice(0, 4)
      .map((p) => ({
        id: p.id,
        label: p.title,
        sub: `${p.brand}${p.sku ? ` · ${p.sku}` : ''}`,
        href: `/admin/products/${p.id}`,
      }))

    // Customers (unique emails from orders)
    const customerMap = new Map<string, { name: string; orders: number }>()
    orders.forEach((o) => {
      if (!o.email) return
      const existing = customerMap.get(o.email)
      customerMap.set(o.email, {
        name: `${o.firstName} ${o.lastName}`.trim(),
        orders: (existing?.orders ?? 0) + 1,
      })
    })
    const customerItems: ResultItem[] = Array.from(customerMap.entries())
      .filter(([email, { name }]) => match(q, email, name))
      .slice(0, 4)
      .map(([email, { name, orders: cnt }]) => ({
        id: email,
        label: name || email,
        sub: `${email} · ${cnt} заказов`,
        href: `/admin/customers/profile?email=${encodeURIComponent(email)}`,
      }))

    // Promo codes
    const promoItems: ResultItem[] = promos
      .filter((p) => match(q, p.code, p.description))
      .slice(0, 4)
      .map((p) => ({
        id: p.code,
        label: p.code,
        sub: `${p.discount}% скидка · ${p.active ? 'активен' : 'скрыт'}`,
        href: '/admin/marketing/discounts',
      }))

    return [
      { label: 'Заказы', icon: ShoppingCart, color: 'text-blue-600 dark:text-blue-400', items: orderItems },
      { label: 'Товары', icon: Package, color: 'text-emerald-600 dark:text-emerald-400', items: productItems },
      { label: 'Клиенты', icon: Users, color: 'text-purple-600 dark:text-purple-400', items: customerItems },
      { label: 'Промокоды', icon: Tag, color: 'text-orange-600 dark:text-orange-400', items: promoItems },
    ].filter((g) => g.items.length > 0)
  }, [query, orders, products, promos])

  const allItems = useMemo(() => groups.flatMap((g) => g.items), [groups])
  const isEmpty = query.trim().length >= 2 && allItems.length === 0
  const showHint = query.trim().length < 2

  // ── Keyboard navigation ────────────────────────────────────────────────────

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIdx((i) => Math.min(i + 1, allItems.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIdx((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && allItems[selectedIdx]) {
      navigate(allItems[selectedIdx].href)
    }
  }

  const navigate = (href: string) => {
    setOpen(false)
    router.push(href)
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-1.5 text-sm text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
        title="Глобальный поиск (Ctrl+K)"
      >
        <Search className="h-4 w-4" />
        <span className="hidden sm:inline">Поиск</span>
        <kbd className="hidden sm:inline text-xs opacity-50 font-mono">⌘K</kbd>
      </button>
    )
  }

  let itemCounter = 0

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-50 bg-black/40 dark:bg-black/60 backdrop-blur-sm"
        onClick={() => setOpen(false)}
      />

      {/* Modal */}
      <div className="fixed inset-x-4 top-16 z-50 mx-auto max-w-2xl">
        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-2xl overflow-hidden">

          {/* Input */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 dark:border-gray-800">
            <Search className="h-5 w-5 text-gray-400 shrink-0" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => { setQuery(e.target.value); setSelectedIdx(0) }}
              onKeyDown={handleKeyDown}
              placeholder="Заказ, товар, клиент, промокод..."
              className="flex-1 bg-transparent text-base text-gray-900 dark:text-gray-100 placeholder:text-gray-400 outline-none"
            />
            {query && (
              <button type="button" onClick={() => setQuery('')} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
                <X className="h-4 w-4" />
              </button>
            )}
            <kbd
              onClick={() => setOpen(false)}
              className="text-xs text-gray-400 border border-gray-200 dark:border-gray-700 rounded px-1.5 py-0.5 cursor-pointer font-mono hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              Esc
            </kbd>
          </div>

          {/* Results */}
          <div className="max-h-[60vh] overflow-y-auto py-2">
            {showHint && (
              <p className="px-4 py-6 text-center text-sm text-gray-400 dark:text-gray-500">
                Начните вводить для поиска по всей админке
              </p>
            )}

            {isEmpty && (
              <p className="px-4 py-6 text-center text-sm text-gray-400 dark:text-gray-500">
                Ничего не найдено по запросу «{query}»
              </p>
            )}

            {groups.map((group) => {
              const Icon = group.icon
              return (
                <div key={group.label}>
                  <div className="flex items-center gap-2 px-4 py-1.5">
                    <Icon className={`h-3.5 w-3.5 ${group.color}`} />
                    <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                      {group.label}
                    </span>
                  </div>

                  {group.items.map((item) => {
                    const idx = itemCounter++
                    const isSelected = idx === selectedIdx
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => navigate(item.href)}
                        onMouseEnter={() => setSelectedIdx(idx)}
                        className={[
                          'w-full flex items-start gap-3 px-4 py-2.5 text-left transition-colors',
                          isSelected
                            ? 'bg-indigo-50 dark:bg-indigo-900/20'
                            : 'hover:bg-gray-50 dark:hover:bg-gray-800/50',
                        ].join(' ')}
                      >
                        <div className="min-w-0">
                          <p className={`text-sm font-medium truncate ${isSelected ? 'text-indigo-700 dark:text-indigo-300' : 'text-gray-900 dark:text-gray-100'}`}>
                            {item.label}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">{item.sub}</p>
                        </div>
                        {isSelected && (
                          <span className="shrink-0 self-center text-xs text-gray-400">↵</span>
                        )}
                      </button>
                    )
                  })}
                </div>
              )
            })}
          </div>

          {/* Footer hint */}
          {allItems.length > 0 && (
            <div className="border-t border-gray-100 dark:border-gray-800 px-4 py-2 flex gap-4 text-xs text-gray-400 dark:text-gray-500">
              <span><kbd className="font-mono">↑↓</kbd> навигация</span>
              <span><kbd className="font-mono">↵</kbd> открыть</span>
              <span><kbd className="font-mono">Esc</kbd> закрыть</span>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
