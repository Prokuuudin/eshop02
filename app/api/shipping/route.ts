import { NextResponse } from 'next/server'
import { getShippingSettings } from '@/lib/shipping-settings-server'
export async function GET(): Promise<Response> {
  const settings = await getShippingSettings()
  return NextResponse.json({ delivery: Object.fromEntries(Object.entries(settings.delivery).map(([id, method]) => [id, { ...method, notes: '' }])) })
}
