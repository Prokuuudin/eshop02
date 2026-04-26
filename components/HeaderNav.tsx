
import React from 'react';
import Link from 'next/link';
import { useTranslation } from '@/lib/use-translation';
import { useCategoriesConfig } from '@/lib/use-categories-config';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem
} from './ui/dropdown-menu';
import { ChevronDown } from 'lucide-react';

export default function HeaderNav({ onlyCatalog = false }: { onlyCatalog?: boolean }) {
  const { t, language } = useTranslation();
  const { categories } = useCategoriesConfig();
  const homeHref = onlyCatalog ? '/' : '/#home';

  const navLinkClass =
    'inline-flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors duration-200 hover:bg-indigo-50 hover:text-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60 dark:hover:bg-indigo-500/15 dark:hover:text-indigo-200';

  const [open, setOpen] = React.useState(false);
  return (
    <nav className="header__nav w-full overflow-hidden whitespace-nowrap">
      <ul className="header__nav-list flex flex-nowrap gap-1">
        <li className="header__nav-item"><Link href={homeHref} className={navLinkClass}>{t('nav.home')}</Link></li>
        <li className="header__nav-item">
          <DropdownMenu open={open} onOpenChange={setOpen} modal={false}>
            <DropdownMenuTrigger asChild>
              <button className={navLinkClass + ' flex items-center gap-1'} type="button">
                {t('nav.catalog')}
                <ChevronDown className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`} size={18} aria-hidden="true" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem asChild key="all">
                <Link href="/catalog">{t('categories.all')}</Link>
              </DropdownMenuItem>
              {categories.map(cat => (
                <DropdownMenuItem asChild key={cat.id}>
                  <Link href={cat.href}>{cat.titleKey ? t(cat.titleKey, cat.labels[language]) : cat.labels[language]}</Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </li>
        <li className="header__nav-item"><Link href="/blog" className={navLinkClass}>{t('nav.blog')}</Link></li>
        {!onlyCatalog && (
          <>
        <li className="header__nav-item"><Link href="/delivery-payment" className={navLinkClass}>{t('deliveryPayment.title')}</Link></li>
        <li className="header__nav-item"><Link href="/#brands" className={navLinkClass}>{t('nav.brands')}</Link></li>
        <li className="header__nav-item"><Link href="/#faq" className={navLinkClass}>{t('nav.faq')}</Link></li>
        <li className="header__nav-item"><Link href="/contact" className={navLinkClass}>{t('nav.contact')}</Link></li>
          </>
        )}
      </ul>
    </nav>
  );
}
