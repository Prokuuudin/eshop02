'use client';

import { useEffect, useMemo, useState } from 'react';
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
import { useOrders } from '@/lib/orders-store';
import { type User } from '@/lib/auth';

type NavItem = { label: string; href: string };
type NavSection = {
    title: string;
    icon: React.ElementType;
    color: string;
    items: NavItem[];
};

const NAV_SECTIONS: NavSection[] = [
    {
        title: 'Каталог',
        icon: FolderTree,
        color: 'text-amber-600 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-400',
        items: [
            { label: 'Товары', href: '/admin/products' },
            { label: 'Категории', href: '/admin/categories' },
            { label: 'Бренды', href: '/admin/brands' },
            { label: 'Импорт', href: '/admin/import' },
            { label: 'Алерты остатков', href: '/admin/stock-alerts' },
            { label: 'Массовые цены', href: '/admin/products/bulk-price' },
        ],
    },
    {
        title: 'Продажи',
        icon: ShoppingCart,
        color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 dark:text-emerald-400',
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
        color: 'text-blue-600 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-400',
        items: [
            { label: 'Аккаунты', href: '/admin/accounts' },
            { label: 'Карты клиентов', href: '/admin/client-barcodes' },
            { label: 'Сегменты', href: '/admin/customers/segments' },
            { label: 'История', href: '/admin/customers/history' },
            { label: 'Рассылка уведомлений', href: '/admin/notifications/send' },
        ],
    },
    {
        title: 'Маркетинг',
        icon: Megaphone,
        color: 'text-violet-600 bg-violet-50 dark:bg-violet-900/20 dark:text-violet-400',
        items: [
            { label: 'Кампании', href: '/admin/marketing/campaigns' },
            { label: 'Скидки и купоны', href: '/admin/marketing/discounts' },
            { label: 'Подборки', href: '/admin/marketing/showcases' },
            { label: 'Прайс-листы', href: '/admin/marketing/price-groups' },
        ],
    },
    {
        title: 'Контент',
        icon: FileText,
        color: 'text-pink-600 bg-pink-50 dark:bg-pink-900/20 dark:text-pink-400',
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
        color: 'text-gray-600 bg-muted dark:text-gray-400',
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
        color: 'text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400',
        items: [
            { label: 'Журнал аудита', href: '/account/audit-logs' },
            { label: 'Логи', href: '/admin/system/logs' },
            { label: 'Резервные копии', href: '/admin/system/backup' },
        ],
    },
    {
        title: 'Помощь',
        icon: HandHelping,
        color: 'text-teal-600 bg-teal-50 dark:bg-teal-900/20 dark:text-teal-400',
        items: [
            { label: 'База знаний', href: '/admin/help/knowledge' },
            { label: 'Онбординг', href: '/admin/help/onboarding' },
            { label: 'FAQ', href: '/admin/help/faq' },
        ],
    },
];

