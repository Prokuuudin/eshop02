import { Card } from './ui/card';

export default function BrandCardSkeleton() {
  return (
    <Card className="brand-card p-4 flex flex-col items-center animate-pulse bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700">
      <div className="w-16 h-16 rounded-full bg-gray-200 dark:bg-gray-700 mb-3" />
      <div className="h-4 w-24 bg-gray-200 dark:bg-gray-700 rounded mb-2" />
      <div className="h-3 w-32 bg-gray-200 dark:bg-gray-700 rounded mb-2" />
      <div className="h-5 w-20 bg-gray-200 dark:bg-gray-700 rounded mt-2" />
    </Card>
  );
}
