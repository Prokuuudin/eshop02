'use client'
import { useState } from 'react'
import { useAdminLocale } from '@/lib/use-admin-locale'
import type { Order } from '@/lib/orders-store'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
export function ShipmentForm({ order }: { order: Order }): React.ReactElement {
  const { l } = useAdminLocale()
  const [open, setOpen] = useState(false)
  const [carrier, setCarrier] = useState(order.shipmentCarrier ?? (order.deliveryMethod.startsWith('venipak') ? 'venipak' : order.deliveryMethod.startsWith('unisend') ? 'unisend' : order.deliveryMethod.startsWith('expresspasts') ? 'expresspasts' : 'omniva'))
  const [number, setNumber] = useState(order.trackingNumber ?? '')
  const [trackingUrl, setTrackingUrl] = useState(order.trackingUrl ?? '')
  const [labelUrl, setLabelUrl] = useState(order.labelUrl ?? '')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  return <div className={open ? 'w-full' : ''}>
    <Button type="button" variant="outline" size="sm" onClick={() => setOpen(!open)}>{l('Отправление', 'Shipment', 'Sūtījums')}</Button>
    {open && <div className="mt-3 grid gap-3 rounded border p-3 sm:grid-cols-2">
      <label>{l('Перевозчик', 'Carrier', 'Pārvadātājs')}<select className="block rounded border bg-card p-2" value={carrier} onChange={e => setCarrier(e.target.value)}><option value="omniva">Omniva</option><option value="venipak">Venipak</option><option value="unisend">Unisend</option><option value="expresspasts">Expresspasts</option><option value="dpd">DPD</option><option value="other">{l('Другой', 'Other', 'Cits')}</option></select></label>
      <label>{l('Номер отправления', 'Tracking number', 'Sūtījuma numurs')}<Input value={number} onChange={e => setNumber(e.target.value)} maxLength={200} /></label>
      <label>{l('Ссылка отслеживания', 'Tracking link', 'Izsekošanas saite')}<Input type="url" value={trackingUrl} onChange={e => setTrackingUrl(e.target.value)} placeholder="https://" /></label>
      <label>{l('Ссылка на этикетку', 'Label link', 'Etiķetes saite')}<Input type="url" value={labelUrl} onChange={e => setLabelUrl(e.target.value)} placeholder="https://" /></label>
      <Button type="button" disabled={saving || !number.trim()} onClick={async () => {
        setSaving(true); setMessage('')
        try {
          const response = await fetch('/api/admin/orders/shipment', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId: order.id, shipmentCarrier: carrier, trackingNumber: number, trackingUrl, labelUrl }) })
          setMessage(response.ok ? l('Сохранено', 'Saved', 'Saglabāts') : l('Ошибка сохранения', 'Save failed', 'Saglabāšana neizdevās'))
        } catch { setMessage(l('Ошибка сети', 'Network error', 'Tīkla kļūda')) }
        finally { setSaving(false) }
      }}>{l('Сохранить', 'Save', 'Saglabāt')}</Button>
      <p role="status">{message}</p>
    </div>}
  </div>
}
