'use client'

import type { ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { useUnprefixedPathname } from '@/lib/i18n-context'

export default function RouteTransition({ children }: { children: ReactNode }): React.ReactElement {
  const pathname = usePathname()
  const unprefixedPathname = useUnprefixedPathname()
  const isAdminPage = unprefixedPathname.startsWith('/admin')

  return (
    <div key={pathname} className="route-transition">
      {isAdminPage ? children : <div className="max-w-[1440px] mx-auto">{children}</div>}
    </div>
  )
}
