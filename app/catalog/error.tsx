'use client'
import RouteError from '@/components/RouteError'

export default function CatalogError(props: { error: Error; reset: () => void }) {
  return <RouteError {...props} homeHref="/catalog" />
}
