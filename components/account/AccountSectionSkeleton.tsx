export default function AccountSectionSkeleton() {
  return (
    <div className="account-section-skeleton animate-pulse rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-6">
      {/* Section header: title + optional subtitle */}
      <div className="mb-6 space-y-2">
        <div className="h-7 w-48 bg-muted rounded" />
        <div className="h-4 w-64 bg-muted rounded" />
      </div>

      {/* Content rows */}
      <div className="space-y-4">
        {[72, 56, 64, 52].map((width, i) => (
          <div key={i} className="flex items-center gap-4">
            {/* Icon / avatar placeholder */}
            <div className="h-10 w-10 rounded-full bg-muted shrink-0" />
            {/* Text content */}
            <div className="flex-1 space-y-1.5">
              <div
                className="h-4 bg-muted rounded"
                style={{ width: `${width}%` }}
              />
              <div
                className="h-3 bg-muted rounded"
                style={{ width: `${Math.round(width * 0.6)}%` }}
              />
            </div>
            {/* Right-side action placeholder */}
            <div className="h-8 w-20 bg-muted rounded-md shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}
