'use client';

import Link from 'next/link';
import AdminGate from '@/components/admin/AdminGate';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SEGMENT_CARD_COLORS, SEGMENT_COLORS, segmentReason, type Segment } from './segment-model';
import { useCustomerSegmentsPage } from './useCustomerSegmentsPage';
import { SegmentBroadcastPanel } from './SegmentBroadcastPanel';
import StickyTableHead from '@/components/admin/StickyTableHead';

export default function AdminCustomerSegmentsPage(): React.ReactElement {
    const segmentsState = useCustomerSegmentsPage();
    const {
        locale,
        l,
        segmentLabel,
        segmentDescription,
        customers,
        loading,
        fetchError,
        total,
        page,
        setPage,
        totalPages,
        counts,
        analytics,
        activeTab,
        setActiveTab,
        search,
        setSearch,
        setBResult,
        changeSort,
        sortMark,
        tabs,
    } = segmentsState;

    return (
        <AdminGate>
            <main className="w-full py-4 space-y-6">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                    <h1 className="text-2xl font-bold text-foreground">
                        {l(
                            'Сегменты и статусы клиентов',
                            'Customer segments and statuses',
                            'Klientu segmenti un statusi'
                        )}
                    </h1>
                    <Button variant="outline" asChild>
                        <Link href="/admin">
                            ← {l('Назад в админку', 'Back to admin', 'Atpakaļ uz administrāciju')}
                        </Link>
                    </Button>
                </div>

                {/* Loading / error states */}
                {loading && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {[0, 1, 2, 3].map((i) => (
                            <div key={i} className="rounded-lg border p-4 bg-muted animate-pulse">
                                <div className="h-8 w-12 bg-muted rounded mb-2" />
                                <div className="h-4 w-20 bg-muted rounded" />
                            </div>
                        ))}
                    </div>
                )}

                {!loading && fetchError && (
                    <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20 px-4 py-3">
                        <p className="text-sm text-red-700 dark:text-red-400">
                            {l(
                                'Ошибка загрузки данных:',
                                'Data loading error:',
                                'Datu ielādes kļūda:'
                            )}{' '}
                            {fetchError}
                        </p>
                    </div>
                )}

                {!loading && !fetchError && (
                    <>
                        {/* Summary cards */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            {(['vip', 'regular', 'new', 'inactive'] as Segment[]).map((seg) => (
                                <div
                                    key={seg}
                                    className={`rounded-lg border p-4 ${SEGMENT_CARD_COLORS[seg]}`}
                                >
                                    <div className="flex items-baseline justify-between gap-2">
                                        <div className="text-2xl font-bold text-foreground">
                                            {counts[seg]}
                                        </div>
                                        {(() => {
                                            const delta =
                                                counts[seg] - analytics.previousCounts[seg];
                                            return (
                                                <span
                                                    className={`text-xs font-medium ${
                                                        delta > 0
                                                            ? 'text-green-700 dark:text-green-400'
                                                            : delta < 0
                                                            ? 'text-red-600 dark:text-red-400'
                                                            : 'text-muted-foreground'
                                                    }`}
                                                    title={l(
                                                        `Изменение за ${analytics.comparisonDays} дней`,
                                                        `Change over ${analytics.comparisonDays} days`,
                                                        `Izmaiņas ${analytics.comparisonDays} dienās`
                                                    )}
                                                >
                                                    {delta > 0 ? '+' : ''}
                                                    {delta}{' '}
                                                    {l('за 30 дней', 'in 30 days', '30 dienās')}
                                                </span>
                                            );
                                        })()}
                                    </div>
                                    <div className="text-sm font-medium text-foreground mt-0.5">
                                        {segmentLabel(seg)}
                                    </div>
                                    <div className="text-xs text-muted-foreground mt-0.5">
                                        {segmentDescription(seg)}
                                    </div>
                                    <div className="text-xs text-foreground/80 mt-2">
                                        {l('Выручка:', 'Revenue:', 'Ieņēmumi:')} €
                                        {analytics.revenue[seg].toLocaleString(locale, {
                                            minimumFractionDigits: 2,
                                            maximumFractionDigits: 2,
                                        })}
                                    </div>
                                    {seg === 'vip' && (
                                        <div className="text-xs text-muted-foreground mt-0.5">
                                            {l('Новых VIP:', 'New VIP:', 'Jauni VIP:')}{' '}
                                            {analytics.becameVip}
                                        </div>
                                    )}
                                    {seg === 'inactive' && (
                                        <div className="text-xs text-muted-foreground mt-0.5">
                                            {l(
                                                'Стали неактивными:',
                                                'Became inactive:',
                                                'Kļuva neaktīvi:'
                                            )}{' '}
                                            {analytics.becameInactive}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>

                        {/* Filters */}
                        <div className="flex flex-col sm:flex-row gap-3">
                            <div className="flex gap-1 flex-wrap">
                                {tabs.map((tab) => (
                                    <button
                                        key={tab}
                                        onClick={() => {
                                            setActiveTab(tab);
                                            setPage(1);
                                            setBResult(null);
                                        }}
                                        className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${
                                            activeTab === tab
                                                ? 'bg-primary text-primary-foreground border-primary'
                                                : 'bg-card text-gray-700 dark:text-gray-300 border-border hover:bg-gray-50 dark:hover:bg-gray-800'
                                        }`}
                                    >
                                        {segmentLabel(tab)}
                                        {tab !== 'all' && (
                                            <span className="ml-1 opacity-70">({counts[tab]})</span>
                                        )}
                                    </button>
                                ))}
                            </div>
                            <Input
                                placeholder={l(
                                    'Поиск по email…',
                                    'Search by email…',
                                    'Meklēt pēc e-pasta…'
                                )}
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="max-w-xs"
                            />
                        </div>

                        <SegmentBroadcastPanel state={segmentsState} />

                        {/* Table */}
                        {Object.values(counts).every((value) => value === 0) ? (
                            <div className="text-center text-muted-foreground py-16 border rounded-lg">
                                {l(
                                    'Нет данных о заказах. Клиенты появятся после первых заказов.',
                                    'There is no order data yet. Customers will appear after the first orders.',
                                    'Pasūtījumu datu vēl nav. Klienti parādīsies pēc pirmajiem pasūtījumiem.'
                                )}
                            </div>
                        ) : customers.length === 0 ? (
                            <div className="text-center text-muted-foreground py-16 border rounded-lg">
                                {l(
                                    'Клиенты не найдены по заданным фильтрам.',
                                    'No customers match the selected filters.',
                                    'Atlasītajiem filtriem neatbilst neviens klients.'
                                )}
                            </div>
                        ) : (
                            <div className="overflow-x-auto rounded-lg border border-border lg:overflow-visible">
                                <table className="min-w-full text-sm">
                                    <StickyTableHead>
                                        <tr>
                                            <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                                                <button
                                                    type="button"
                                                    onClick={() => changeSort('email')}
                                                    className="hover:text-foreground"
                                                >
                                                    Email{sortMark('email')}
                                                </button>
                                            </th>
                                            <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                                                {l('Имя', 'Name', 'Vārds')}
                                            </th>
                                            <th className="text-right px-4 py-3 font-medium text-muted-foreground">
                                                <button
                                                    type="button"
                                                    onClick={() => changeSort('totalOrders')}
                                                    className="hover:text-foreground"
                                                >
                                                    {l('Заказов', 'Orders', 'Pasūtījumi')}
                                                    {sortMark('totalOrders')}
                                                </button>
                                            </th>
                                            <th className="text-right px-4 py-3 font-medium text-muted-foreground">
                                                <button
                                                    type="button"
                                                    onClick={() => changeSort('totalSpent')}
                                                    className="hover:text-foreground"
                                                >
                                                    {l('Потрачено', 'Spent', 'Iztērēts')}
                                                    {sortMark('totalSpent')}
                                                </button>
                                            </th>
                                            <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                                                <button
                                                    type="button"
                                                    onClick={() => changeSort('lastOrderDate')}
                                                    className="hover:text-foreground"
                                                >
                                                    {l(
                                                        'Последний заказ',
                                                        'Last order',
                                                        'Pēdējais pasūtījums'
                                                    )}
                                                    {sortMark('lastOrderDate')}
                                                </button>
                                            </th>
                                            <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                                                {l('Сегмент', 'Segment', 'Segments')}
                                            </th>
                                            <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                                                {l('Причина', 'Reason', 'Iemesls')}
                                            </th>
                                            <th className="px-4 py-3"></th>
                                        </tr>
                                    </StickyTableHead>
                                    <tbody className="divide-y divide-border">
                                        {customers.map((c) => (
                                            <tr
                                                key={c.email}
                                                className="hover:bg-gray-50 dark:hover:bg-gray-800/50"
                                            >
                                                <td className="px-4 py-3 text-foreground">
                                                    <Link
                                                        href={`/admin/customers/profile?email=${encodeURIComponent(
                                                            c.email
                                                        )}`}
                                                        className="hover:text-primary dark:hover:text-primary/80 hover:underline"
                                                    >
                                                        {c.email}
                                                    </Link>
                                                </td>
                                                <td className="px-4 py-3 text-foreground">
                                                    {c.firstName} {c.lastName}
                                                </td>
                                                <td className="px-4 py-3 text-right text-foreground">
                                                    {c.totalOrders}
                                                </td>
                                                <td className="px-4 py-3 text-right text-foreground">
                                                    €{c.totalSpent.toFixed(2)}
                                                </td>
                                                <td className="px-4 py-3 text-muted-foreground">
                                                    {c.lastOrderDate
                                                        ? new Date(
                                                              c.lastOrderDate
                                                          ).toLocaleDateString(locale)
                                                        : '—'}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span
                                                        className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                                                            SEGMENT_COLORS[c.segment]
                                                        }`}
                                                    >
                                                        {segmentLabel(c.segment)}
                                                    </span>
                                                </td>
                                                <td
                                                    className="px-4 py-3 text-xs text-muted-foreground max-w-[240px]"
                                                    title={segmentReason(c, l)}
                                                >
                                                    {segmentReason(c, l)}
                                                </td>
                                                <td className="px-4 py-3 text-right">
                                                    <div className="flex items-center justify-end gap-3 whitespace-nowrap">
                                                        <a
                                                            href={`/api/admin/customers/export?email=${encodeURIComponent(
                                                                c.email
                                                            )}`}
                                                            download
                                                            className="text-xs text-muted-foreground hover:text-primary hover:underline"
                                                        >
                                                            PDF
                                                        </a>
                                                        <Link
                                                            href={`/admin/customers/profile?email=${encodeURIComponent(
                                                                c.email
                                                            )}`}
                                                            className="text-xs text-primary hover:underline"
                                                        >
                                                            {l('Профиль', 'Profile', 'Profils')} →
                                                        </Link>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {total > 0 && (
                            <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
                                <span>
                                    {l('Показано', 'Showing', 'Parādīti')} {(page - 1) * 50 + 1}–
                                    {Math.min(page * 50, total)} {l('из', 'of', 'no')} {total}
                                </span>
                                <div className="flex items-center gap-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setPage((value) => Math.max(1, value - 1))}
                                        disabled={page <= 1 || loading}
                                    >
                                        ← {l('Назад', 'Back', 'Atpakaļ')}
                                    </Button>
                                    <span>
                                        {l('Страница', 'Page', 'Lapa')} {page} {l('из', 'of', 'no')}{' '}
                                        {totalPages}
                                    </span>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() =>
                                            setPage((value) => Math.min(totalPages, value + 1))
                                        }
                                        disabled={page >= totalPages || loading}
                                    >
                                        {l('Вперёд', 'Next', 'Tālāk')} →
                                    </Button>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </main>
        </AdminGate>
    );
}
