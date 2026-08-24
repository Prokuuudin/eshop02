'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import AdminGate from '@/components/admin/AdminGate';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import ConfirmActionDialog from '@/components/ConfirmActionDialog';
import { useAdminLocale } from '@/lib/use-admin-locale';
import {
    EMPTY_ANALYTICS,
    SEGMENT_CARD_COLORS,
    SEGMENT_COLORS,
    getSegmentDescription,
    getSegmentLabel,
    renderPreview,
    segmentReason,
    type BroadcastResult,
    type CustomerRow,
    type CustomerSort,
    type FilterTab,
    type Segment,
    type SegmentAnalytics,
} from './segment-model';

export default function AdminCustomerSegmentsPage(): React.ReactElement {
    const { locale, l } = useAdminLocale();
    const segmentLabel = (segment: Segment | 'all') => getSegmentLabel(segment, l);
    const segmentDescription = (segment: Segment) => getSegmentDescription(segment, l);
    const sampleVars = {
        first_name: l('Иван', 'John', 'Jānis'),
        last_name: l('Петров', 'Smith', 'Bērziņš'),
        email: 'customer@example.com',
    };
    const unsubscribeText = l(
        'Чтобы отписаться от рассылки, ответьте на это письмо с пометкой «Отписаться».',
        'To unsubscribe, reply to this email with “Unsubscribe”.',
        'Lai atteiktos no jaunumiem, atbildiet uz šo e-pastu ar norādi “Atteikt”.'
    );
    const [customers, setCustomers] = useState<CustomerRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [fetchError, setFetchError] = useState<string | null>(null);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [counts, setCounts] = useState<Record<Segment, number>>({
        vip: 0,
        regular: 0,
        new: 0,
        inactive: 0,
    });
    const [analytics, setAnalytics] = useState<SegmentAnalytics>(EMPTY_ANALYTICS);
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [sort, setSort] = useState<CustomerSort>('lastOrderDate');
    const [direction, setDirection] = useState<'asc' | 'desc'>('desc');

    const [activeTab, setActiveTab] = useState<FilterTab>('all');
    const [search, setSearch] = useState('');

    // Broadcast state
    const [showBroadcast, setShowBroadcast] = useState(false);
    const [bSubject, setBSubject] = useState('');
    const [bBody, setBBody] = useState('');
    const [bTab, setBTab] = useState<'edit' | 'preview'>('edit');
    const [bSending, setBSending] = useState(false);
    const [bResult, setBResult] = useState<BroadcastResult | null>(null);

    useEffect(() => {
        const timeout = window.setTimeout(() => {
            setDebouncedSearch(search.trim());
            setPage(1);
        }, 300);
        return () => window.clearTimeout(timeout);
    }, [search]);

    useEffect(() => {
        let cancelled = false;
        queueMicrotask(() => {
            if (!cancelled) {
                setLoading(true);
                setFetchError(null);
            }
        });
        const params = new URLSearchParams({ page: String(page), pageSize: '50', sort, direction });
        if (activeTab !== 'all') params.set('segment', activeTab);
        if (debouncedSearch) params.set('search', debouncedSearch);
        fetch(`/api/admin/customers?${params}`)
            .then(async (res) => {
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data = (await res.json()) as {
                    customers: CustomerRow[];
                    total: number;
                    totalPages: number;
                    counts: Record<Segment, number>;
                    analytics: SegmentAnalytics;
                };
                if (cancelled) return;
                const rows: CustomerRow[] = data.customers;
                setCustomers(rows);
                setTotal(data.total);
                setTotalPages(data.totalPages);
                setCounts(data.counts);
                setAnalytics(data.analytics);
            })
            .catch((err: unknown) => {
                if (cancelled) return;
                setFetchError(
                    err instanceof Error
                        ? err.message
                        : l('Ошибка загрузки', 'Loading error', 'Ielādes kļūda')
                );
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [activeTab, debouncedSearch, page, sort, direction, l]);

    const changeSort = (nextSort: CustomerSort) => {
        setPage(1);
        if (sort === nextSort) setDirection((value) => (value === 'asc' ? 'desc' : 'asc'));
        else {
            setSort(nextSort);
            setDirection(nextSort === 'email' ? 'asc' : 'desc');
        }
    };

    const sortMark = (column: CustomerSort) =>
        sort === column ? (direction === 'asc' ? ' ↑' : ' ↓') : '';

    // Recipients for broadcast = current filter, no search constraint
    const broadcastRecipientCount =
        activeTab === 'all'
            ? Object.values(counts).reduce((sum, value) => sum + value, 0)
            : counts[activeTab];

    const tabs: FilterTab[] = ['all', 'vip', 'regular', 'new', 'inactive'];

    const sendBroadcast = async () => {
        if (!bSubject.trim() || !bBody.trim()) return;

        setBSending(true);
        setBResult(null);
        try {
            const res = await fetch('/api/admin/broadcast', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    audience: { segment: activeTab === 'all' ? undefined : activeTab },
                    subject: bSubject,
                    body: bBody,
                }),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = (await res.json()) as BroadcastResult;
            setBResult(data);
        } catch {
            setBResult({ sent: 0, failed: broadcastRecipientCount, failedEmails: [] });
        } finally {
            setBSending(false);
        }
    };

    const sendButtonLabel = bSending
        ? l(
              `Отправка (${broadcastRecipientCount} писем)...`,
              `Sending (${broadcastRecipientCount} emails)...`,
              `Sūta (${broadcastRecipientCount} e-pasti)...`
          )
        : l(
              `Отправить: ${broadcastRecipientCount}`,
              `Send to ${broadcastRecipientCount}`,
              `Nosūtīt: ${broadcastRecipientCount}`
          );

    const canSend =
        !bSending &&
        !!bSubject.trim() &&
        !!bBody.trim() &&
        broadcastRecipientCount > 0 &&
        broadcastRecipientCount <= 500;

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

                        {/* Broadcast panel */}
                        {Object.values(counts).some(Boolean) && (
                            <div className="rounded-xl border border-primary/30 dark:border-primary/40 bg-card">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowBroadcast((v) => !v);
                                        setBResult(null);
                                    }}
                                    className="w-full flex items-center justify-between px-5 py-3.5 text-left"
                                >
                                    <div className="flex items-center gap-3">
                                        <span className="text-sm font-semibold text-primary dark:text-primary">
                                            {l(
                                                'Рассылка по сегменту',
                                                'Segment broadcast',
                                                'Segmenta izsūtne'
                                            )}
                                        </span>
                                        <span className="rounded-full bg-primary/10 dark:bg-primary/40 px-2.5 py-0.5 text-xs font-medium text-primary dark:text-primary">
                                            {broadcastRecipientCount}{' '}
                                            {l('получателей', 'recipients', 'saņēmēji')}
                                            {activeTab !== 'all' && ` · ${segmentLabel(activeTab)}`}
                                        </span>
                                    </div>
                                    <span className="text-muted-foreground text-xs">
                                        {showBroadcast
                                            ? `▲ ${l('Свернуть', 'Collapse', 'Sakļaut')}`
                                            : `▼ ${l('Развернуть', 'Expand', 'Izvērst')}`}
                                    </span>
                                </button>

                                {showBroadcast && (
                                    <div className="border-t border-primary/10 dark:border-primary/40 px-5 py-4 space-y-4">
                                        {/* Recipients info */}
                                        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                                            <span>
                                                {l('Получатели:', 'Recipients:', 'Saņēmēji:')}{' '}
                                                <strong className="text-foreground">
                                                    {broadcastRecipientCount}
                                                </strong>
                                                {activeTab !== 'all' &&
                                                    ` · ${segmentLabel(activeTab)}`}
                                                {activeTab === 'all' &&
                                                    l(
                                                        ' (все клиенты)',
                                                        ' (all customers)',
                                                        ' (visi klienti)'
                                                    )}
                                            </span>
                                            <span className="text-muted-foreground">·</span>
                                            <span>
                                                {l('Переменные:', 'Variables:', 'Mainīgie:')}{' '}
                                                <code className="bg-muted px-1 rounded">
                                                    {'{first_name}'}
                                                </code>{' '}
                                                <code className="bg-muted px-1 rounded">
                                                    {'{last_name}'}
                                                </code>{' '}
                                                <code className="bg-muted px-1 rounded">
                                                    {'{email}'}
                                                </code>
                                            </span>
                                        </div>

                                        {/* Subject */}
                                        <div>
                                            <label
                                                htmlFor="broadcast-subject"
                                                className="block text-xs font-medium text-muted-foreground mb-1"
                                            >
                                                {l('Тема письма', 'Email subject', 'E-pasta tēma')}
                                            </label>
                                            <Input
                                                id="broadcast-subject"
                                                value={bSubject}
                                                onChange={(e) => setBSubject(e.target.value)}
                                                placeholder={l(
                                                    'Например: Привет, {first_name}! Специальное предложение для вас',
                                                    'For example: Hi, {first_name}! A special offer for you',
                                                    'Piemēram: Sveiki, {first_name}! Īpašs piedāvājums jums'
                                                )}
                                            />
                                        </div>

                                        {/* Body with edit/preview tabs */}
                                        <div>
                                            <div className="flex items-center justify-between mb-1">
                                                <label
                                                    htmlFor="broadcast-body"
                                                    className="text-xs font-medium text-muted-foreground"
                                                >
                                                    {l(
                                                        'Текст письма',
                                                        'Email body',
                                                        'E-pasta teksts'
                                                    )}
                                                </label>
                                                <div className="flex rounded-md border border-border overflow-hidden text-xs">
                                                    {(['edit', 'preview'] as const).map((t) => (
                                                        <button
                                                            key={t}
                                                            type="button"
                                                            onClick={() => setBTab(t)}
                                                            className={`px-3 py-1 transition-colors ${
                                                                bTab === t
                                                                    ? 'bg-primary text-primary-foreground'
                                                                    : 'text-muted-foreground hover:bg-gray-50 dark:hover:bg-gray-800'
                                                            }`}
                                                        >
                                                            {t === 'edit'
                                                                ? l(
                                                                      'Редактор',
                                                                      'Editor',
                                                                      'Redaktors'
                                                                  )
                                                                : l(
                                                                      'Предпросмотр',
                                                                      'Preview',
                                                                      'Priekšskatījums'
                                                                  )}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>

                                            {bTab === 'edit' ? (
                                                <Textarea
                                                    id="broadcast-body"
                                                    rows={7}
                                                    value={bBody}
                                                    onChange={(e) => setBBody(e.target.value)}
                                                    placeholder={l(
                                                        'Здравствуйте, {first_name}!\n\nПишем вам по поводу...',
                                                        'Hello, {first_name}!\n\nWe are writing to you about...',
                                                        'Sveiki, {first_name}!\n\nRakstām jums par...'
                                                    )}
                                                    className="w-full resize-none text-sm"
                                                />
                                            ) : (
                                                <div className="rounded-lg border border-border bg-muted p-4 min-h-[176px]">
                                                    {bBody ? (
                                                        <div className="space-y-1">
                                                            <p className="text-xs text-muted-foreground mb-3">
                                                                {l('Тема:', 'Subject:', 'Tēma:')}{' '}
                                                                <span className="text-foreground">
                                                                    {renderPreview(
                                                                        bSubject,
                                                                        sampleVars
                                                                    ) || '—'}
                                                                </span>
                                                            </p>
                                                            <div className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                                                                {renderPreview(bBody, sampleVars)}
                                                            </div>
                                                            <p className="text-xs text-muted-foreground mt-4 pt-3 border-t border-border">
                                                                {unsubscribeText}
                                                            </p>
                                                        </div>
                                                    ) : (
                                                        <p className="text-sm text-muted-foreground">
                                                            {l(
                                                                'Введите текст письма в редакторе',
                                                                'Enter the email text in the editor',
                                                                'Ievadiet e-pasta tekstu redaktorā'
                                                            )}
                                                        </p>
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        {/* Send button + confirm dialog + result */}
                                        <div className="flex flex-wrap items-center gap-3 pt-1">
                                            <ConfirmActionDialog
                                                title={l(
                                                    'Подтвердите рассылку',
                                                    'Confirm broadcast',
                                                    'Apstipriniet izsūtni'
                                                )}
                                                description={l(
                                                    `Отправить письмо ${broadcastRecipientCount} получателям? Это действие нельзя отменить.`,
                                                    `Send the email to ${broadcastRecipientCount} recipients? This cannot be undone.`,
                                                    `Nosūtīt e-pastu ${broadcastRecipientCount} saņēmējiem? Šo darbību nevar atsaukt.`
                                                )}
                                                confirmLabel={l('Отправить', 'Send', 'Nosūtīt')}
                                                cancelLabel={l('Отмена', 'Cancel', 'Atcelt')}
                                                onConfirm={() => void sendBroadcast()}
                                                trigger={
                                                    <Button
                                                        disabled={!canSend}
                                                        className="bg-primary hover:bg-primary/90 text-primary-foreground"
                                                    >
                                                        {sendButtonLabel}
                                                    </Button>
                                                }
                                            />
                                            {!bSubject.trim() || !bBody.trim() ? (
                                                <span className="text-xs text-muted-foreground">
                                                    {l(
                                                        'Заполните тему и текст',
                                                        'Enter a subject and message',
                                                        'Ievadiet tēmu un tekstu'
                                                    )}
                                                </span>
                                            ) : null}
                                            {broadcastRecipientCount > 500 && (
                                                <span className="text-xs text-amber-700 dark:text-amber-400">
                                                    {l(
                                                        'В одной рассылке допустимо не более 500 получателей. Выберите более узкий сегмент.',
                                                        'A broadcast can have at most 500 recipients. Select a narrower segment.',
                                                        'Vienā izsūtnē drīkst būt ne vairāk kā 500 saņēmēju. Izvēlieties šaurāku segmentu.'
                                                    )}
                                                </span>
                                            )}
                                        </div>

                                        {/* Result */}
                                        {bResult && (
                                            <div
                                                className={`rounded-lg border px-4 py-3 ${
                                                    bResult.failed === 0
                                                        ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20'
                                                        : 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20'
                                                }`}
                                            >
                                                <p className="text-sm font-medium text-foreground">
                                                    {l(
                                                        'Рассылка завершена:',
                                                        'Broadcast completed:',
                                                        'Izsūtne pabeigta:'
                                                    )}{' '}
                                                    <span className="text-green-700 dark:text-green-400">
                                                        {bResult.sent}{' '}
                                                        {l('отправлено', 'sent', 'nosūtīti')}
                                                    </span>
                                                    {bResult.failed > 0 && (
                                                        <span className="text-red-600 dark:text-red-400">
                                                            {' '}
                                                            · {bResult.failed}{' '}
                                                            {l('ошибок', 'failed', 'kļūdas')}
                                                        </span>
                                                    )}
                                                </p>
                                                {bResult.failedEmails.length > 0 && (
                                                    <p className="text-xs text-muted-foreground mt-1">
                                                        {l(
                                                            'Не доставлено:',
                                                            'Not delivered:',
                                                            'Nav piegādāts:'
                                                        )}{' '}
                                                        {bResult.failedEmails.join(', ')}
                                                    </p>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

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
                            <div className="overflow-x-auto rounded-lg border border-border">
                                <table className="min-w-full text-sm">
                                    <thead className="bg-muted">
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
                                    </thead>
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
