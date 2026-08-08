export type OffsetPaginationOptions = {
  defaultTake?: number
  maxTake?: number
}

export function parseOffsetPagination(
  searchParams: URLSearchParams,
  { defaultTake = 100, maxTake = 200 }: OffsetPaginationOptions = {},
): { skip: number; take: number } {
  const parsedSkip = Number.parseInt(searchParams.get('skip') ?? '0', 10)
  const parsedTake = Number.parseInt(searchParams.get('take') ?? String(defaultTake), 10)
  return {
    skip: Number.isFinite(parsedSkip) ? Math.max(0, parsedSkip) : 0,
    take: Number.isFinite(parsedTake) ? Math.min(maxTake, Math.max(1, parsedTake)) : defaultTake,
  }
}
