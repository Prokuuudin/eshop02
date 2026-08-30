'use client';
import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import type { Order } from '@/lib/orders-store';
import { useAdminStore, type OrderStatus } from '@/lib/admin-store';
import { Button } from '@/components/ui/button';
import { formatDate, formatEuro } from '@/lib/utils';
import { useTranslation } from '@/lib/use-translation';
import { getAdminAccessLevel } from '@/lib/auth';
import { useAuthStore } from '@/lib/auth-store';
import { hasAdminPermission } from '@/lib/admin-permissions';
import { formatOrderAddressLatvian } from '@/lib/order-address';
import { ArrowRight } from 'lucide-react';
import { getAdminDashboardCards, type AdminDashboardCard } from './admin-dashboard-cards';
import ContactRequestsPanel, { type UnansweredContactMessage } from './ContactRequestsPanel';
import RevenueBarChart from './RevenueBarChart';

export default function AdminPage(): React.ReactElement {
    const { t, language } = useTranslation();
    const [dashboardTimestamp] = useState(Date.now);
    const { getOrderStatus, setOrderStatus, loadOrderMeta, cardOrder, setCardOrder, resetCardOrder } = useAdminStore();
    const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
    const [editMode, setEditMode] = useState(false);
    const dragId = useRef<string | null>(null);
    const [dragOverId, setDragOverId] = useState<string | null>(null);

    const locale = language === 'ru' ? 'ru-RU' : language === 'lv' ? 'lv-LV' : 'en-US';
    const l = (ru: string, en: string, lv: string) => (language === 'ru' ? ru : language === 'lv' ? lv : en);
    const tl = (key: string, ru: string, en: string, lv: string) => t(key, l(ru, en, lv));

    const [chartPeriod, setChartPeriod] = useState<'7d' | '30d' | '90d'>('30d');

    // Aggregate stat tiles + revenue chart are fetched from a dedicated,
    // server-aggregated endpoint instead of being reduced from the full
    // `orders` client store — that store can hold thousands of order rows,
    // which made these four tiles take as long to appear as the full order
    // history sync.
    const [stats, setStats] = useState<{
        orderCount: number;
        revenue: number;
        avgOrderValue: number;
        itemsSold: number;
        statusCounts: Record<OrderStatus, number>;
        chart: { date: string; revenue: number; orderCount: number }[];
    } | null>(null);

    useEffect(() => {
        const days = chartPeriod === '7d' ? 7 : chartPeriod === '30d' ? 30 : 90;
        const controller = new AbortController();
        fetch(`/api/admin/orders/stats?days=${days}`, { signal: controller.signal })
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => {
                if (data) setStats(data);
            })
            .catch(() => {
                /* aborted or offline - tiles just keep showing a loading state */
            });
        return () => controller.abort();
    }, [chartPeriod]);

    const revenueByDay = (stats?.chart ?? []).map((d) => ({
        label: `${d.date.slice(8, 10)}.${d.date.slice(5, 7)}`,
        value: d.revenue,
    }));
    const chartPeriodRevenue = (stats?.chart ?? []).reduce((s, d) => s + d.revenue, 0);
    const chartPeriodOrderCount = (stats?.chart ?? []).reduce((s, d) => s + d.orderCount, 0);

    // Recent-orders widget: fetches only the latest handful of orders directly
    // (same endpoint /admin/orders itself uses) instead of depending on the
    // full, thousands-of-rows client order sync - that sync can take a long
    // time to complete and this widget only ever showed the most recent items
    // in a scrollable list anyway.
    const RECENT_ORDERS_LIMIT = 10;
    const [recentOrders, setRecentOrders] = useState<Order[] | null>(null);
    const [contactRequests, setContactRequests] = useState<UnansweredContactMessage[] | null>(null);
    const [contactRequestTotal, setContactRequestTotal] = useState(0);
    const [answeringRequestId, setAnsweringRequestId] = useState<string | null>(null);

    useEffect(() => {
        const controller = new AbortController();
        fetch(`/api/admin/orders?take=${RECENT_ORDERS_LIMIT}&skip=0`, { signal: controller.signal })
            .then((res) => (res.ok ? res.json() : null))
            .then((data: { orders?: Order[] } | null) => {
                if (!data?.orders) return;
                const parsed = data.orders.map((o) => ({ ...o, createdAt: new Date(o.createdAt) }));
                setRecentOrders(parsed);
                void loadOrderMeta(parsed.map((o) => o.id));
            })
            .catch(() => {
                /* aborted or offline - widget just keeps showing a loading state */
            });
        return () => controller.abort();
    }, [loadOrderMeta]);

    useEffect(() => {
        const controller = new AbortController();
        fetch('/api/admin/contact-messages?limit=5', {
            cache: 'no-store',
            signal: controller.signal,
        })
            .then((res) => (res.ok ? res.json() : null))
            .then((data: { messages?: UnansweredContactMessage[]; total?: number } | null) => {
                if (!data) return;
                setContactRequests(data.messages ?? []);
                setContactRequestTotal(data.total ?? 0);
            })
            .catch(() => {
                /* aborted or offline - widget keeps its loading state */
            });
        return () => controller.abort();
    }, []);

    const markContactRequestAnswered = async (id: string) => {
        setAnsweringRequestId(id);
        try {
            const response = await fetch('/api/admin/contact-messages', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id }),
            });
            if (!response.ok) return;
            setContactRequests((current) => current?.filter((request) => request.id !== id) ?? []);
            setContactRequestTotal((current) => Math.max(0, current - 1));
        } finally {
            setAnsweringRequestId(null);
        }
    };

    const statusColors: Record<OrderStatus, string> = {
        pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200',
        confirmed: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200',
        shipped: 'bg-primary/10 text-primary dark:bg-primary/15 dark:text-primary/60',
        delivered: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200',
        cancelled: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200',
    };

    const statusLabels: Record<OrderStatus, string> = {
        pending: t('order.status.pending'),
        confirmed: t('order.status.confirmed'),
        shipped: t('order.status.shipped'),
        delivered: t('order.status.delivered'),
        cancelled: t('order.status.cancelled'),
    };

    const currentUser = useAuthStore((s) => s.user);
    const hasFullAccess = getAdminAccessLevel(currentUser) === 'admin';

    const allCards = getAdminDashboardCards({ t, l, tl });
    const visibleCards = allCards.filter((card) => {
        if (card.id === 'orders') return hasAdminPermission(currentUser, 'orders.read');
        if (card.id === 'rfq') return hasAdminPermission(currentUser, 'rfq.read');
        return !card.adminOnly || hasFullAccess;
    });
    const defaultOrder = visibleCards.map((c) => c.id);
    const orderedIds = cardOrder ?? defaultOrder;
    const sortedCards = [...(orderedIds.map((id) => visibleCards.find((c) => c.id === id)).filter(Boolean) as AdminDashboardCard[]), ...visibleCards.filter((c) => !orderedIds.includes(c.id))];

    const handleDragStart = (id: string) => {
        dragId.current = id;
    };
    const handleDragOver = (e: React.DragEvent, id: string) => {
        e.preventDefault();
        if (dragId.current !== id) setDragOverId(id);
    };
    const handleDrop = (e: React.DragEvent, targetId: string) => {
        e.preventDefault();
        const sourceId = dragId.current;
        if (!sourceId || sourceId === targetId) {
            setDragOverId(null);
            return;
        }
        const ids = sortedCards.map((c) => c.id);
        const from = ids.indexOf(sourceId);
        const to = ids.indexOf(targetId);
        const next = [...ids];
        next.splice(from, 1);
        next.splice(to, 0, sourceId);
        setCardOrder(next);
        dragId.current = null;
        setDragOverId(null);
    };
    const handleDragEnd = () => {
        dragId.current = null;
        setDragOverId(null);
    };

    return (
        <main className="w-full py-4 text-foreground">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-foreground">{t('admin.dashboard')}</h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                        {hasFullAccess
                            ? tl('admin.dashboard.accessFull', 'Полный доступ администратора', 'Full administrator access', 'Pilna administratora piekluve')
                            : tl('admin.dashboard.accessPartial', 'Частичный доступ менеджера', 'Partial manager access', 'Daleja menedzera piekluve')}
                    </p>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                    <Link href="/account" className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700">
                        {l('На дашборд', 'Go to dashboard', 'Uz informacijas paneli')}
                        <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                    {hasFullAccess && (
                        <>
                            {editMode && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                        resetCardOrder();
                                        setEditMode(false);
                                    }}
                                >
                                    {l('Сбросить порядок', 'Reset order', 'Atiestatit kartibu')}
                                </Button>
                            )}
                            <Button variant={editMode ? 'default' : 'outline'} size="sm" onClick={() => setEditMode((v) => !v)}>
                                {editMode ? l('Готово', 'Done', 'Gatavs') : l('Настроить панель', 'Customize panel', 'Pielaqot paneli')}
                            </Button>
                        </>
                    )}
                </div>
            </div>

            {editMode && (
                <p className="hidden sm:block mb-4 text-sm text-muted-foreground">
                    {l(
                        'Перетащите плашки в нужном порядке. Нажмите «Готово» когда закончите.',
                        'Drag the cards into the desired order. Click "Done" when finished.',
                        'Velciet kartes vajadzigaja kartiba. Nokliksiniet "Gatavs", kad esat pabeidzis.'
                    )}
                </p>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
                {sortedCards.map((card) => {
                    const isOver = dragOverId === card.id;
                    const cardClassName = [
                        'group flex flex-col rounded-xl border border-border border-l-4 p-5 shadow-sm transition-all',
                        card.bg,
                        card.border,
                        editMode ? 'cursor-grab active:cursor-grabbing select-none' : 'hover:shadow-md hover:border-gray-300 dark:hover:border-gray-600',
                        isOver ? 'ring-2 ring-primary ring-offset-1 scale-[1.02]' : '',
                    ].join(' ');
                    const cardContent = (
                        <>
                            <div className="flex items-start justify-between gap-2 mb-1">
                                <p className="text-base font-semibold text-foreground">{card.title}</p>
                                {editMode && <span className="text-muted-foreground mt-0.5 shrink-0 text-lg leading-none">⠿</span>}
                            </div>
                            <p className="text-sm text-muted-foreground mb-4 leading-snug">{card.description}</p>
                            {!editMode && <span className="mt-auto text-sm font-medium text-primary group-hover:underline">{card.linkText} →</span>}
                        </>
                    );

                    if (editMode) {
                        return (
                            <div key={card.id} draggable onDragStart={() => handleDragStart(card.id)} onDragOver={(e) => handleDragOver(e, card.id)} onDrop={(e) => handleDrop(e, card.id)} onDragEnd={handleDragEnd} className={cardClassName}>
                                {cardContent}
                            </div>
                        );
                    }

                    return (
                        <Link key={card.id} href={card.href} className={cardClassName}>
                            {cardContent}
                        </Link>
                    );
                })}
            </div>

            {!hasFullAccess && (
                <div className="mb-8 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-200">
                    {tl(
                        'admin.dashboard.managerNotice',
                        'Для роли менеджера доступны только заказы, статистика и RFQ. Разделы управления контентом и аккаунтами доступны администратору.',
                        'Managers can access only orders, statistics, and RFQ. Content and account management sections are available to administrators.',
                        'Vadītājiem ir pieejami tikai pasūtījumi, statistika un RFQ. Satura un kontu pārvaldības sadaļas ir pieejamas administratoriem.'
                    )}
                </div>
            )}

            {/* Statistics */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                <div className="group flex flex-col bg-card rounded-xl border border-border p-5 shadow-sm hover:shadow-md hover:border-gray-300 dark:hover:border-gray-600 transition-all">
                    <p className="text-muted-foreground text-sm">📦 {t('admin.stats.totalOrders')}</p>
                    <p className="text-3xl font-bold mt-2 text-foreground">{stats ? stats.orderCount : '—'}</p>
                </div>
                <div className="group flex flex-col bg-card rounded-xl border border-border p-5 shadow-sm hover:shadow-md hover:border-gray-300 dark:hover:border-gray-600 transition-all">
                    <p className="text-muted-foreground text-sm">💰 {t('admin.stats.totalRevenue')}</p>
                    <p className="text-3xl font-bold mt-2 text-foreground">{stats ? formatEuro(stats.revenue, locale) : '—'}</p>
                </div>
                <div className="group flex flex-col bg-card rounded-xl border border-border p-5 shadow-sm hover:shadow-md hover:border-gray-300 dark:hover:border-gray-600 transition-all">
                    <p className="text-muted-foreground text-sm">💵 {t('admin.stats.averageOrder')}</p>
                    <p className="text-3xl font-bold mt-2 text-foreground">{stats ? formatEuro(stats.avgOrderValue, locale) : '—'}</p>
                </div>
                <div className="group flex flex-col bg-card rounded-xl border border-border p-5 shadow-sm hover:shadow-md hover:border-gray-300 dark:hover:border-gray-600 transition-all">
                    <p className="text-muted-foreground text-sm">📋 {t('admin.stats.itemsSold')}</p>
                    <p className="text-3xl font-bold mt-2 text-foreground">{stats ? stats.itemsSold : '—'}</p>
                </div>
            </div>

            {/* Pending orders alert */}
            {(() => {
                const pendingCount = stats?.statusCounts.pending ?? 0;
                const confirmedCount = stats?.statusCounts.confirmed ?? 0;
                const total = pendingCount + confirmedCount;
                if (total === 0) return null;
                return (
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-5 py-3">
                        <div className="flex items-center gap-3">
                            <span className="text-2xl font-bold text-amber-700 dark:text-amber-300">{total}</span>
                            <div>
                                <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                                    {l(
                                        total === 1 ? 'необработанный заказ' : total < 5 ? 'необработанных заказа' : 'необработанных заказов',
                                        total === 1 ? 'unprocessed order' : 'unprocessed orders',
                                        total === 1 ? 'neapstradats pasutijums' : 'neapstradati pasutijumi'
                                    )}
                                </p>
                                <p className="text-xs text-amber-600 dark:text-amber-400">
                                    {pendingCount > 0 && `${l('Новых', 'New', 'Jauni')}: ${pendingCount}`}
                                    {pendingCount > 0 && confirmedCount > 0 && ' · '}
                                    {confirmedCount > 0 && `${l('Подтверждённых', 'Confirmed', 'Apstiprinati')}: ${confirmedCount}`}
                                </p>
                            </div>
                        </div>
                        <Link href="/admin/orders?status=pending">
                            <Button size="sm" className="bg-amber-600 hover:bg-amber-700 text-white">
                                {l('Обработать →', 'Process →', 'Apstradat →')}
                            </Button>
                        </Link>
                    </div>
                );
            })()}

            <ContactRequestsPanel
                requests={contactRequests}
                total={contactRequestTotal}
                answeringId={answeringRequestId}
                timestamp={dashboardTimestamp}
                locale={locale}
                l={l}
                onMarkAnswered={markContactRequestAnswered}
            />

            {/* Revenue Chart */}
            <div className="hidden sm:block bg-card rounded-lg border border-border p-6 mb-8">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                    <div>
                        <h2 className="text-lg font-semibold text-foreground">{l('Выручка', 'Revenue', 'Ienemumi')}</h2>
                        <p className="text-sm text-muted-foreground mt-0.5">
                            {l('За период', 'Period total', 'Perioda kopā')}: <span className="font-medium text-foreground">{formatEuro(chartPeriodRevenue, locale)}</span> · {chartPeriodOrderCount} {l('заказов', 'orders', 'pasūtījumu')}
                        </p>
                    </div>
                    <div className="flex gap-1">
                        {(['7d', '30d', '90d'] as const).map((p) => (
                            <button
                                key={p}
                                type="button"
                                onClick={() => setChartPeriod(p)}
                                className={['px-3 py-1 text-sm rounded-md transition-colors', chartPeriod === p ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-gray-200 dark:hover:bg-gray-700'].join(' ')}
                            >
                                {p === '7d' ? l('7 дней', '7 days', '7 dienas') : p === '30d' ? l('30 дней', '30 days', '30 dienas') : l('90 дней', '90 days', '90 dienas')}
                            </button>
                        ))}
                    </div>
                </div>
                {revenueByDay.length > 0 ? (
                    <RevenueBarChart data={revenueByDay} locale={locale} />
                ) : (
                    <div className="h-40 flex items-center justify-center text-sm text-muted-foreground">{l('Нет заказов за выбранный период', 'No orders for selected period', 'Nav pasūtījumu izvēlētajam periodam')}</div>
                )}
            </div>

            {/* Orders Section */}
            <div className="bg-card rounded-lg border border-border p-6">
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-2xl font-bold text-foreground">{l('Последние заказы', 'Recent orders', 'Jaunakie pasutijumi')}</h2>
                    <Link href="/admin/orders" className="text-sm font-medium text-primary hover:underline">
                        {l('Все заказы →', 'All orders →', 'Visi pasutijumi →')}
                    </Link>
                </div>
                {recentOrders === null ? (
                    <p className="text-muted-foreground text-center py-8">{t('common.loading')}</p>
                ) : recentOrders.length > 0 ? (
                    <div className="space-y-3">
                        {recentOrders.map((order) => {
                            const status = getOrderStatus(order.id);
                            const isExpanded = expandedOrder === order.id;
                            return (
                                <div key={order.id} className="border border-border rounded-lg p-4">
                                    <button type="button" onClick={() => setExpandedOrder(isExpanded ? null : order.id)} aria-expanded={isExpanded} className="w-full text-left cursor-pointer flex justify-between items-start">
                                        <div className="flex-1">
                                            <p className="font-mono text-sm text-muted-foreground">{order.id}</p>
                                            <div className="flex gap-3 mt-2 text-sm">
                                                <span>
                                                    👤 {order.firstName} {order.lastName}
                                                </span>
                                                <span>📧 {order.email}</span>
                                                <span>💰 {formatEuro(order.total, locale)}</span>
                                            </div>
                                        </div>
                                        <div className={`px-3 py-1 rounded text-sm font-medium ${statusColors[status]}`}>{statusLabels[status]}</div>
                                    </button>
                                    {isExpanded && (
                                        <div className="mt-4 pt-4 border-t border-border">
                                            <div className="grid grid-cols-2 gap-4 mb-4">
                                                <div>
                                                    <p className="text-sm text-muted-foreground">{t('admin.deliveryAddress')}</p>
                                                    <p className="text-sm mt-1">{formatOrderAddressLatvian(order)}</p>
                                                </div>
                                                <div>
                                                    <p className="text-sm text-muted-foreground">{t('checkout.delivery.method')}</p>
                                                    <p className="text-sm mt-1">
                                                        {order.deliveryMethod === 'courier' ? t('checkout.delivery.courier') : order.deliveryMethod === 'pickup' ? t('checkout.delivery.pickup') : t('checkout.delivery.post')}
                                                    </p>
                                                </div>
                                                <div>
                                                    <p className="text-sm text-muted-foreground">{t('checkout.payment.title')}</p>
                                                    <p className="text-sm mt-1">{order.paymentMethod}</p>
                                                </div>
                                                <div>
                                                    <p className="text-sm text-muted-foreground">{t('admin.date')}</p>
                                                    <p className="text-sm mt-1">{formatDate(order.createdAt, locale)}</p>
                                                </div>
                                            </div>
                                            <div className="mb-4">
                                                <p className="text-base font-semibold text-foreground mb-1">{t('admin.products')}</p>
                                                <div className="bg-muted rounded p-2 text-sm space-y-1">
                                                    {order.items.map((item) => (
                                                        <p key={item.id}>
                                                            {item.title} × {item.quantity} = {formatEuro(item.price * item.quantity, locale)}
                                                        </p>
                                                    ))}
                                                </div>
                                            </div>
                                            <div className="flex gap-2 flex-wrap">
                                                {(['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'] as const).map((s) => (
                                                    <Button key={s} onClick={() => setOrderStatus(order.id, s)} variant={status === s ? 'default' : 'outline'} size="sm" className={status === s ? 'bg-primary' : ''}>
                                                        {statusLabels[s]}
                                                    </Button>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <p className="text-muted-foreground text-center py-8">{t('admin.noOrders')}</p>
                )}
            </div>
        </main>
    );
}
