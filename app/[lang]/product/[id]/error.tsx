'use client'
import RouteError from '@/components/RouteError'

export default function ProductError(props: { error: Error; reset: () => void }): React.ReactElement {
  return <RouteError {...props} homeHref="/catalog" />
}
