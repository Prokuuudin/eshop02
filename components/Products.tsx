"use client";
import React from 'react'
import { PRODUCTS, type Product } from '../data/products'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import ProductCard from './ProductCard'
import ProductCardSkeleton from './ProductCardSkeleton'
import { useTranslation } from '@/lib/use-translation'
import { getCategoryProductIdsOverrideById, getSubcategoryProductIdsBySlug } from '@/data/categories'

import ProductFilter from './ProductFilter'

type ProductsFilters = {
  group: string
  onSale: boolean
  purposes: string[]
  brands: string[]
  minPrice: string
  maxPrice: string
  order?: string
}

type ProductsProps = {
  initialFilters?: Partial<ProductsFilters>
  initialSearch?: string
  initialSubcategory?: string
}

const isProductOnSale = (product: Product): boolean => {
  return !!product.badges?.includes('sale') || (!!product.oldPrice && product.oldPrice > product.price)
}

export default function Products({ initialFilters, initialSearch = '', initialSubcategory }: ProductsProps) {
  const { t, language } = useTranslation();
  const [products, setProducts] = React.useState<Product[]>([])
  const [productsLoading, setProductsLoading] = React.useState(true)
  const [productsWarning, setProductsWarning] = React.useState('')
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const searchQuery = initialSearch.trim();
  const subcategoryProductIds = React.useMemo(
    () => getSubcategoryProductIdsBySlug(initialSubcategory),
    [initialSubcategory]
  );
  // Single source of truth for filters
  const [filters, setFilters] = React.useState<ProductsFilters>({
    group: initialFilters?.group ?? '',
    onSale: initialFilters?.onSale ?? false,
    purposes: initialFilters?.purposes ?? [],
    brands: initialFilters?.brands ?? [],
    minPrice: initialFilters?.minPrice ?? '',
    maxPrice: initialFilters?.maxPrice ?? '',
    order: initialFilters?.order ?? ''
  });

  // Sync filters with initialFilters only when they actually change from navigation
  React.useEffect(() => {
    setFilters(prev => {
      // Only update if initialFilters changed (e.g. navigation)
      if (
        prev.group !== (initialFilters?.group ?? '') ||
        prev.brands.join('|') !== (initialFilters?.brands ?? []).join('|') ||
        prev.minPrice !== (initialFilters?.minPrice ?? '') ||
        prev.maxPrice !== (initialFilters?.maxPrice ?? '')
      ) {
        return {
          ...prev,
          group: initialFilters?.group ?? '',
          brands: initialFilters?.brands ?? [],
          minPrice: initialFilters?.minPrice ?? '',
          maxPrice: initialFilters?.maxPrice ?? ''
        };
      }
      return prev;
    });
  }, [initialFilters?.group, initialFilters?.brands, initialFilters?.minPrice, initialFilters?.maxPrice]);

  React.useEffect(() => {
    const loadProducts = async () => {
      try {
        const response = await fetch('/api/products', { cache: 'no-store' })
        if (!response.ok) throw new Error('failed')

        const payload = (await response.json()) as { data?: { products?: Product[] } }
        setProducts(payload.data?.products ?? [])
      } catch {
        // Fallback keeps catalog usable if API is temporarily unavailable.
        setProducts(PRODUCTS)
        setProductsWarning('Не удалось загрузить товары из API, показан резервный список')
      } finally {
        setProductsLoading(false)
      }
    }

    void loadProducts()
  }, [])

  React.useEffect(() => {
    const params = new URLSearchParams(searchParams.toString())
    const nextBrands = filters.brands.join(',')
    const currentBrands = params.get('brands') ?? ''

    if (nextBrands) {
      params.set('brands', nextBrands)
    } else {
      params.delete('brands')
    }

    // Keep backward compatibility but normalize URL to the new plural param.
    params.delete('brand')

    const nextQuery = params.toString()
    const currentQuery = searchParams.toString()
    if (nextQuery === currentQuery || (!nextQuery && !currentQuery)) return

    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false })
  }, [filters.brands, pathname, router, searchParams])

  const normalizedSearch = initialSearch.trim().toLowerCase();
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

  const subcategoryMatchedProducts = subcategoryProductIds
    ? searchMatchedProducts.filter((product) => subcategoryProductIds.has(product.id))
    : searchMatchedProducts

  // сортировка
  const sortProducts = (arr: typeof subcategoryMatchedProducts, order: string | undefined) => {
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
    subcategoryMatchedProducts.filter(p => {
      const categoryOverrideIds = filters.group ? getCategoryProductIdsOverrideById(filters.group) : null;
      const groupOk = !filters.group
        || (categoryOverrideIds
          ? categoryOverrideIds.has(p.id)
          : p.category === filters.group);
      const onSaleOk = !filters.onSale || isProductOnSale(p);
      const purposesOk = !filters.purposes || filters.purposes.length === 0 || filters.purposes.includes(p.purpose ?? '');
      const brandOk = filters.brands.length === 0 || filters.brands.includes(p.brand);
      const minOk = !filters.minPrice || p.price >= Number(filters.minPrice);
      const maxOk = !filters.maxPrice || p.price <= Number(filters.maxPrice);
      return groupOk && onSaleOk && purposesOk && brandOk && minOk && maxOk;
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
      <div className="mx-auto w-full max-w-7xl px-4">
        <h2 className="products__title text-2xl font-semibold mb-4 text-gray-900 dark:text-gray-100">{t('nav.catalog', 'Catalog')}</h2>
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
              <div className="products__grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {Array.from({ length: 8 }).map((_, i) => <ProductCardSkeleton key={i} />)}
              </div>
            ) : (
              filtered.length === 0 ? (
                <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-8 text-center">
                  <p className="text-gray-700 dark:text-gray-300">{emptyStateMessage}</p>
                </div>
              ) : (
                <>
                  <div className="products__grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {filtered.slice(0, visibleCount).map((p) => (
                      <ProductCard key={p.id} product={p} />
                    ))}
                    {loading && Array.from({ length: 4 }).map((_, i) => <ProductCardSkeleton key={i} />)}
                  </div>
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
