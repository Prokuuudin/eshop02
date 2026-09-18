import { NextRequest, NextResponse } from 'next/server'
import { getDeliveryLocations, requiresDeliveryLocation } from '@/lib/delivery-locations'
import type { DeliveryCountry } from '@/lib/delivery'

export function GET(request: NextRequest): Response {
  const method = request.nextUrl.searchParams.get('method') ?? ''
  const country = request.nextUrl.searchParams.get('country') ?? ''
  if (!requiresDeliveryLocation(method) || !['LV', 'LT', 'EE'].includes(country)) {
    return NextResponse.json({ error: 'invalid_location_query' }, { status: 400 })
  }
  return NextResponse.json({ locations: getDeliveryLocations(method, country as DeliveryCountry) }, { headers: { 'Cache-Control': 'public, max-age=3600' } })
}
