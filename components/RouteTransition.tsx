'use client'

import type { ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { useUnprefixedPathname } from '@/lib/i18n-context'
import PageContainer from '@/components/PageContainer'

export default function RouteTransition({ children }: { children: ReactNode }): React.ReactElement {
  const pathname = usePathname()
  const unprefixedPathname = useUnprefixedPathname()
  const isAdminPage = unprefixedPathname.startsWith('/admin')

  return (
    <div key={pathname} className="route-transition">
      {isAdminPage ? children : <PageContainer>{children}</PageContainer>}
    </div>
  )
}