function formatMoney(v: number) {
    return v.toLocaleString('ru-RU', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
}

function KpiCard({
    icon: Icon,
    label,
    value,
    sub,
    href,
    color,
}: {
    icon: React.ElementType;
    label: string;
    value: string;
    sub?: string;
    href: string;
    color: string;
}) {
    return (
        <Link
            href={href}
            className="group flex items-center gap-4 rounded-2xl border border-gray-200 bg-white p-5 transition-all hover:border-gray-300 hover:shadow-sm dark:border-gray-700 dark:bg-gray-900 dark:hover:border-gray-600"
        >
            <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${color}`}>
                <Icon className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="mt-0.5 text-xl font-bold text-foreground">{value}</p>
                {sub && <p className="mt-0.5 text-xs text-gray-400">{sub}</p>}
            </div>
            <ArrowRight className="h-4 w-4 shrink-0 text-gray-300 transition-transform group-hover:translate-x-0.5 group-hover:text-gray-500 dark:text-gray-600" />
        </Link>
    );
}

export default function AdminAccountDashboard({ user }: { user: User }): React.ReactElement {
    const orders = useOrders((s) => s.orders);
    const [statsTimestamp] = useState(Date.now);
    const [lowStockCount, setLowStockCount] = useState<number | null>(null);
    const [totalCustomers, setTotalCustomers] = useState<number>(0);
    const [newCustomers7d, setNewCustomers7d] = useState<number>(0);
    const [pendingRequestCount, setPendingRequestCount] = useState<number>(0);

    useEffect(() => {
        // Заявки на карту — из Neon: клиенты подают их со своих браузеров,
        // в localStorage админа их нет
        fetch('/api/admin/access-requests?status=pending')
            .then((r) => r.json())
            .then((json: { total?: number }) => setPendingRequestCount(json.total ?? 0))
            .catch(() => reportAdminPartial('Счётчик заявок недоступен.', 'Dashboard'));
        fetch('/api/admin/products')
            .then((r) => r.json())
            .then((products: { stock: number }[]) => {
                if (Array.isArray(products)) {
                    setLowStockCount(products.filter((p) => p.stock <= 5).length);
                }
            })
            .catch(() => reportAdminPartial('Счётчик низких остатков недоступен.', 'Dashboard'));
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
            .catch(() => reportAdminPartial('Статистика клиентов недоступна.', 'Dashboard'));
    }, [statsTimestamp]);

    const stats = useMemo(() => {
        const sevenDaysAgo = statsTimestamp - 7 * 86400000;
        const todayStart = new Date(statsTimestamp);
        todayStart.setHours(0, 0, 0, 0);

        const recent = orders.filter((o) => new Date(o.createdAt).getTime() >= sevenDaysAgo);
        const today = orders.filter((o) => new Date(o.createdAt).getTime() >= todayStart.getTime());

        const allEmails = new Set(orders.map((o) => o.email.toLowerCase()));
        const recentEmails = new Set(recent.map((o) => o.email.toLowerCase()));
        const newBuyers7d = [...recentEmails].filter((e) => {
            const firstOrder = orders
                .filter((o) => o.email.toLowerCase() === e)
                .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())[0];
            return firstOrder && new Date(firstOrder.createdAt).getTime() >= sevenDaysAgo;
        }).length;

        return {
            ordersToday: today.length,
            revenue7d: recent.reduce((s, o) => s + (o.total ?? 0), 0),
            totalOrders: orders.length,
            uniqueBuyers: allEmails.size,
            newBuyers7d,
        };
    }, [orders, statsTimestamp]);

    const now = new Date();
    const hour = now.getHours();
    const greeting =
        hour < 6 ? 'Доброй ночи' : hour < 12 ? 'Доброе утро' : hour < 18 ? 'Добрый день' : 'Добрый вечер';
    const currentDate = now.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

    return (
        <div className="space-y-8">
            {/* Profile hero */}
            <div className="flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-900 sm:flex-row sm:items-center sm:justify-between">
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
                            <span className="text-gray-400 dark:text-gray-500">{currentDate}</span>
                        </p>
                        <h1 className="text-xl font-bold text-foreground">
                            {user.name || user.email}
                        </h1>
                        <span className="mt-1 inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                            Администратор
                        </span>
                    </div>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Link
                        href="/account/profile"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                    >
                        Редактировать профиль
                    </Link>
                    <Link
                        href="/admin"
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700"
                    >
                        Открыть админ-панель
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
                                    ? 'Заявка на карту клиента ждёт одобрения'
                                    : `${pendingRequestCount} заявки на карту клиента ждут одобрения`}
                            </p>
                            <p className="text-xs text-amber-700 dark:text-amber-400">Нажмите, чтобы перейти к заявкам</p>
                        </div>
                    </div>
                    <ArrowRight className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                </Link>
            )}

            {/* KPI cards */}
            <div>
                <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">
                    Сводка
                </h2>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <KpiCard
                        icon={ClipboardList}
                        label="Заказов сегодня"
                        value={String(stats.ordersToday)}
                        sub={`Всего: ${stats.totalOrders}`}
                        href="/admin/orders"
                        color="text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 dark:text-emerald-400"
                    />
                    <KpiCard
                        icon={TrendingUp}
                        label="Выручка за 7 дней"
                        value={formatMoney(stats.revenue7d)}
                        href="/admin/sales/analytics"
                        color="text-blue-600 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-400"
                    />
                    <KpiCard
                        icon={AlertTriangle}
                        label="Мало на складе (≤5)"
                        value={lowStockCount === null ? '...' : String(lowStockCount)}
                        sub="Требуют внимания"
                        href="/admin/stock-alerts"
                        color="text-amber-600 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-400"
                    />
                    <KpiCard
                        icon={Package}
                        label="Всего заказов"
                        value={String(stats.totalOrders)}
                        href="/admin/orders"
                        color="text-violet-600 bg-violet-50 dark:bg-violet-900/20 dark:text-violet-400"
                    />
                    <KpiCard
                        icon={Users}
                        label="Новые клиенты за 7 дней / Всего"
                        value={`${newCustomers7d} / ${totalCustomers}`}
                        href="/admin/accounts"
                        color="text-pink-600 bg-pink-50 dark:bg-pink-900/20 dark:text-pink-400"
                    />
                </div>
            </div>

            {/* Quick navigation */}
            <div>
                <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">
                    Быстрый доступ
                </h2>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {NAV_SECTIONS.map((section) => {
                        const Icon = section.icon;
                        return (
                            <div
                                key={section.title}
                                className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900"
                            >
                                <div className="mb-3 flex items-center gap-2">
                                    <div
                                        className={`flex h-8 w-8 items-center justify-center rounded-lg ${section.color}`}
                                    >
                                        <Icon className="h-4 w-4" />
                                    </div>
                                    <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                                        {section.title}
                                    </span>
                                </div>
                                <ul className="space-y-1">
                                    {section.items.map((item) => (
                                        <li key={item.href}>
                                            <Link
                                                href={item.href}
                                                className="block rounded-md px-2 py-1.5 text-sm text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
                                            >
                                                {item.label}
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
