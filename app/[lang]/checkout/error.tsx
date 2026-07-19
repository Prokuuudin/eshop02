'use client'
import RouteError from '@/components/RouteError'

export default function CheckoutError(props: { error: Error; reset: () => void }) {
  return <RouteError {...props} homeHref="/cart" />
}
