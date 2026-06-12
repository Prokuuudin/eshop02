interface AdminTableSkeletonProps {
  rows?: number;
  cols?: number;
}

export default function AdminTableSkeleton({ rows = 5, cols = 4 }: AdminTableSkeletonProps) {
  return (
    <div className="admin-table-skeleton animate-pulse rounded-xl border border-border bg-white dark:bg-gray-900 overflow-hidden">
      {/* Header row */}
      <div className="flex items-center gap-4 px-5 py-3 border-b border-border bg-gray-50 dark:bg-gray-800">
        {Array.from({ length: cols }, (_, i) => (
          <div
            key={i}
            className="h-4 bg-gray-300 dark:bg-gray-600 rounded"
            style={{ flex: i === 0 ? '2' : '1' }}
          />
        ))}
      </div>

      {/* Data rows */}
      <div className="divide-y divide-gray-100 dark:divide-gray-800">
        {Array.from({ length: rows }, (_, rowIdx) => (
          <div key={rowIdx} className="flex items-center gap-4 px-5 py-4">
            {Array.from({ length: cols }, (_, colIdx) => (
              <div
                key={colIdx}
                className="h-4 bg-gray-200 dark:bg-gray-700 rounded"
                style={{
                  flex: colIdx === 0 ? '2' : '1',
                  width: `${65 + ((rowIdx * 7 + colIdx * 13) % 30)}%`,
                }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
