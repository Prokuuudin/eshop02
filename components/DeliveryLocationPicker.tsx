'use client'

import { useEffect, useId, useState } from 'react'
import type { DeliveryCountry } from '@/lib/delivery'
import type { DeliveryLocation } from '@/lib/delivery-locations'
import { useTranslation } from '@/lib/use-translation'
import { Input } from '@/components/ui/input'

export function DeliveryLocationPicker({ method, country, value, onChange }: {
  method: string
  country: DeliveryCountry
  value: string
  onChange: (value: string) => void
}): React.ReactElement {
  const { t } = useTranslation()
  const id = useId()
  const [locations, setLocations] = useState<DeliveryLocation[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    fetch(`/api/shipping/locations?method=${encodeURIComponent(method)}&country=${country}`, { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error('locations_unavailable')
        const payload = await response.json() as { locations: DeliveryLocation[] }
        setLocations(payload.locations)
      }).catch(() => { if (!controller.signal.aborted) setFailed(true) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [method, country])
  const query = search.trim().toLocaleLowerCase()
  const visible = locations.filter(location => location.id === value || `${location.city} ${location.name} ${location.address} ${location.postalCode}`.toLocaleLowerCase().includes(query))
  return <div className="mt-4 space-y-2 rounded border border-border p-3">
    <label htmlFor={`${id}-search`} className="block text-sm">{t('checkout.locationSearch')}</label>
    <Input id={`${id}-search`} value={search} onChange={event => setSearch(event.target.value)} disabled={loading || failed} />
    <label htmlFor={id} className="block text-sm">{t('checkout.locationLabel')} *</label>
    <select id={id} name="deliveryLocationId" value={value} onChange={event => onChange(event.target.value)} disabled={loading || failed} className="w-full rounded border border-border bg-card p-2" aria-required="true">
      <option value="">{t(loading ? 'checkout.locationsLoading' : 'checkout.locationPlaceholder')}</option>
      {visible.map(location => <option key={location.id} value={location.id}>{location.city} — {location.name}, {location.address}</option>)}
    </select>
    {failed && <p role="alert" className="text-sm text-red-600">{t('checkout.locationsFailed')}</p>}
    {!loading && !failed && visible.length === 0 && <p className="text-sm">{t('checkout.locationsEmpty')}</p>}
  </div>
}
