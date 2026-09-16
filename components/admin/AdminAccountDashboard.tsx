'use client';

import { useEffect, useState } from 'react';
import { reportAdminPartial } from '@/lib/admin-ui-errors';
import Link from 'next/link';
import Image from 'next/image';
import {
    Cog,
    FileText,
    FolderTree,
    HandHelping,
    Megaphone,
    Settings,
    ShoppingCart,
    Users,
    UserCircle2,
    ArrowRight,
    TrendingUp,
    Package,
    AlertTriangle,
    ClipboardList,
} from 'lucide-react';
import { type User } from '@/lib/auth';
import UnansweredCustomerRequests from '@/components/admin/UnansweredCustomerRequests';
import { useAdminLocale } from '@/lib/use-admin-locale';

const CARD_TONES = {
    amber: {
        icon: 'text-amber-600 bg-amber-100 dark:bg-amber-900/40 dark:text-amber-400',
        surface: 'bg-amber-50 border-l-amber-500 dark:bg-amber-950/20',
    },
    emerald: {
        icon: 'text-emerald-600 bg-emerald-100 dark:bg-emerald-900/40 dark:text-emerald-400',
        surface: 'bg-emerald-50 border-l-emerald-500 dark:bg-emerald-950/20',
    },
    blue: {
        icon: 'text-blue-600 bg-blue-100 dark:bg-blue-900/40 dark:text-blue-400',
        surface: 'bg-blue-50 border-l-blue-500 dark:bg-blue-950/20',
    },
    violet: {
        icon: 'text-violet-600 bg-violet-100 dark:bg-violet-900/40 dark:text-violet-400',
        surface: 'bg-violet-50 border-l-violet-500 dark:bg-violet-950/20',
    },
    pink: {
        icon: 'text-pink-600 bg-pink-100 dark:bg-pink-900/40 dark:text-pink-400',
        surface: 'bg-pink-50 border-l-pink-500 dark:bg-pink-950/20',
    },
    slate: {
        icon: 'text-slate-600 bg-slate-100 dark:bg-slate-900/40 dark:text-slate-400',
        surface: 'bg-slate-50 border-l-slate-500 dark:bg-slate-950/20',
    },
    red: {
        icon: 'text-red-600 bg-red-100 dark:bg-red-900/40 dark:text-red-400',
        surface: 'bg-red-50 border-l-red-500 dark:bg-red-950/20',
    },
    teal: {
        icon: 'text-teal-600 bg-teal-100 dark:bg-teal-900/40 dark:text-teal-400',
        surface: 'bg-teal-50 border-l-teal-500 dark:bg-teal-950/20',
    },
} as const;

type CardTone = keyof typeof CARD_TONES;

type NavItem = { label: string; href: string };
type NavSection = {
    title: string;
    icon: React.ElementType;
    tone: CardTone;
    items: NavItem[];
};

