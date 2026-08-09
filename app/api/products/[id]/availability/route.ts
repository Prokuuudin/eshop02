import { NextRequest, NextResponse } from 'next/server'
import { getProductWarehouseAvailability } from '@/lib/warehouse-availability'
import { resolveLanguage } from '@/lib/i18n-routing'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params
  const language = resolveLanguage(request.nextUrl.searchParams.get('lang') ?? 'ru')
  const availability = await getProductWarehouseAvailability(id, language)
  return NextResponse.json(availability, {
    headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
  })
}
