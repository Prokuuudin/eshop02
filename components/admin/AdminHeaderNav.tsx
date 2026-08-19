'use client';

import Link from 'next/link';
import { useUnprefixedPathname } from '@/lib/i18n-context';
import type { LucideIcon } from 'lucide-react';
import {
    ChevronDown,
    Cog,
    FileText,
    FolderTree,
    HandHelping,
    Megaphone,
    Menu,
    Settings,
    ShoppingCart,
    Users,
} from 'lucide-react';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from '@/components/ui/accordion';
import { useTranslation } from '@/lib/use-translation';
import { useAuthStore } from '@/lib/auth-store';
import { hasAdminPermission, permissionForAdminPath } from '@/lib/admin-permissions';

type HeaderNavItem = {
    title: string;
    href: string;
};

type HeaderNavSection = {
    title: string;
    icon: LucideIcon;
    items: HeaderNavItem[];
};

const NAV_SECTIONS: HeaderNavSection[] = [
    {
        title: 'catalog',
        icon: FolderTree,
        items: [
            { title: 'catalog.products', href: '/admin/products' },
            { title: 'catalog.categories', href: '/admin/categories' },
            { title: 'catalog.brands', href: '/admin/brands' },
            { title: 'catalog.import', href: '/admin/import' },
            { title: 'catalog.stockAlerts', href: '/admin/stock-alerts' },
            { title: 'catalog.bulkPrice', href: '/admin/products/bulk-price' },
        ],
    },
    {
        title: 'sales',
        icon: ShoppingCart,
        items: [
            { title: 'sales.orders', href: '/admin/orders' },
            { title: 'sales.rfq', href: '/admin/rfq' },
            { title: 'sales.returns', href: '/admin/returns' },
            { title: 'sales.analytics', href: '/admin/sales/analytics' },
        ],
    },
    {
        title: 'customers',
        icon: Users,
        items: [
            { title: 'customers.barcodes', href: '/admin/client-barcodes' },
            { title: 'customers.invitations', href: '/admin/invitations' },
            { title: 'customers.segments', href: '/admin/customers/segments' },
            { title: 'customers.history', href: '/admin/customers/history' },
            { title: 'customers.notifications', href: '/admin/notifications/send' },
        ],
    },
    {
        title: 'marketing',
        icon: Megaphone,
        items: [
            { title: 'marketing.campaigns', href: '/admin/marketing/campaigns' },
            { title: 'marketing.discounts', href: '/admin/marketing/discounts' },
            { title: 'marketing.analytics', href: '/admin/marketing/analytics' },
            { title: 'marketing.priceGroups', href: '/admin/marketing/price-groups' },
        ],
    },
    {
        title: 'content',
        icon: FileText,
        items: [
            { title: 'content.blog', href: '/admin/blog' },
            { title: 'content.pages', href: '/admin/content' },
            { title: 'content.banners', href: '/admin/content/banners' },
            { title: 'content.media', href: '/admin/content/media' },
        ],
    },
    {
        title: 'config',
        icon: Settings,
        items: [
            { title: 'config.shipping', href: '/admin/config/shipping' },
            { title: 'config.bonus', href: '/admin/bonus' },
            { title: 'config.integrations', href: '/account/integrations/webhooks' },
            { title: 'config.locale', href: '/admin/config/locale' },
            { title: 'config.emailTemplates', href: '/admin/config/email-templates' },
        ],
    },
    {
        title: 'system',
        icon: Cog,
        items: [
            { title: 'system.audit', href: '/account/audit-logs' },
            { title: 'system.logs', href: '/admin/system/logs' },
            { title: 'system.backup', href: '/admin/system/backup' },
        ],
    },
    {
        title: 'help',
        icon: HandHelping,
        items: [
            { title: 'help.knowledge', href: '/admin/help/knowledge' },
            { title: 'help.onboarding', href: '/admin/help/onboarding' },
            { title: 'help.faq', href: '/admin/help/faq' },
            { title: 'help.support', href: '/contact' },
        ],
    },
];