const NAV_SECTIONS: NavSection[] = [
    {
        title: 'Каталог',
        icon: FolderTree,
        tone: 'amber',
        items: [
            { label: 'Товары', href: '/admin/products' },
            { label: 'Категории', href: '/admin/categories' },
            { label: 'Бренды', href: '/admin/brands' },
            { label: 'Импорт', href: '/admin/import' },
            { label: 'Алерты остатков', href: '/admin/stock-alerts' },
            { label: 'Массовый редактор цен', href: '/admin/products/bulk-price' },
        ],
    },
    {
        title: 'Продажи',
        icon: ShoppingCart,
        tone: 'emerald',
        items: [
            { label: 'Заказы', href: '/admin/orders' },
            { label: 'RFQ заявки', href: '/admin/rfq' },
            { label: 'Возвраты', href: '/admin/returns' },
            { label: 'Аналитика продаж', href: '/admin/sales/analytics' },
        ],
    },
    {
        title: 'Клиенты',
        icon: Users,
        tone: 'blue',
        items: [
            { label: 'Зарегистрированные клиенты', href: '/admin/client-barcodes' },
            { label: 'База клиентов', href: '/admin/client-database' },
            { label: 'Приглашения клиентов', href: '/admin/invitations' },
            { label: 'Сегменты', href: '/admin/customers/segments' },
            { label: 'История', href: '/admin/customers/history' },
            { label: 'Рассылка уведомлений', href: '/admin/notifications/send' },
            { label: 'Запросы покупателей', href: '/admin/contact-messages' },
        ],
    },
    {
        title: 'Маркетинг',
        icon: Megaphone,
        tone: 'violet',
        items: [
            { label: 'Кампании', href: '/admin/marketing/campaigns' },
            { label: 'Промокоды', href: '/admin/marketing/discounts' },
            { label: 'Прайс-листы', href: '/admin/marketing/price-groups' },
        ],
    },
    {
        title: 'Контент',
        icon: FileText,
        tone: 'pink',
        items: [
            { label: 'Блог', href: '/admin/blog' },
            { label: 'Страницы', href: '/admin/content' },
            { label: 'Баннеры', href: '/admin/content/banners' },
            { label: 'Медиа', href: '/admin/content/media' },
        ],
    },
    {
        title: 'Конфигурация',
        icon: Settings,
        tone: 'slate',
        items: [
            { label: 'Доставка и оплата', href: '/admin/config/shipping' },
            { label: 'Бонусная программа', href: '/admin/bonus' },
            { label: 'Локализация', href: '/admin/config/locale' },
            { label: 'Email-шаблоны', href: '/admin/config/email-templates' },
        ],
    },
    {
        title: 'Система',
        icon: Cog,
        tone: 'red',
        items: [
            { label: 'Журнал аудита', href: '/admin/system/admin-log' },
            { label: 'Логи', href: '/admin/system/logs' },
            { label: 'Резервные копии', href: '/admin/system/backup' },
        ],
    },
    {
        title: 'Помощь',
        icon: HandHelping,
        tone: 'teal',
        items: [
            { label: 'База знаний', href: '/admin/help/knowledge' },
            { label: 'Онбординг', href: '/admin/help/onboarding' },
            { label: 'FAQ', href: '/admin/help/faq' },
        ],
    },
];

