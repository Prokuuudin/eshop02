export default function AccountSectionSkeleton() {
  return (
    <div className="account-section-skeleton animate-pulse rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 shadow-sm sm:p-6">
      {/* Section header: title + optional subtitle */}
      <div className="mb-6 space-y-2">
        <div className="h-7 w-48 bg-gray-200 dark:bg-gray-700 rounded" />
        <div className="h-4 w-64 bg-gray-200 dark:bg-gray-700 rounded" />
      </div>

      {/* Content rows */}
      <div className="space-y-4">
        {[72, 56, 64, 52].map((width, i) => (
          <div key={i} className="flex items-center gap-4">
            {/* Icon / avatar placeholder */}
            <div className="h-10 w-10 rounded-full bg-gray-200 dark:bg-gray-700 shrink-0" />
            {/* Text content */}
            <div className="flex-1 space-y-1.5">
              <div
                className="h-4 bg-gray-200 dark:bg-gray-700 rounded"
                style={{ width: `${width}%` }}
              />
              <div
                className="h-3 bg-gray-200 dark:bg-gray-700 rounded"
                style={{ width: `${Math.round(width * 0.6)}%` }}
              />
            </div>
            {/* Right-side action placeholder */}
            <div className="h-8 w-20 bg-gray-200 dark:bg-gray-700 rounded-md shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}
