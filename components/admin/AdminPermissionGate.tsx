'use client'

import type { ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { useAuthStore } from '@/lib/auth-store'
import { hasAdminPermission, permissionForAdminPath, type AdminPermission } from '@/lib/admin-permissions'

export default function AdminPermissionGate({
  children,
  permission,
}: {
  children: ReactNode
  permission?: AdminPermission
}): ReactNode {
  const pathname = usePathname()
  const user = useAuthStore((state) => state.user)
  const required = permission ?? permissionForAdminPath(pathname)

  if (!hasAdminPermission(user, required)) {
    return (
      <main className="mx-auto max-w-lg px-4 py-12">
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-8 text-center">
          <h1 className="text-2xl font-bold text-foreground">Доступ запрещён</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Для этого раздела требуется разрешение <code>{required}</code>.
          </p>
        </div>
      </main>
    )
  }

  return children
}
