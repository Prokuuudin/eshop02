import { Card } from './ui/card';

export default function ProductCardSkeleton(): React.ReactElement {
  return (
    <Card
      aria-hidden="true"
      className="product-card-skeleton h-full min-h-[340px] overflow-hidden border-border bg-card px-3 py-2 shadow-sm sm:min-h-[370px] lg:min-h-0"
    >
      <div className="mb-1 flex h-7 items-center justify-between gap-2">
        <div className="product-card-skeleton__shape h-3 w-20 rounded-full" />
        <div className="product-card-skeleton__shape h-7 w-7 shrink-0 rounded-full" />
      </div>

      <div className="product-card-skeleton__media product-card-skeleton__shape h-48 w-full rounded-md" />

      <div className="mt-2 flex min-h-[91px] flex-1 flex-col">
        <div className="product-card-skeleton__shape h-4 w-[88%] rounded-full" />
        <div className="product-card-skeleton__shape mt-2 h-4 w-[62%] rounded-full" />

        <div className="mt-3 flex gap-1.5">
          <div className="product-card-skeleton__shape h-5 w-14 rounded-full" />
          <div className="product-card-skeleton__shape h-5 w-20 rounded-full" />
        </div>

        <div className="mt-auto flex items-end justify-between gap-3 pt-3">
          <div className="product-card-skeleton__shape h-6 w-24 rounded-full" />
          <div className="product-card-skeleton__shape h-4 w-11 rounded-full" />
        </div>
      </div>
    </Card>
  );
}
