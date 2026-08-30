'use client';

import { useEffect, useState } from 'react';
import { useAdminLocale } from '@/lib/use-admin-locale';
import {
    EMPTY_ANALYTICS, getSegmentDescription, getSegmentLabel,
    type BroadcastResult, type CustomerRow, type CustomerSort, type FilterTab,
    type Segment, type SegmentAnalytics,
} from './segment-model';

function useCustomerSegmentsPageState() {
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


    return {
        locale,
        l,
        segmentLabel,
        segmentDescription,
        sampleVars,
        unsubscribeText,
        customers,
        setCustomers,
        loading,
        setLoading,
        fetchError,
        setFetchError,
        total,
        setTotal,
        page,
        setPage,
        totalPages,
        setTotalPages,
        counts,
        setCounts,
        analytics,
        setAnalytics,
        debouncedSearch,
        setDebouncedSearch,
        sort,
        setSort,
        direction,
        setDirection,
        activeTab,
        setActiveTab,
        search,
        setSearch,
        showBroadcast,
        setShowBroadcast,
        bSubject,
        setBSubject,
        bBody,
        setBBody,
        bTab,
        setBTab,
        bSending,
        setBSending,
        bResult,
        setBResult,
        changeSort,
        sortMark,
        broadcastRecipientCount,
        tabs,
        sendBroadcast,
        sendButtonLabel,
        canSend,
    };
}

export function useCustomerSegmentsPage(): ReturnType<typeof useCustomerSegmentsPageState> {
    return useCustomerSegmentsPageState();
}

