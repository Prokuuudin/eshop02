'use client'
import RouteError from '@/components/RouteError'

export default function AdminError(props: { error: Error; reset: () => void }): React.ReactElement {
  return <RouteError {...props} homeHref="/admin" />
}
