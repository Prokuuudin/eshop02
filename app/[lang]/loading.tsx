export default function Loading(): React.ReactElement {
  return (
    <div className="flex min-h-[40vh] w-full items-center justify-center" role="status" aria-label="Loading">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-muted border-t-primary" />
    </div>
  )
}
