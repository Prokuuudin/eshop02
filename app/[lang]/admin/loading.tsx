export default function AdminLoading(): React.ReactElement {
  return (
    <div className="mx-auto w-full max-w-[1440px] px-4 py-6">
      <div className="mb-6 h-8 w-56 animate-pulse rounded bg-muted" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-lg border border-border bg-card" />
        ))}
      </div>
    </div>
  )
}
