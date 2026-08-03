import type { ReactNode } from 'react'
import AdminServerPermission from '@/components/admin/AdminServerPermission'
export default function Layout({ children }: { children: ReactNode }): ReactNode { return <AdminServerPermission permission="audit.read">{children}</AdminServerPermission> }
