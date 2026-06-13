'use client'
import RouteError from '@/components/RouteError'

export default function AdminError(props: { error: Error; reset: () => void }) {
  return <RouteError {...props} homeHref="/admin" />
}
