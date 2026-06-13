import ProductCardSkeleton from '@/components/ProductCardSkeleton'

export default function CatalogLoading() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6">
      <div className="mb-6 h-8 w-40 animate-pulse rounded bg-muted" />
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <ProductCardSkeleton key={i} />
        ))}
      </div>
    </div>
  )
}