function formatMoney(v: number, locale: string) {
    return v.toLocaleString(locale, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
}

function KpiCard({
    icon: Icon,
    label,
    value,
    sub,
    href,
    tone,
}: {
    icon: React.ElementType;
    label: string;
    value: string;
    sub?: string;
    href: string;
    tone: CardTone;
}) {
    return (
        <Link
            href={href}
            className={`group flex items-center gap-4 rounded-2xl border border-border border-l-4 p-5 shadow-sm transition-all hover:shadow-md ${CARD_TONES[tone].surface}`}
        >
            <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${CARD_TONES[tone].icon}`}>
                <Icon className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="mt-0.5 text-xl font-bold text-foreground">{value}</p>
                {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
            </div>
            <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-gray-500" />
        </Link>
    );
}

export default function AdminAccountDashboard({ user }: { user: User }): React.ReactElement {
    const { locale, l } = useAdminLocale();
    const navLabels: Record<string, string> = {
        'Каталог': l('Каталог', 'Catalog', 'Katalogs'), 'Товары': l('Товары', 'Products', 'Preces'),
        'Категории': l('Категории', 'Categories', 'Kategorijas'), 'Бренды': l('Бренды', 'Brands', 'Zīmoli'),
        'Импорт': l('Импорт', 'Import', 'Imports'), 'Алерты остатков': l('Алерты остатков', 'Stock alerts', 'Krājumu brīdinājumi'),
        'Массовый редактор цен': l('Массовый редактор цен', 'Bulk pricing', 'Masveida cenu redaktors'),
        'Продажи': l('Продажи', 'Sales', 'Pārdošana'), 'Заказы': l('Заказы', 'Orders', 'Pasūtījumi'),
        'RFQ заявки': l('RFQ заявки', 'RFQ requests', 'RFQ pieprasījumi'), 'Возвраты': l('Возвраты', 'Returns', 'Atgriešana'),
        'Аналитика продаж': l('Аналитика продаж', 'Sales analytics', 'Pārdošanas analītika'),
        'Клиенты': l('Клиенты', 'Customers', 'Klienti'), 'Зарегистрированные клиенты': l('Зарегистрированные клиенты', 'Registered customers', 'Reģistrētie klienti'),
        'База клиентов': l('База клиентов', 'Customer database', 'Klientu datubāze'), 'Приглашения клиентов': l('Приглашения клиентов', 'Customer invitations', 'Klientu ielūgumi'),
        'Сегменты': l('Сегменты', 'Segments', 'Segmenti'), 'История': l('История', 'History', 'Vēsture'),
        'Рассылка уведомлений': l('Рассылка уведомлений', 'Notification broadcast', 'Paziņojumu izsūtīšana'), 'Запросы покупателей': l('Запросы покупателей', 'Customer requests', 'Klientu pieprasījumi'),
        'Маркетинг': l('Маркетинг', 'Marketing', 'Mārketings'), 'Кампании': l('Кампании', 'Campaigns', 'Kampaņas'),
        'Промокоды': l('Промокоды', 'Promo codes', 'Promokodi'), 'Прайс-листы': l('Прайс-листы', 'Price lists', 'Cenu lapas'),
        'Контент': l('Контент', 'Content', 'Saturs'), 'Блог': l('Блог', 'Blog', 'Blogs'),
        'Страницы': l('Страницы', 'Pages', 'Lapas'), 'Баннеры': l('Баннеры', 'Banners', 'Baneri'), 'Медиа': l('Медиа', 'Media', 'Mediji'),
        'Конфигурация': l('Конфигурация', 'Configuration', 'Konfigurācija'), 'Доставка и оплата': l('Доставка и оплата', 'Delivery and payment', 'Piegāde un apmaksa'),
        'Бонусная программа': l('Бонусная программа', 'Bonus program', 'Bonusu programma'), 'Локализация': l('Локализация', 'Localization', 'Lokalizācija'),
        'Email-шаблоны': l('Email-шаблоны', 'Email templates', 'E-pasta veidnes'), 'Система': l('Система', 'System', 'Sistēma'),
        'Журнал аудита': l('Журнал аудита', 'Audit log', 'Audita žurnāls'), 'Логи': l('Логи', 'Logs', 'Žurnāli'),
        'Резервные копии': l('Резервные копии', 'Backups', 'Rezerves kopijas'), 'Помощь': l('Помощь', 'Help', 'Palīdzība'),
        'База знаний': l('База знаний', 'Knowledge base', 'Zināšanu bāze'), 'Онбординг': l('Онбординг', 'Onboarding', 'Ievadapmācība'),
    };
    const [statsTimestamp] = useState(Date.now);
    const [lowStockCount, setLowStockCount] = useState<number | null>(null);
    const [totalCustomers, setTotalCustomers] = useState<number>(0);
    const [newCustomers7d, setNewCustomers7d] = useState<number>(0);
    const [pendingRequestCount, setPendingRequestCount] = useState<number>(0);
    const [orderStats, setOrderStats] = useState({ ordersToday: 0, revenue7d: 0, totalOrders: 0 });

    useEffect(() => {
        // Заявки на карту — из Neon: клиенты подают их со своих браузеров,
        // в localStorage админа их нет
        fetch('/api/admin/access-requests?status=pending')
            .then((r) => r.json())
            .then((json: { total?: number }) => setPendingRequestCount(json.total ?? 0))
            .catch(() => reportAdminPartial(l('Счётчик заявок недоступен.', 'Application count is unavailable.', 'Pieteikumu skaits nav pieejams.'), 'Dashboard'));
        fetch('/api/admin/products')
            .then((r) => r.json())
            .then((products: { stock: number }[]) => {
                if (Array.isArray(products)) {
                    setLowStockCount(products.filter((p) => p.stock <= 5).length);
                }
            })
            .catch(() => reportAdminPartial(l('Счётчик низких остатков недоступен.', 'Low-stock count is unavailable.', 'Zemu krājumu skaits nav pieejams.'), 'Dashboard'));
        const sevenDaysAgo = new Date(statsTimestamp - 7 * 86400000).toISOString();
        Promise.all([
            fetch('/api/admin/users?role=customer&take=1', { cache: 'no-store' }),
            fetch(`/api/admin/users?role=customer&take=1&createdSince=${encodeURIComponent(sevenDaysAgo)}`, { cache: 'no-store' }),
        ])
            .then(async ([all, recent]) => {
                if (!all.ok || !recent.ok) return;
                const [allData, recentData] = await Promise.all([all.json(), recent.json()]) as [{ total?: number }, { total?: number }];
                setTotalCustomers(allData.total ?? 0);
                setNewCustomers7d(recentData.total ?? 0);
            })
            .catch(() => reportAdminPartial(l('Статистика клиентов недоступна.', 'Customer statistics are unavailable.', 'Klientu statistika nav pieejama.'), 'Dashboard'));
        // Order KPIs are computed server-side instead of scanning the entire
        // admin order table in the browser (see /api/admin/orders/stats).
        fetch('/api/admin/orders/stats', { cache: 'no-store' })
            .then((r) => (r.ok ? r.json() : null))
            .then((json: { todayOrderCount?: number; last7DaysRevenue?: number; totalOrderCount?: number } | null) => {
                if (!json) return;
                setOrderStats({
                    ordersToday: json.todayOrderCount ?? 0,
                    revenue7d: json.last7DaysRevenue ?? 0,
                    totalOrders: json.totalOrderCount ?? 0,
                });
            })
            .catch(() => reportAdminPartial(l('Статистика заказов недоступна.', 'Order statistics are unavailable.', 'Pasūtījumu statistika nav pieejama.'), 'Dashboard'));
    }, [l, statsTimestamp]);

    const stats = orderStats;

    const now = new Date();
    const hour = now.getHours();
    const greeting =
        hour < 6 ? l('Доброй ночи', 'Good night', 'Labvakar') : hour < 12 ? l('Доброе утро', 'Good morning', 'Labrīt') : hour < 18 ? l('Добрый день', 'Good afternoon', 'Labdien') : l('Добрый вечер', 'Good evening', 'Labvakar');
    const currentDate = now.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

    return (
        <div className="space-y-8">
            {/* Profile hero */}
            <div className="flex flex-col gap-4 rounded-2xl border border-border border-l-4 border-l-emerald-500 bg-emerald-50 p-6 shadow-sm dark:bg-emerald-950/20 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-4">
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-emerald-600 text-white shadow-sm">
                        {user.avatarUrl ? (
                            <Image
                                src={user.avatarUrl}
                                alt={user.name || 'avatar'}
                                width={64}
                                height={64}
                                className="h-16 w-16 object-cover"
                            />
                        ) : (
                            <UserCircle2 className="h-8 w-8" />
                        )}
                    </div>
                    <div>
                        <p className="text-sm text-muted-foreground">
                            {greeting},{' '}
                            <span className="text-muted-foreground">{currentDate}</span>
                        </p>
                        <h1 className="text-xl font-bold text-foreground">
                            {user.name || user.email}
                        </h1>
                        <span className="mt-1 inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                            {l('Администратор', 'Administrator', 'Administrators')}
                        </span>
                    </div>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Link
                        href="/account/profile"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-gray-50 dark:hover:bg-gray-800"
                    >
                        {l('Редактировать профиль', 'Edit profile', 'Rediģēt profilu')}
                    </Link>
                    <Link
                        href="/admin"
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700"
                    >
                        {l('Открыть админ-панель', 'Open admin panel', 'Atvērt administrācijas paneli')}
                        <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                </div>
            </div>

            {/* Pending requests banner */}
            {pendingRequestCount > 0 && (
                <Link
                    href="/admin/client-barcodes"
                    className="flex items-center justify-between gap-4 rounded-2xl border border-amber-300 bg-amber-50 px-5 py-4 shadow-sm transition-colors hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-900/20 dark:hover:bg-amber-900/30"
                >
                    <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-400 text-white text-lg font-bold dark:bg-amber-600">
                            {pendingRequestCount}
                        </span>
                        <div>
                            <p className="font-semibold text-amber-900 dark:text-amber-200">
                                {pendingRequestCount === 1
                                    ? l('Заявка на карту клиента ждёт одобрения', 'A customer card application awaits approval', 'Klienta kartes pieteikums gaida apstiprinājumu')
                                    : l(`${pendingRequestCount} заявки на карту клиента ждут одобрения`, `${pendingRequestCount} customer card applications await approval`, `${pendingRequestCount} klientu karšu pieteikumi gaida apstiprinājumu`)}
                            </p>
                            <p className="text-xs text-amber-700 dark:text-amber-400">{l('Нажмите, чтобы перейти к заявкам', 'Click to review applications', 'Noklikšķiniet, lai skatītu pieteikumus')}</p>
                        </div>
                    </div>
                    <ArrowRight className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                </Link>
            )}

            {/* KPI cards */}
            <div>
                <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    {l('Сводка', 'Summary', 'Kopsavilkums')}
                </h2>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <KpiCard
                        icon={ClipboardList}
                        label={l('Заказов сегодня', 'Orders today', 'Pasūtījumi šodien')}
                        value={String(stats.ordersToday)}
                        sub={l(`Всего: ${stats.totalOrders}`, `Total: ${stats.totalOrders}`, `Kopā: ${stats.totalOrders}`)}
                        href="/admin/orders"
                        tone="emerald"
                    />
                    <KpiCard
                        icon={TrendingUp}
                        label={l('Выручка за 7 дней', 'Revenue for 7 days', 'Ieņēmumi par 7 dienām')}
                        value={formatMoney(stats.revenue7d, locale)}
                        href="/admin/sales/analytics"
                        tone="blue"
                    />
                    <KpiCard
                        icon={AlertTriangle}
                        label={l('Мало на складе (≤5)', 'Low stock (≤5)', 'Mazs atlikums (≤5)')}
                        value={lowStockCount === null ? '...' : String(lowStockCount)}
                        sub={l('Требуют внимания', 'Needs attention', 'Jāpievērš uzmanība')}
                        href="/admin/stock-alerts"
                        tone="amber"
                    />
                    <KpiCard
                        icon={Package}
                        label={l('Всего заказов', 'Total orders', 'Pasūtījumi kopā')}
                        value={String(stats.totalOrders)}
                        href="/admin/orders"
                        tone="violet"
                    />
                    <KpiCard
                        icon={Users}
                        label={l('Новые клиенты за 7 дней / Всего', 'New customers in 7 days / Total', 'Jaunie klienti 7 dienās / Kopā')}
                        value={`${newCustomers7d} / ${totalCustomers}`}
                        href="/admin/client-barcodes"
                        tone="pink"
                    />
                    <UnansweredCustomerRequests />
                </div>
            </div>

            {/* Quick navigation */}
            <div>
                <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    {l('Быстрый доступ', 'Quick access', 'Ātrā piekļuve')}
                </h2>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {NAV_SECTIONS.map((section) => {
                        const Icon = section.icon;
                        return (
                            <div
                                key={section.title}
                                className={`rounded-2xl border border-border border-l-4 p-4 shadow-sm ${CARD_TONES[section.tone].surface}`}
                            >
                                <div className="mb-3 flex items-center gap-2">
                                    <div
                                        className={`flex h-8 w-8 items-center justify-center rounded-lg ${CARD_TONES[section.tone].icon}`}
                                    >
                                        <Icon className="h-4 w-4" />
                                    </div>
                                    <span className="text-sm font-semibold text-foreground">
                                        {navLabels[section.title] ?? section.title}
                                    </span>
                                </div>
                                <ul className="space-y-1">
                                    {section.items.map((item) => (
                                        <li key={item.href}>
                                            <Link
                                                href={item.href}
                                                className="block rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-white/70 hover:text-foreground dark:hover:bg-white/5"
                                            >
                                                {navLabels[item.label] ?? item.label}
                                            </Link>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