const NAV_LABELS = {
    ru: {
        menu: 'Меню',
        catalog: 'Каталог',
        'catalog.products': 'Карточки товаров',
        'catalog.categories': 'Категории',
        'catalog.brands': 'Бренды',
        'catalog.import': 'Импорт и обновления',
        'catalog.stockAlerts': 'Алерты остатков',
        'catalog.bulkPrice': 'Редактор цен',
        sales: 'Продажи',

        'sales.orders': 'Заказы',
        'sales.rfq': 'RFQ заявки',
        'sales.returns': 'Возвраты и отмены',
        'sales.analytics': 'Аналитика продаж',
        customers: 'Клиенты',
        'customers.accounts': 'Аккаунты компаний',
        'customers.barcodes': 'Карты клиентов',
        'customers.invitations': 'Приглашения клиентов',
        'customers.segments': 'Сегменты и статусы',
        'customers.history': 'История взаимодействий',
        'customers.notifications': 'Рассылка уведомлений',
        marketing: 'Продвижение',
        'marketing.campaigns': 'Промо-кампании',
        'marketing.discounts': 'Скидки и купоны',
        'marketing.analytics': 'Аналитика промо',
        'marketing.priceGroups': 'Прайс-листы',
        content: 'Контент',
        'content.blog': 'Блог',
        'content.pages': 'Страницы сайта',
        'content.banners': 'Баннеры',
        'content.media': 'Медиа-библиотека',
        config: 'Конфигурация',
        'config.shipping': 'Доставка и оплата',
        'config.bonus': 'Бонусная программа',
        'config.integrations': 'Интеграции и webhooks',
        'config.locale': 'Локализация',
        'config.emailTemplates': 'Email-шаблоны',
        system: 'Система',
        'system.users': 'Пользователи и роли',
        'system.audit': 'Журнал аудита',
        'system.logs': 'Логи и события',
        'system.backup': 'Резерв и восстановление',
        help: 'Помощь',
        'help.knowledge': 'База знаний',
        'help.onboarding': 'Онбординг сотрудников',
        'help.faq': 'Частые вопросы',
        'help.support': 'Поддержка',
    },
    en: {
        menu: 'Menu',
        catalog: 'Catalog',
        'catalog.products': 'Product cards',
        'catalog.categories': 'Categories',
        'catalog.brands': 'Brands',
        'catalog.import': 'Import and updates',
        'catalog.stockAlerts': 'Stock alerts',
        'catalog.bulkPrice': 'Bulk pricing',
        sales: 'Sales',

        'sales.orders': 'Orders',
        'sales.rfq': 'RFQ requests',
        'sales.returns': 'Returns and cancellations',
        'sales.analytics': 'Sales analytics',
        customers: 'Customers',
        'customers.accounts': 'Company accounts',
        'customers.barcodes': 'Client cards',
        'customers.invitations': 'Client invitations',
        'customers.segments': 'Segments and statuses',
        'customers.history': 'Interaction history',
        'customers.notifications': 'Notification Broadcast',
        marketing: 'Marketing',
        'marketing.campaigns': 'Promo campaigns',
        'marketing.discounts': 'Discounts and coupons',
        'marketing.analytics': 'Promo analytics',
        'marketing.priceGroups': 'Price lists',
        content: 'Content',
        'content.blog': 'Blog',
        'content.pages': 'Site pages',
        'content.banners': 'Banners',
        'content.media': 'Media library',
        config: 'Configuration',
        'config.shipping': 'Delivery and payment',
        'config.bonus': 'Bonus program',
        'config.integrations': 'Integrations and webhooks',
        'config.locale': 'Localization',
        'config.emailTemplates': 'Email templates',
        system: 'System',
        'system.users': 'Users and roles',
        'system.audit': 'Audit log',
        'system.logs': 'Logs and events',
        'system.backup': 'Backup and restore',
        help: 'Help',
        'help.knowledge': 'Knowledge base',
        'help.onboarding': 'Staff onboarding',
        'help.faq': 'FAQ',
        'help.support': 'Support',
    },
    lv: {
        menu: 'Izvēlne',
        catalog: 'Katalogs',
        'catalog.products': 'Produktu kartites',
        'catalog.categories': 'Kategorijas',
        'catalog.brands': 'Zimoli',
        'catalog.import': 'Imports un atjaunojumi',
        'catalog.stockAlerts': 'Krājumu brīdinājumi',
        'catalog.bulkPrice': 'Masveida cenas',
        sales: 'Pardosana',

        'sales.orders': 'Pasutijumi',
        'sales.rfq': 'RFQ pieprasijumi',
        'sales.returns': 'Atgriesana un atcelsana',
        'sales.analytics': 'Pardosanas analitika',
        customers: 'Klienti',
        'customers.accounts': 'Uznemumu konti',
        'customers.barcodes': 'Klientu kartes',
        'customers.invitations': 'Klientu ielūgumi',
        'customers.segments': 'Segmenti un statusi',
        'customers.history': 'Mijiedarbibas vesture',
        'customers.notifications': 'Pazinojumu izplatisana',
        marketing: 'Marketings',
        'marketing.campaigns': 'Promo kampanas',
        'marketing.discounts': 'Atlaides un kuponi',
        'marketing.analytics': 'Promo analitika',
        'marketing.priceGroups': 'Cenu saraksti',
        content: 'Saturs',
        'content.blog': 'Blogs',
        'content.pages': 'Vietnes lapas',
        'content.banners': 'Baneri',
        'content.media': 'Mediju biblioteka',
        config: 'Konfiguracija',
        'config.shipping': 'Piegade un apmaksa',
        'config.bonus': 'Bonusu programma',
        'config.integrations': 'Integracijas un webhooks',
        'config.locale': 'Lokalizacija',
        'config.emailTemplates': 'E-pasta veidnes',
        system: 'Sistema',
        'system.users': 'Lietotaji un lomas',
        'system.audit': 'Audita zurnals',
        'system.logs': 'Zurnali un notikumi',
        'system.backup': 'Rezerves kopijas un atjaunosana',
        help: 'Palidziba',
        'help.knowledge': 'Zinasanu baze',
        'help.onboarding': 'Darbinieku ievads',
        'help.faq': 'Biezak uzdotie jautajumi',
        'help.support': 'Atbalsts',
    },
} as const;

