import { Card } from './ui/card';

export default function OrderCardSkeleton() {
  return (
    <Card className="order-card-skeleton rounded-2xl border border-gray-200 dark:border-gray-700 p-4 animate-pulse bg-white dark:bg-gray-900">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        {/* Left: order ID, status badge, date, item count */}
        <div className="flex-1 space-y-2">
          {/* Monospace order ID */}
          <div className="h-4 w-48 bg-gray-200 dark:bg-gray-700 rounded" />
          {/* Status badge */}
          <div className="h-5 w-24 bg-gray-200 dark:bg-gray-700 rounded-full" />
          {/* Date */}
          <div className="h-4 w-32 bg-gray-200 dark:bg-gray-700 rounded" />
          {/* Item count + delivery */}
          <div className="h-4 w-40 bg-gray-200 dark:bg-gray-700 rounded" />
        </div>

        {/* Right: total amount */}
        <div className="text-right space-y-1.5">
          <div className="h-6 w-20 bg-gray-200 dark:bg-gray-700 rounded ml-auto" />
          <div className="h-3 w-16 bg-gray-200 dark:bg-gray-700 rounded ml-auto" />
        </div>

        {/* Actions: repeat, save as template, details */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="h-8 w-28 bg-gray-200 dark:bg-gray-700 rounded-md" />
          <div className="h-8 w-32 bg-gray-200 dark:bg-gray-700 rounded-md" />
          <div className="h-8 w-20 bg-gray-200 dark:bg-gray-700 rounded-md" />
        </div>
      </div>

      {/* Item list rows */}
      <div className="mt-3 space-y-1.5 border-t border-gray-200 dark:border-gray-700 pt-3">
        <div className="h-3 w-56 bg-gray-200 dark:bg-gray-700 rounded" />
        <div className="h-3 w-44 bg-gray-200 dark:bg-gray-700 rounded" />
        <div className="h-3 w-36 bg-gray-200 dark:bg-gray-700 rounded" />
      </div>
    </Card>
  );
}
