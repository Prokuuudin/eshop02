import { Card } from './ui/card';

export default function ProductCardSkeleton() {
  return (
    <Card className="product-card-skeleton p-3 h-full flex flex-col animate-pulse bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700">
      <div className="rounded-md overflow-hidden w-full h-48 bg-gray-200 dark:bg-gray-700" />
      <div className="mt-3 flex-1 flex flex-col">
        <div className="h-4 w-20 bg-gray-200 dark:bg-gray-700 rounded mb-2" />
        <div className="h-5 w-32 bg-gray-200 dark:bg-gray-700 rounded mb-2" />
        <div className="h-4 w-16 bg-gray-200 dark:bg-gray-700 rounded mb-2" />
        <div className="h-6 w-24 bg-gray-200 dark:bg-gray-700 rounded mt-auto" />
      </div>
    </Card>
  );
}
