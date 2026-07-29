import React from 'react';
import Link from 'next/link';
import { useTranslation } from '@/lib/use-translation';
import { useCategoriesConfig } from '@/lib/use-categories-config';
import {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSub,
    DropdownMenuSubTrigger,
    DropdownMenuSubContent,
} from './ui/dropdown-menu';
import { ChevronDown } from 'lucide-react';

export default function HeaderNav({ onlyCatalog = false }: { onlyCatalog?: boolean }): React.ReactElement {
    const { t, language } = useTranslation();
    const { categories } = useCategoriesConfig();
    const homeHref = onlyCatalog ? '/' : '/#home';

    const navLinkClass =
        'inline-flex items-center rounded-md px-2 lg:px-3 py-2 text-sm font-medium transition-colors duration-200 hover:bg-primary/5 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 dark:hover:bg-primary/80/15 dark:hover:text-primary';

    const [open, setOpen] = React.useState(false);
    const [importantOpen, setImportantOpen] = React.useState(false);
    return (
        <nav className="header__nav max-w-full overflow-hidden whitespace-nowrap">
            <ul className="header__nav-list flex flex-nowrap gap-0.5 lg:gap-1">
                <li className="header__nav-item">
                    <Link href={homeHref} className={navLinkClass}>
                        {t('nav.home')}
                    </Link>
                </li>
                <li className="header__nav-item">
                    <DropdownMenu open={open} onOpenChange={setOpen} modal={false}>
                        <DropdownMenuTrigger asChild>
                            <button
                                className={navLinkClass + ' flex items-center gap-1'}
                                type="button"
                            >
                                {t('nav.catalog')}
                                <ChevronDown
                                    className={`transition-transform duration-200 ${
                                        open ? 'rotate-180' : ''
                                    }`}
                                    size={18}
                                    aria-hidden="true"
                                />
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start">
                            <DropdownMenuItem asChild key="all">
                                <Link href="/catalog">{t('categories.all')}</Link>
                            </DropdownMenuItem>
                            {categories.map((cat) => {
                                const catLabel = cat.titleKey
                                    ? t(cat.titleKey, cat.labels[language])
                                    : cat.labels[language];
                                const subcategories = cat.subcategories ?? [];

                                if (subcategories.length === 0) {
                                    return (
                                        <DropdownMenuItem asChild key={cat.id}>
                                            <Link href={cat.href}>{catLabel}</Link>
                                        </DropdownMenuItem>
                                    );
                                }

                                return (
                                    <DropdownMenuSub key={cat.id}>
                                        <DropdownMenuSubTrigger>{catLabel}</DropdownMenuSubTrigger>
                                        <DropdownMenuSubContent>
                                            <DropdownMenuItem asChild key={`${cat.id}-all`}>
                                                <Link href={cat.href}>{t('categories.all')}</Link>
                                            </DropdownMenuItem>
                                            {subcategories.map((sub) => (
                                                <DropdownMenuItem asChild key={`${cat.id}-${sub.slug}`}>
                                                    <Link
                                                        href={`/catalog?cat=${cat.id}&subcat=${encodeURIComponent(sub.slug)}`}
                                                    >
                                                        {sub.key
                                                            ? t(sub.key, sub.labels[language])
                                                            : sub.labels[language]}
                                                    </Link>
                                                </DropdownMenuItem>
                                            ))}
                                        </DropdownMenuSubContent>
                                    </DropdownMenuSub>
                                );
                            })}
                        </DropdownMenuContent>
                    </DropdownMenu>
                </li>
                <li className="header__nav-item">
                    <Link href="/#brands" className={navLinkClass}>
                        {t('nav.brands')}
                    </Link>
                </li>
                <li className="header__nav-item">
                    <Link href="/blog" className={navLinkClass}>
                        {t('nav.blog')}
                    </Link>
                </li>
                {!onlyCatalog && (
                    <>
                        <li className="header__nav-item">
                            <DropdownMenu open={importantOpen} onOpenChange={setImportantOpen} modal={false}>
                                <DropdownMenuTrigger asChild>
                                    <button
                                        className={navLinkClass + ' flex items-center gap-1'}
                                        type="button"
                                    >
                                        {t('nav.important')}
                                        <ChevronDown
                                            className={`transition-transform duration-200 ${
                                                importantOpen ? 'rotate-180' : ''
                                            }`}
                                            size={18}
                                            aria-hidden="true"
                                        />
                                    </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="start">
                                    <DropdownMenuItem asChild key="delivery">
                                        <Link href="/delivery-payment#delivery">
                                            {t('deliveryPayment.deliveryTitle')}
                                        </Link>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem asChild key="payment">
                                        <Link href="/delivery-payment#payment">
                                            {t('deliveryPayment.paymentTitle')}
                                        </Link>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem asChild key="bonus">
                                        <Link href="/#bonus">{t('breadcrumb.bonus')}</Link>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem asChild key="promotions">
                                        <Link href="/#sale">{t('nav.promotions')}</Link>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem asChild key="stores">
                                        <Link href="/stores">{t('nav.stores')}</Link>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem asChild key="about">
                                        <Link href="/#about">{t('nav.about')}</Link>
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </li>
                        <li className="header__nav-item">
                            <Link href="/#faq" className={navLinkClass}>
                                {t('nav.faq')}
                            </Link>
                        </li>
                        <li className="header__nav-item">
                            <Link href="/contact" className={navLinkClass}>
                                {t('nav.contact')}
                            </Link>
                        </li>
                    </>
                )}
            </ul>
        </nav>
    );
}
