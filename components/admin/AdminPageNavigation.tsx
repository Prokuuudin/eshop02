'use client'

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useUnprefixedPathname } from '@/lib/i18n-context'
import { useAdminLocale } from '@/lib/use-admin-locale'

const parentSections = [
  { path: '/admin/products', labels: ['Товары', 'Products', 'Produkti'] },
  { path: '/admin/orders', labels: ['Заказы', 'Orders', 'Pasūtījumi'] },
  { path: '/admin/content', labels: ['Контент', 'Content', 'Saturs'] },
  { path: '/admin/customers', href: '/admin/customers/segments', labels: ['Клиенты', 'Customers', 'Klienti'] },
  { path: '/admin/system/admin-log', href: '/admin/system/logs', labels: ['Системные логи', 'System logs', 'Sistēmas žurnāli'] },
  { path: '/admin/sales/breakdown', href: '/admin/sales/analytics', labels: ['Продажи', 'Sales', 'Pārdošana'] },
] as const

/** Shared placement for navigation back from every admin page. */
export default function AdminPageNavigation(): React.ReactElement | null {
  const pathname = useUnprefixedPathname()
  const { l } = useAdminLocale()
  if (pathname === '/admin' || pathname === '/admin/') return null

  const parent = parentSections.find(section =>
    'href' in section ? pathname.startsWith(section.path) : pathname.startsWith(`${section.path}/`)
  )
  const parentHref = parent && ('href' in parent ? parent.href : parent.path)

  return (
    <nav aria-label={l('Навигация по админке', 'Admin page navigation', 'Administrācijas lapu navigācija')} className="mb-4 flex flex-wrap items-center gap-2">
      <Button asChild variant="outline">
        <Link href="/admin"><ArrowLeft aria-hidden="true" />{l('Назад в админку', 'Back to admin', 'Atpakaļ uz administrāciju')}</Link>
      </Button>
      {parent && parentHref && parentHref !== pathname && (
        <Button asChild variant="outline">
          <Link href={parentHref}><ArrowLeft aria-hidden="true" />{l(parent.labels[0], parent.labels[1], parent.labels[2])}</Link>
        </Button>
      )}
    </nav>
  )
}
