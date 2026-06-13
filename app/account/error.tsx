'use client'
import RouteError from '@/components/RouteError'

export default function AccountError(props: { error: Error; reset: () => void }) {
  return <RouteError {...props} homeHref="/account" />
}
