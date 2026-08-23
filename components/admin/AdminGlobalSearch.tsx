'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search, X, ShoppingCart, Package, Users, Tag } from 'lucide-react'
import { adminFetchJson, reportAdminPartial } from '@/lib/admin-ui-errors'

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
type OrderHit = { id: string; firstName: string; lastName: string; email: string }
type CustomerHit = { email: string; firstName: string; lastName: string; totalOrders: number }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function match(q: string, ...fields: (string | undefined)[]): boolean {
  return fields.some((f) => f?.toLowerCase().includes(q))
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AdminGlobalSearch(): React.ReactElement {
  const router = useRouter()

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [products, setProducts] = useState<CatalogProduct[]>([])
  const [promos, setPromos] = useState<PromoCode[]>([])
  const [orderHits, setOrderHits] = useState<OrderHit[]>([])
  const [customerHits, setCustomerHits] = useState<CustomerHit[]>([])
  const [selectedIdx, setSelectedIdx] = useState(0)

  const inputRef = useRef<HTMLInputElement>(null)

  // ── Load products + promos once ─────────────────────────────────────────────

  useEffect(() => {
    adminFetchJson<{ data?: { products?: CatalogProduct[] } }>('/api/admin/products')
      .then((d: { data?: { products?: CatalogProduct[] } }) => setProducts(d.data?.products ?? []))
      .catch(() => reportAdminPartial('Поиск по товарам временно недоступен.', 'Глобальный поиск'))

    adminFetchJson<unknown>('/api/admin/promo-codes')
      .then((d: unknown) => { if (Array.isArray(d)) setPromos(d as PromoCode[]) })
      .catch(() => reportAdminPartial('Поиск по промокодам временно недоступен.', 'Глобальный поиск'))
  }, [])

  // ── Orders + customers are searched server-side (debounced) instead of
  // scanning the entire admin order table in the browser ────────────────────

  useEffect(() => {
    const q = query.trim()
    // Short queries skip the fetch entirely - `groups` below already ignores
    // orderHits/customerHits below the 2-char threshold, so there's nothing
    // to clear synchronously here.
    if (q.length < 2) return
    const controller = new AbortController()
    const t = setTimeout(() => {
      fetch(`/api/admin/orders?search=${encodeURIComponent(q)}&take=4`, { signal: controller.signal, cache: 'no-store' })
        .then((res) => (res.ok ? res.json() : null))
        .then((data: { orders?: OrderHit[] } | null) => setOrderHits(data?.orders ?? []))
        .catch(() => { if (!controller.signal.aborted) setOrderHits([]) })

      fetch(`/api/admin/customers?search=${encodeURIComponent(q)}&pageSize=4`, { signal: controller.signal, cache: 'no-store' })
        .then((res) => (res.ok ? res.json() : null))
        .then((data: { customers?: CustomerHit[] } | null) => setCustomerHits(data?.customers ?? []))
        .catch(() => { if (!controller.signal.aborted) setCustomerHits([]) })
    }, 250)
    return () => { clearTimeout(t); controller.abort() }
  }, [query])

  // ── Keyboard shortcut Ctrl/⌘ + K ─────────────────────────────────────────

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setQuery('')
        setSelectedIdx(0)
        setOpen(true)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  // ── Search ─────────────────────────────────────────────────────────────────

  const groups = useMemo<ResultGroup[]>(() => {
    const q = query.trim().toLowerCase()
    if (q.length < 2) return []

    // Orders (server-searched)
    const orderItems: ResultItem[] = orderHits.map((o) => ({
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

    // Customers (server-searched)
    const customerItems: ResultItem[] = customerHits.map((c) => ({
      id: c.email,
      label: [c.firstName, c.lastName].filter(Boolean).join(' ') || c.email,
      sub: `${c.email} · ${c.totalOrders} заказов`,
      href: `/admin/customers/profile?email=${encodeURIComponent(c.email)}`,
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
  }, [query, orderHits, customerHits, products, promos])

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
        onClick={() => {
          setQuery('')
          setSelectedIdx(0)
          setOpen(true)
        }}
        className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-sm text-muted-foreground hover:border-gray-300 dark:hover:border-gray-600 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
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
      <button
        type="button"
        aria-label="Закрыть поиск"
        className="fixed inset-0 z-50 bg-black/40 dark:bg-black/60 backdrop-blur-sm"
        onClick={() => setOpen(false)}
      />

      {/* Modal */}
      <div className="fixed inset-x-4 top-16 z-50 mx-auto max-w-2xl">
        <div className="rounded-2xl border border-border bg-card shadow-2xl overflow-hidden">

          {/* Input */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
            <Search className="h-5 w-5 text-muted-foreground shrink-0" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => { setQuery(e.target.value); setSelectedIdx(0) }}
              onKeyDown={handleKeyDown}
              placeholder="Заказ, товар, клиент, промокод..."
              className="flex-1 bg-transparent text-base text-foreground placeholder:text-gray-400 outline-none"
            />
            {query && (
              <button type="button" onClick={() => setQuery('')} className="text-muted-foreground hover:text-gray-700 dark:hover:text-gray-200">
                <X className="h-4 w-4" />
              </button>
            )}
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-xs text-muted-foreground border border-border rounded px-1.5 py-0.5 cursor-pointer font-mono hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              Esc
            </button>
          </div>

          {/* Results */}
          <div className="max-h-[60vh] overflow-y-auto py-2">
            {showHint && (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                Начните вводить для поиска по всей админке
              </p>
            )}

            {isEmpty && (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                Ничего не найдено по запросу «{query}»
              </p>
            )}

            {groups.map((group) => {
              const Icon = group.icon
              return (
                <div key={group.label}>
                  <div className="flex items-center gap-2 px-4 py-1.5">
                    <Icon className={`h-3.5 w-3.5 ${group.color}`} />
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
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
                            ? 'bg-primary/5 dark:bg-primary/10'
                            : 'hover:bg-gray-50 dark:hover:bg-gray-800/50',
                        ].join(' ')}
                      >
                        <div className="min-w-0">
                          <p className={`text-sm font-medium truncate ${isSelected ? 'text-primary dark:text-primary' : 'text-foreground'}`}>
                            {item.label}
                          </p>
                          <p className="text-xs text-muted-foreground truncate mt-0.5">{item.sub}</p>
                        </div>
                        {isSelected && (
                          <span className="shrink-0 self-center text-xs text-muted-foreground">↵</span>
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
            <div className="border-t border-border px-4 py-2 flex gap-4 text-xs text-muted-foreground">
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
