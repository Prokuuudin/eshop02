import { NextResponse } from 'next/server'
import { getCachedBrands } from '@/lib/storefront-cache'

export const runtime = 'nodejs'

export async function GET(): Promise<Response> {
  return NextResponse.json({ brands: await getCachedBrands() }, {
    headers: { 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=3600' },
  })
}
