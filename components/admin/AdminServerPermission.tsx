import type { ReactNode } from 'react'
import { notFound } from 'next/navigation'
import { getServerUser } from '@/lib/server-auth'
import { hasAdminPermission, type AdminPermission } from '@/lib/admin-permissions'

export default async function AdminServerPermission({
  children,
  permission,
}: {
  children: ReactNode
  permission: AdminPermission
}): Promise<ReactNode> {
  const user = await getServerUser()
  if (!hasAdminPermission(user, permission)) notFound()
  return children
}