const isActive = (pathname: string, href: string): boolean => {
    const [baseHref] = href.split('#');
    if (!baseHref || baseHref === '/') return pathname === '/';
    return pathname === baseHref || pathname.startsWith(`${baseHref}/`);
};

export default function AdminHeaderNav(): React.ReactElement {
    const pathname = useUnprefixedPathname();
    const { language } = useTranslation();
    const labels = NAV_LABELS[language];
    const tr = (key: string) => labels[key as keyof typeof labels] ?? key;
    const user = useAuthStore((state) => state.user);
    const visibleSections = NAV_SECTIONS
        .map((section) => ({
            ...section,
            items: section.items.filter((item) =>
                item.href.startsWith('/admin')
                    ? hasAdminPermission(user, permissionForAdminPath(item.href))
                    : hasAdminPermission(user, 'settings.manage')
            ),
        }))
        .filter((section) => section.items.length > 0);
    const activeMobileSection = visibleSections.find((section) =>
        section.items.some((item) => isActive(pathname, item.href))
    )?.title;

    return (
        <div className="mx-auto w-fit max-w-full rounded-2xl bg-white/95 p-2 shadow-sm dark:bg-gray-900/95">
            {/* Mobile: one menu listing every section, instead of a horizontally-scrolling row of tiny dropdowns */}
            <div className="md:hidden">
                <DropdownMenu modal={false}>
                    <DropdownMenuTrigger asChild>
                        <button
                            type="button"
                            className="inline-flex h-11 items-center gap-2 whitespace-nowrap rounded-md px-3 text-sm font-medium text-foreground transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
                        >
                            <Menu className="h-4 w-4" />
                            {tr('menu')}
                            <ChevronDown className="h-4 w-4 opacity-70" />
                        </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="max-h-[75vh] w-[min(340px,calc(100vw-24px))] overflow-y-auto p-2">
                        <Accordion
                            key={pathname}
                            type="single"
                            collapsible
                            defaultValue={activeMobileSection}
                            className="space-y-1"
                        >
                            {visibleSections.map((section) => {
                                const Icon = section.icon;
                                const sectionActive = section.items.some((item) => isActive(pathname, item.href));

                                return (
                                    <AccordionItem key={section.title} value={section.title} className="rounded-md border border-border">
                                        <AccordionTrigger
                                            className={`min-h-11 rounded-md px-3 py-2.5 hover:no-underline ${
                                                sectionActive
                                                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200'
                                                    : 'hover:bg-gray-100 dark:hover:bg-gray-800'
                                            }`}
                                        >
                                            <span className="flex items-center gap-2">
                                                <Icon className="h-4 w-4" />
                                                {tr(section.title)}
                                            </span>
                                        </AccordionTrigger>
                                        <AccordionContent className="space-y-1 px-1 pb-1 pt-1">
                                            {section.items.map((item) => {
                                                const active = isActive(pathname, item.href);
                                                return (
                                                    <DropdownMenuItem
                                                        key={`mobile-${section.title}-${item.title}`}
                                                        asChild
                                                        className={`min-h-11 pl-8 ${
                                                            active
                                                                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200'
                                                                : ''
                                                        }`}
                                                    >
                                                        <Link href={item.href}>{tr(item.title)}</Link>
                                                    </DropdownMenuItem>
                                                );
                                            })}
                                        </AccordionContent>
                                    </AccordionItem>
                                );
                            })}
                        </Accordion>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>

            {/* Desktop: per-section dropdowns in a row */}
            <div className="hidden md:flex items-center justify-center gap-2 overflow-x-auto">
                {visibleSections.map((section) => {
                    const Icon = section.icon;
                    const sectionActive = section.items.some((item) =>
                        isActive(pathname, item.href)
                    );

                    return (
                        <DropdownMenu key={section.title} modal={false}>
                            <DropdownMenuTrigger asChild>
                                <button
                                    type="button"
                                    className={`inline-flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                                        sectionActive
                                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'
                                            : 'text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800'
                                    }`}
                                >
                                    <Icon className="h-4 w-4" />
                                    {tr(section.title)}
                                    <ChevronDown className="h-4 w-4 opacity-70" />
                                </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="min-w-[260px]">
                                {section.items.map((item) => {
                                    const active = isActive(pathname, item.href);

                                    return (
                                        <DropdownMenuItem
                                            key={`${section.title}-${item.title}`}
                                            asChild
                                            className={
                                                active
                                                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200'
                                                    : ''
                                            }
                                        >
                                            <Link href={item.href}>{tr(item.title)}</Link>
                                        </DropdownMenuItem>
                                    );
                                })}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    );
                })}
            </div>
        </div>
    );
}
