import type { ReactNode } from 'react'
import AdminServerPermission from '@/components/admin/AdminServerPermission'

export default function PricingLayout({ children }: { children: ReactNode }): React.ReactElement {
  return <AdminServerPermission permission="catalog.read">{children}</AdminServerPermission>
}
