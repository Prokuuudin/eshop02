"use client";
import React from 'react'
import { type Product } from '../data/products'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import ProductCard from './ProductCard'
import ProductCardSkeleton from './ProductCardSkeleton'
import { useTranslation } from '@/lib/use-translation'
import { brandSlug } from '@/lib/brand-slug'

import ProductFilter from './ProductFilter'
import { LayoutGrid, List, X } from 'lucide-react'
import ProductListRow from './ProductListRow'
import { SUBCATEGORIES_BY_ID } from '@/data/categories'

type ProductsFilters = {
  group: string
  subcat: string
  onSale: boolean
  brands: string[]
  minPrice: string
  maxPrice: string
  order?: string
}

type ProductsProps = {
  initialFilters?: Partial<ProductsFilters>
  initialSearch?: string
  initialSubcat?: string
}

const isProductOnSale = (product: Product): boolean => {
  return !!product.badges?.includes('sale') || (!!product.oldPrice && product.oldPrice > product.price)
}

export default function Products({ initialFilters, initialSearch = '', initialSubcat = '' }: ProductsProps) {
  const { t, language } = useTranslation();
  const [products, setProducts] = React.useState<Product[]>([])
  const [productsLoading, setProductsLoading] = React.useState(true)
  const [productsWarning, setProductsWarning] = React.useState('')
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const searchQuery = initialSearch.trim();
  // Single source of truth for filters
  const [filters, setFilters] = React.useState<ProductsFilters>({
    group: initialFilters?.group ?? '',
    subcat: initialSubcat,
    onSale: initialFilters?.onSale ?? false,
    brands: initialFilters?.brands ?? [],
    minPrice: initialFilters?.minPrice ?? '',
    maxPrice: initialFilters?.maxPrice ?? '',
    order: initialFilters?.order ?? ''
  });

  const [viewMode, setViewMode] = React.useState<'grid' | 'list'>(() => {
    if (typeof window === 'undefined') return 'grid'
    return (localStorage.getItem('catalog-view-mode') as 'grid' | 'list') ?? 'grid'
  })

  const handleViewMode = (mode: 'grid' | 'list') => {
    setViewMode(mode)
    localStorage.setItem('catalog-view-mode', mode)
  }

  // Sync filters with initialFilters only when they actually change from navigation
  React.useEffect(() => {
    setFilters(prev => {
      // Only update if initialFilters changed (e.g. navigation)
      if (
        prev.group !== (initialFilters?.group ?? '') ||
        prev.subcat !== initialSubcat ||
        prev.brands.join('|') !== (initialFilters?.brands ?? []).join('|') ||
        prev.minPrice !== (initialFilters?.minPrice ?? '') ||
        prev.maxPrice !== (initialFilters?.maxPrice ?? '')
      ) {
        return {
          ...prev,
          group: initialFilters?.group ?? '',
          subcat: initialSubcat,
          brands: initialFilters?.brands ?? [],
          minPrice: initialFilters?.minPrice ?? '',
          maxPrice: initialFilters?.maxPrice ?? ''
        };
      }
      return prev;
    });
  }, [initialFilters?.group, initialSubcat, initialFilters?.brands, initialFilters?.minPrice, initialFilters?.maxPrice]);

  React.useEffect(() => {
    const loadProducts = async () => {
      try {
        const response = await fetch('/api/products', { cache: 'no-store' })
        if (!response.ok) throw new Error('failed')

        const payload = (await response.json()) as { data?: { products?: Product[] } }
        setProducts(payload.data?.products ?? [])
      } catch {
        setProducts([])
        setProductsWarning('Не удалось загрузить товары из API')
      } finally {
        setProductsLoading(false)
      }
    }

    void loadProducts()
  }, [])

  React.useEffect(() => {
    const params = new URLSearchParams(searchParams.toString())
    const nextBrands = filters.brands.join(',')

    if (nextBrands) {
      params.set('brands', nextBrands)
    } else {
      params.delete('brands')
    }

    // Keep backward compatibility but normalize URL to the new plural param.
    params.delete('brand')

    // cat/subcat живут в URL: иначе router.replace после смены категории в
    // сайдбаре откатил бы выбор через navigation-sync (initialFilters из URL).
    if (filters.group) {
      params.set('cat', filters.group)
    } else {
      params.delete('cat')
    }
    if (filters.subcat) {
      params.set('subcat', filters.subcat)
    } else {
      params.delete('subcat')
    }

    const nextQuery = params.toString()
    const currentQuery = searchParams.toString()
    if (nextQuery === currentQuery || (!nextQuery && !currentQuery)) return

    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false })
  }, [filters.brands, filters.group, filters.subcat, pathname, router, searchParams])

  const normalizedSearch = initialSearch.trim().toLowerCase();
  const activeSubcat = filters.subcat
  const subcatItem = activeSubcat
    ? Object.values(SUBCATEGORIES_BY_ID).flat().find((item) => item.slug === activeSubcat)
    : undefined

  const clearSubcat = () => {
    setFilters((prev) => ({ ...prev, subcat: '' }))
  }

  const searchMatchedProducts = products.filter((product) => {
    const localizedTitle = (
      (language === 'en' && product.titleEn)
        ? product.titleEn
        : (language === 'lv' && product.titleLv)
          ? product.titleLv
          : t(product.titleKey ?? `products.${product.id}.title`, product.title)
    ).toLowerCase();
    return !normalizedSearch
      || localizedTitle.includes(normalizedSearch)
      || product.title.toLowerCase().includes(normalizedSearch)
      || product.brand.toLowerCase().includes(normalizedSearch);
  });

  // сортировка
  const sortProducts = (arr: typeof searchMatchedProducts, order: string | undefined) => {
    if (!order || order === '') return arr;
    if (order === 'price-asc') return [...arr].sort((a, b) => a.price - b.price);
    if (order === 'price-desc') return [...arr].sort((a, b) => b.price - a.price);
    if (order === 'name-asc') {
      return [...arr].sort((a, b) => {
        const aTitle = t(a.titleKey ?? `products.${a.id}.title`, a.title)
        const bTitle = t(b.titleKey ?? `products.${b.id}.title`, b.title)
        return aTitle.localeCompare(bTitle)
      })
    }
    if (order === 'name-desc') {
      return [...arr].sort((a, b) => {
        const aTitle = t(a.titleKey ?? `products.${a.id}.title`, a.title)
        const bTitle = t(b.titleKey ?? `products.${b.id}.title`, b.title)
        return bTitle.localeCompare(aTitle)
      })
    }
    return arr;
  };


  const filtered = sortProducts(
    searchMatchedProducts.filter(p => {
      const groupOk = !filters.group || p.category === filters.group;
      const subcatOk = !filters.subcat || p.subcategory === filters.subcat;
      const onSaleOk = !filters.onSale || isProductOnSale(p);
      const brandOk = filters.brands.length === 0 || filters.brands.includes(brandSlug(p.brand));
      const minOk = !filters.minPrice || p.price >= Number(filters.minPrice);
      const maxOk = !filters.maxPrice || p.price <= Number(filters.maxPrice);
      return groupOk && subcatOk && onSaleOk && brandOk && minOk && maxOk;
    }), filters.order
  );

  const hasSearchNoResults = normalizedSearch.length > 0 && filtered.length === 0
  const emptyStateMessage = hasSearchNoResults
    ? t('catalog.noResultsForQuery', 'Nothing found for your query "{query}"', { query: searchQuery })
    : t('common.noResults')

  // Infinite scroll state
  const [visibleCount, setVisibleCount] = React.useState(12);
  const [loading, setLoading] = React.useState(false);
  const loaderRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    setVisibleCount(12);
  }, [filters, normalizedSearch]);

  React.useEffect(() => {
    if (!loaderRef.current) return;
    const observer = new window.IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && visibleCount < filtered.length) {
        setLoading(true);
        setTimeout(() => {
          setVisibleCount((prev) => Math.min(prev + 8, filtered.length));
          setLoading(false);
        }, 600);
      }
    }, { threshold: 1 });
    observer.observe(loaderRef.current);
    return () => observer.disconnect();
  }, [visibleCount, filtered.length]);

  return (
    <section className="products py-8">
      <div className="w-full px-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="products__title text-2xl font-semibold text-foreground">{t('nav.catalog', 'Catalog')}</h2>
            {activeSubcat && (
              <button
                type="button"
                onClick={clearSubcat}
                className="products__subcat-chip inline-flex items-center gap-1.5 rounded-full bg-primary/10 text-primary px-3 py-1.5 text-sm font-medium hover:bg-primary/20 transition-colors"
                aria-label={t('common.reset', 'Reset')}
              >
                <span>{subcatItem ? t(subcatItem.key, activeSubcat) : activeSubcat}</span>
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground hidden sm:inline">{t('catalog.viewLabel')}</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => handleViewMode('grid')}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-sm transition-colors ${viewMode === 'grid' ? 'bg-primary text-primary-foreground' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
              >
                <LayoutGrid className="w-4 h-4" />
                <span>{t('catalog.viewGrid')}</span>
              </button>
              <button
                type="button"
                onClick={() => handleViewMode('list')}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-sm transition-colors ${viewMode === 'list' ? 'bg-primary text-primary-foreground' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
              >
                <List className="w-4 h-4" />
                <span>{t('catalog.viewList')}</span>
              </button>
            </div>
          </div>
        </div>
        <div className="flex flex-col lg:flex-row gap-6">
          <aside className="w-full lg:w-1/4">
            <ProductFilter
              onFilter={setFilters}
              initialFilters={filters}
              products={searchMatchedProducts}
            />
          </aside>
          <div className="w-full lg:w-3/4">
            {productsWarning && (
              <div className="mb-4 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
                {productsWarning}
              </div>
            )}
            {productsLoading ? (
              viewMode === 'list' ? (
                <div className="flex flex-col gap-3">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="h-28 rounded-lg bg-muted animate-pulse" />
                  ))}
                </div>
              ) : (
                <div className="products__grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {Array.from({ length: 8 }).map((_, i) => <ProductCardSkeleton key={i} />)}
                </div>
              )
            ) : (
              filtered.length === 0 ? (
                <div className="rounded-lg border border-border bg-card p-8 text-center">
                  <p className="text-gray-700 dark:text-gray-300">{emptyStateMessage}</p>
                </div>
              ) : (
                <>
                  {viewMode === 'list' ? (
                    <div className="flex flex-col gap-3">
                      {filtered.slice(0, visibleCount).map((p) => (
                        <ProductListRow key={p.id} product={p} />
                      ))}
                      {loading && Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="h-28 rounded-lg bg-muted animate-pulse" />
                      ))}
                    </div>
                  ) : (
                    <div className="products__grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                      {filtered.slice(0, visibleCount).map((p) => (
                        <ProductCard key={p.id} product={p} />
                      ))}
                      {loading && Array.from({ length: 4 }).map((_, i) => <ProductCardSkeleton key={i} />)}
                    </div>
                  )}
                  <div ref={loaderRef} style={{ height: 1 }} />
                </>
              )
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
