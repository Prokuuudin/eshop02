'use client'

import React, { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { LucideIcon } from 'lucide-react'
import {
  ChevronLeft,
  ChevronRight,
  Cog,
  FileText,
  FolderTree,
  HandHelping,
  Megaphone,
  Settings,
  ShoppingCart,
  Users
} from 'lucide-react'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useTranslation } from '@/lib/use-translation'

type SidebarItem = {
  title: string
  href?: string
}

type SidebarSection = {
  title: string
  icon: LucideIcon
  items: SidebarItem[]
}

const SIDEBAR_SECTIONS: SidebarSection[] = [
  {
    title: 'catalog',
    icon: FolderTree,
    items: [
      { title: 'catalog.products', href: '/admin/products' },
      { title: 'catalog.categories', href: '/admin/categories' },
      { title: 'catalog.brands', href: '/admin/brands' },
      { title: 'catalog.import', href: '/admin#catalog-import' }
    ]
  },
  {
    title: 'sales',
    icon: ShoppingCart,
    items: [
      { title: 'sales.dashboard', href: '/admin' },
      { title: 'sales.orders', href: '/admin#sales-orders' },
      { title: 'sales.rfq', href: '/admin/rfq' },
      { title: 'sales.returns', href: '/admin#sales-returns' }
    ]
  },
  {
    title: 'customers',
    icon: Users,
    items: [
      { title: 'customers.accounts', href: '/admin/accounts' },
      { title: 'customers.barcodes', href: '/admin/client-barcodes' },
      { title: 'customers.segments', href: '/admin#customers-segments' },
      { title: 'customers.history', href: '/admin#customers-history' }
    ]
  },
  {
    title: 'marketing',
    icon: Megaphone,
    items: [
      { title: 'marketing.campaigns', href: '/admin#promo-campaigns' },
      { title: 'marketing.discounts', href: '/admin#promo-discounts' },
      { title: 'marketing.showcases', href: '/admin#promo-showcases' },
      { title: 'marketing.analytics', href: '/admin#promo-analytics' }
    ]
  },
  {
    title: 'content',
    icon: FileText,
    items: [
      { title: 'content.blog', href: '/admin/blog' },
      { title: 'content.pages', href: '/admin#content-pages' },
      { title: 'content.banners', href: '/admin#content-banners' },
      { title: 'content.media', href: '/admin#content-media' }
    ]
  },
  {
    title: 'config',
    icon: Settings,
    items: [
      { title: 'config.shipping', href: '/admin#config-shipping' },
      { title: 'config.bonus', href: '/admin#config-bonus' },
      { title: 'config.integrations', href: '/account/integrations/webhooks' },
      { title: 'config.locale', href: '/admin#config-locale' }
    ]
  },
  {
    title: 'system',
    icon: Cog,
    items: [
      { title: 'system.users', href: '/admin/accounts' },
      { title: 'system.audit', href: '/account/audit-logs' },
      { title: 'system.logs', href: '/admin#system-logs' },
      { title: 'system.backup', href: '/admin#system-backup' }
    ]
  },
  {
    title: 'help',
    icon: HandHelping,
    items: [
      { title: 'help.knowledge', href: '/admin#help-knowledge' },
      { title: 'help.onboarding', href: '/admin#help-onboarding' },
      { title: 'help.faq', href: '/admin#help-faq' },
      { title: 'help.support', href: '/contact' }
    ]
  }
]

const isActive = (pathname: string, href?: string): boolean => {
  if (!href) return false
  const [baseHref] = href.split('#')
  if (!baseHref || baseHref === '/') return pathname === '/'
  return pathname === baseHref || pathname.startsWith(`${baseHref}/`)
}

