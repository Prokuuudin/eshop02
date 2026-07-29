'use client'
import type { ReactElement } from 'react'
import RouteError from '@/components/RouteError'

export default function CheckoutError(props: { error: Error; reset: () => void }): ReactElement {
  return <RouteError {...props} homeHref="/cart" />
}
