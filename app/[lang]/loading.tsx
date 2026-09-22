export default function Loading(): React.ReactElement {
  return (
    <div
      className="flex min-h-[calc(100svh-180px)] w-full items-start justify-center px-0 pt-2 sm:min-h-[calc(100svh-158px)] sm:px-4"
      role="status"
      aria-label="Loading"
    >
      <div className="relative flex aspect-[4/5] w-full items-center justify-center overflow-hidden rounded-none bg-muted/40 sm:aspect-[16/9] sm:rounded-xl lg:aspect-[3393/1080] lg:max-h-[560px]">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-muted border-t-primary" />
      </div>
    </div>
  )
}