export default function AdminSidebar() {
  const pathname = usePathname()
  const { t } = useTranslation()
  const tr = (key: string) => t(`admin.sidebar.${key}`, key)
  const activeSection = useMemo(() => {
    return SIDEBAR_SECTIONS.find((section) => section.items.some((item) => isActive(pathname, item.href)))?.title
  }, [pathname])
  const [openSection, setOpenSection] = useState<string | undefined>(activeSection)
  const [isCollapsed, setIsCollapsed] = useState(false)

  useEffect(() => {
    const saved = window.localStorage.getItem('admin-sidebar-collapsed')
    if (saved === '1') {
      setIsCollapsed(true)
    }
  }, [])

  useEffect(() => {
    if (activeSection) {
      setOpenSection(activeSection)
    }
  }, [activeSection])

  useEffect(() => {
    window.localStorage.setItem('admin-sidebar-collapsed', isCollapsed ? '1' : '0')
  }, [isCollapsed])

  return (
    <aside className={`w-full ${isCollapsed ? 'lg:w-20' : 'lg:w-80'}`}>
      <div
        className="rounded-2xl border border-gray-200 bg-white p-3 transition-all dark:border-gray-700 dark:bg-gray-900 lg:fixed lg:z-40"
        style={{
          top: 'calc(var(--header-offset, 80px) + 1.5rem)',
          left: 'max(1.5rem, calc((100vw - 1600px) / 2 + 1.5rem))',
          width: isCollapsed ? '5rem' : '20rem',
          maxHeight: 'calc(100vh - var(--header-offset, 80px) - 3rem)',
          overflowY: 'auto'
        }}
      >
      <div className="mb-3 border-b border-gray-200 pb-3 dark:border-gray-700">
        <div className="flex items-center justify-between gap-2">
          {!isCollapsed && (
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">{tr('adminConsole')}</p>
              <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-gray-100">{tr('manageStore')}</p>
            </div>
          )}
          <button
            type="button"
            onClick={() => setIsCollapsed((prev) => !prev)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-200 text-gray-600 transition-colors hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
            aria-label={isCollapsed ? tr('expandSidebar') : tr('collapseSidebar')}
            title={isCollapsed ? tr('expandSidebar') : tr('collapseSidebar')}
          >
            {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <nav aria-label={tr('adminNavAria')}>
        {isCollapsed ? (
          <TooltipProvider delayDuration={120}>
            <ul className="space-y-2">
              {SIDEBAR_SECTIONS.map((section) => {
                const Icon = section.icon
                const sectionActive = section.items.some((item) => isActive(pathname, item.href))
                const hasItems = section.items.length > 0
                const sectionHref = section.items[0]?.href ?? '/admin'

                return (
                  <li key={section.title}>
                    {hasItems ? (
                      <Tooltip>
                        <DropdownMenu>
                          <TooltipTrigger asChild>
                            <DropdownMenuTrigger asChild>
                              <button
                                type="button"
                                className={`flex h-10 w-10 items-center justify-center rounded-md transition-colors ${
                                  sectionActive
                                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200'
                                    : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
                                }`}
                                aria-label={tr(section.title)}
                              >
                                <Icon className="h-5 w-5" />
                              </button>
                            </DropdownMenuTrigger>
                          </TooltipTrigger>
                          <DropdownMenuContent side="right" align="start" className="min-w-[260px]">
                            <p className="px-2 pb-2 pt-1 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                              {tr(section.title)}
                            </p>
                            {section.items.map((item) => {
                              const active = isActive(pathname, item.href)

                              return (
                                <DropdownMenuItem key={`${section.title}-collapsed-${item.title}`} asChild className={active ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200' : ''}>
                                  <Link href={item.href ?? '/admin'}>{tr(item.title)}</Link>
                                </DropdownMenuItem>
                              )
                            })}
                          </DropdownMenuContent>
                        </DropdownMenu>
                        <TooltipContent side="right">{tr(section.title)}</TooltipContent>
                      </Tooltip>
                    ) : (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Link
                            href={sectionHref}
                            className={`flex h-10 w-10 items-center justify-center rounded-md transition-colors ${
                              sectionActive
                                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200'
                                : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
                            }`}
                            aria-label={tr(section.title)}
                          >
                            <Icon className="h-5 w-5" />
                          </Link>
                        </TooltipTrigger>
                        <TooltipContent side="right">{tr(section.title)}</TooltipContent>
                      </Tooltip>
                    )}
                  </li>
                )
              })}
            </ul>
          </TooltipProvider>
        ) : (
        <Accordion type="single" collapsible value={openSection} onValueChange={(value) => setOpenSection(value || undefined)}>
          {SIDEBAR_SECTIONS.map((section) => {
            const sectionActive = section.items.some((item) => isActive(pathname, item.href))
            const Icon = section.icon

            return (
              <AccordionItem key={section.title} value={section.title} className="border-b border-gray-200 dark:border-gray-700">
                <AccordionTrigger
                  className={`py-3 text-xs font-semibold uppercase tracking-wide hover:no-underline ${
                    sectionActive ? 'text-emerald-700 dark:text-emerald-200' : 'text-gray-500 dark:text-gray-400'
                  }`}
                >
                  <span className="inline-flex items-center gap-2">
                    <Icon className="h-4 w-4" />
                    {tr(section.title)}
                  </span>
                </AccordionTrigger>
                <AccordionContent className="pb-2 pt-0">
                  <ul className="space-y-1">
                    {section.items.map((item) => {
                      const active = isActive(pathname, item.href)

                      return (
                        <li key={`${section.title}-${item.title}`}>
                          <Link
                            href={item.href ?? '/admin'}
                            className={`block rounded-md px-3 py-2 text-sm transition-colors ${
                              active
                                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200'
                                : 'text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800'
                            }`}
                          >
                            {tr(item.title)}
                          </Link>
                        </li>
                      )
                    })}
                  </ul>
                </AccordionContent>
              </AccordionItem>
            )
          })}
        </Accordion>
        )}
      </nav>
      </div>
    </aside>
  )
}