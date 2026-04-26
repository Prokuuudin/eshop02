"use client";
import Link from 'next/link'
import Image from 'next/image'
import { useTranslation } from '@/lib/use-translation'
import { useCategoriesConfig } from '@/lib/use-categories-config'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip'

// ...existing code...

export default function Categories() {
  const { t, language } = useTranslation()
  const { categories } = useCategoriesConfig()
  const sectionClassName = 'categories py-8 relative z-30 overflow-visible'
  const gridClassName = 'categories__grid grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 overflow-visible'
    const itemWithDropdownClassName = 'categories__item group relative z-40 hover:z-50 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:shadow-lg transition-transform transform hover:-translate-y-1 overflow-visible aspect-square flex flex-col'
  const imageWrapClassName = 'categories__image relative aspect-square w-full'
  const imageClassName = 'object-cover group-hover:scale-105 transition-transform'
  const metaClassName = 'categories__meta p-2 sm:p-3 text-center text-sm sm:text-base text-gray-900 dark:text-gray-100 leading-tight'
  const dropdownPanelClassName = 'w-[min(260px,calc(100vw-2rem))] rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg overflow-hidden'
  const dropdownItemClassName = 'px-3 py-2.5 min-h-[44px] flex items-center text-sm text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800'

  return (
    <section className={sectionClassName}>
      <div className="w-full px-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 mb-4">
          <h2 className="categories__title text-2xl font-semibold text-gray-900 dark:text-gray-100">{t('categories.title')}</h2>
          <Link
            href="/catalog"
            className="inline-flex w-full sm:w-auto justify-center items-center px-3 py-2 min-h-[44px] rounded bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-100 transition-colors"
            style={{ textDecoration: 'none', fontWeight: 500 }}
          >
            {t('nav.catalog')}
          </Link>
        </div>
        <TooltipProvider delayDuration={120}>
          <div className={gridClassName}>
          {categories.map((c) => {
            const submenuItems = c.subcategories ?? []

            if (submenuItems.length > 0) {

              return (
                <div key={c.id} className={itemWithDropdownClassName}>
                  <DropdownMenu modal={false}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            className="block w-full text-left rounded-lg overflow-hidden min-h-[44px]"
                            aria-label={c.titleKey ? t(c.titleKey, c.labels[language]) : c.labels[language]}
                          >
                            <div className={imageWrapClassName}>
                              <Image src={c.image} alt={t('categories.imageAlt')} fill className={imageClassName} sizes="(max-width: 640px) 50vw, 20vw" />
                            </div>
                            <div className={metaClassName}>
                              {c.titleKey ? t(c.titleKey, c.labels[language]) : c.labels[language]}
                            </div>
                          </button>
                        </DropdownMenuTrigger>
                      </TooltipTrigger>
                      <TooltipContent>
                        {t('categories.clickHint')}
                      </TooltipContent>
                    </Tooltip>

                    <DropdownMenuContent className={dropdownPanelClassName} align="start" sideOffset={4} onCloseAutoFocus={(event) => event.preventDefault()}>
                      <DropdownMenuItem asChild className={dropdownItemClassName}>
                        <Link href={c.href}>
                          {t('categories.all')}
                        </Link>
                      </DropdownMenuItem>
                      {submenuItems.map((item) => (
                        <DropdownMenuItem key={`${c.id}-${item.slug}`} asChild className={dropdownItemClassName}>
                          <Link href={`/catalog?cat=${c.id}&subcat=${encodeURIComponent(item.slug)}`}>
                            {item.key ? t(item.key, item.labels[language]) : item.labels[language]}
                          </Link>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )
            }

            return (
              <div key={c.id} className={itemWithDropdownClassName}>
                <Link href={c.href} className="block w-full text-left rounded-lg overflow-hidden min-h-[44px]" aria-label={c.titleKey ? t(c.titleKey, c.labels[language]) : c.labels[language]}>
                  <div className={imageWrapClassName}>
                    <Image src={c.image} alt={t('categories.imageAlt')} fill className={imageClassName} sizes="(max-width: 640px) 50vw, 20vw" />
                  </div>
                  <div className={metaClassName}>
                    {c.titleKey ? t(c.titleKey, c.labels[language]) : c.labels[language]}
                  </div>
                </Link>
              </div>
            )
          })}
          </div>
        </TooltipProvider>
      </div>
    </section>
  )
}
