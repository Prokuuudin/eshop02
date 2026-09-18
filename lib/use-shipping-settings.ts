'use client'
import { useEffect, useState } from 'react'
import { DEFAULT_COMMERCE_SETTINGS, type CommerceSettings } from './commerce-settings'
export function useShippingSettings(): CommerceSettings & { shippingReady: boolean; shippingError: boolean } {
  const [settings, setSettings] = useState<CommerceSettings>(DEFAULT_COMMERCE_SETTINGS)
  const [shippingReady, setShippingReady] = useState(false)
  const [shippingError, setShippingError] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/shipping', { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error('shipping_settings_unavailable')
      const payload = await response.json()
      setShippingReady(true)
      setSettings({ ...DEFAULT_COMMERCE_SETTINGS, delivery: payload.delivery })
    }).catch(() => { if (!controller.signal.aborted) setShippingError(true) })
    return () => controller.abort()
  }, [])
  return { ...settings, shippingReady, shippingError }
}
