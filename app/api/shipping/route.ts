import { NextResponse } from 'next/server'
import { isPayseraCheckoutEnabled } from '@/lib/paysera-checkout'
import { getShippingSettings } from '@/lib/shipping-settings-server'
export async function GET(): Promise<Response> {
  const settings = await getShippingSettings()
  return NextResponse.json({
    delivery: Object.fromEntries(Object.entries(settings.delivery).map(([id, method]) => [id, { ...method, notes: '' }])),
    payments: { paysera: isPayseraCheckoutEnabled() },
  })
}
