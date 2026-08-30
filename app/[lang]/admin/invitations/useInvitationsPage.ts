'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAdminLocale } from '@/lib/use-admin-locale';
import {
    HOLDER_STATUS_RANK,
    INVITATIONS_PAGE_SIZE as PAGE_SIZE,
    INVITE_BATCH_SIZE as INVITE_BATCH,
    type CampaignState,
    type EligibleSortKey,
    type EligibleUser,
    type Holder,
    type HolderSortKey,
    type SortDir,
} from './invitation-models';

function useInvitationsPageState() {
    const { l, locale } = useAdminLocale();

    const [holders, setHolders] = useState<Holder[]>([]);
    const [holdersTotal, setHoldersTotal] = useState(0);
    const [allHoldersCount, setAllHoldersCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState('');
    const [formError, setFormError] = useState('');
    const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [bulkBusy, setBulkBusy] = useState(false);
    const [bulkProgress, setBulkProgress] = useState<{ processed: number; total: number } | null>(null);
    const bulkStopRequested = useRef(false);
    const [holderSearch, setHolderSearch] = useState('');
    const [debouncedHolderSearch, setDebouncedHolderSearch] = useState('');
    const [holderSort, setHolderSort] = useState<{ key: HolderSortKey; dir: SortDir } | null>(null);
    const [holderPage, setHolderPage] = useState(0);
    const [segment, setSegment] = useState<'withCard' | 'withoutCard'>('withCard');

    useEffect(() => {
        const timer = window.setTimeout(() => setDebouncedHolderSearch(holderSearch.trim()), 300);
        return () => window.clearTimeout(timer);
    }, [holderSearch]);

    // Форма назначения карты
    const [cardEmail, setCardEmail] = useState('');
    const [cardNumber, setCardNumber] = useState('');
    const [cardBusy, setCardBusy] = useState(false);

    // Кампания сегмента B
    const [campaign, setCampaign] = useState<CampaignState | null>(null);
    const [totalEligible, setTotalEligible] = useState(0);
    const [eligibleFilteredTotal, setEligibleFilteredTotal] = useState(0);
    const [eligibleUsers, setEligibleUsers] = useState<EligibleUser[]>([]);
    const [eligibleLoading, setEligibleLoading] = useState(true);
    const [eligibleSearch, setEligibleSearch] = useState('');
    const [debouncedEligibleSearch, setDebouncedEligibleSearch] = useState('');
    const [eligibleSort, setEligibleSort] = useState<{ key: EligibleSortKey; dir: SortDir } | null>(null);
    const [eligiblePage, setEligiblePage] = useState(0);
    const [campaignRunning, setCampaignRunning] = useState(false);
    const stopRequested = useRef(false);

    useEffect(() => {
        const timer = window.setTimeout(() => setDebouncedEligibleSearch(eligibleSearch.trim()), 300);
        return () => window.clearTimeout(timer);
    }, [eligibleSearch]);

    const holderServerSortField: 'name' | 'email' | 'cardNumber' | null = holderSort && holderSort.key !== 'status' ? holderSort.key : null;
    const holderServerSortDir = holderSort && holderSort.key !== 'status' ? holderSort.dir : null;

    const holdersAbortRef = useRef<AbortController | null>(null);
    const loadHolders = useCallback(async () => {
        holdersAbortRef.current?.abort();
        const controller = new AbortController();
        holdersAbortRef.current = controller;
        setLoading(true);
        try {
            const params = new URLSearchParams({ take: String(PAGE_SIZE), skip: String(holderPage * PAGE_SIZE) });
            if (debouncedHolderSearch) params.set('search', debouncedHolderSearch);
            if (holderServerSortField) {
                params.set('sort', holderServerSortField);
                params.set('dir', holderServerSortDir ?? 'asc');
            }
            const res = await fetch(`/api/admin/invitations?${params}`, { signal: controller.signal });
            const json = await res.json();
            if (res.ok) {
                setHolders(json.holders ?? []);
                setHoldersTotal(json.total ?? 0);
                if (!debouncedHolderSearch) setAllHoldersCount(json.total ?? 0);
            }
        } catch (err) {
            if ((err as Error)?.name !== 'AbortError') throw err;
            return;
        } finally {
            // Отменённый (устаревший) запрос не должен гасить индикатор загрузки за более новый
            if (holdersAbortRef.current === controller) setLoading(false);
        }
    }, [debouncedHolderSearch, holderPage, holderServerSortField, holderServerSortDir]);

    const eligibleServerSortField: 'name' | 'email' | null = eligibleSort && eligibleSort.key !== 'status' ? eligibleSort.key : null;
    const eligibleServerSortDir = eligibleSort && eligibleSort.key !== 'status' ? eligibleSort.dir : null;

    const eligibleAbortRef = useRef<AbortController | null>(null);
    const loadCampaign = useCallback(async () => {
        eligibleAbortRef.current?.abort();
        const controller = new AbortController();
        eligibleAbortRef.current = controller;
        setEligibleLoading(true);
        try {
            const params = new URLSearchParams({ take: String(PAGE_SIZE), skip: String(eligiblePage * PAGE_SIZE) });
            if (debouncedEligibleSearch) params.set('search', debouncedEligibleSearch);
            if (eligibleServerSortField) {
                params.set('sort', eligibleServerSortField);
                params.set('dir', eligibleServerSortDir ?? 'asc');
            }
            const res = await fetch(`/api/admin/card-rules-campaign?${params}`, { signal: controller.signal });
            if (res.ok) {
                const json = await res.json();
                setCampaign(json.state);
                setTotalEligible(json.totalEligible ?? 0);
                setEligibleFilteredTotal(json.total ?? 0);
                setEligibleUsers(json.users ?? []);
            }
        } catch (err) {
            if ((err as Error)?.name !== 'AbortError') throw err;
            return;
        } finally {
            // Отменённый (устаревший) запрос не должен гасить индикатор загрузки за более новый
            if (eligibleAbortRef.current === controller) setEligibleLoading(false);
        }
    }, [debouncedEligibleSearch, eligiblePage, eligibleServerSortField, eligibleServerSortDir]);

    useEffect(() => {
        queueMicrotask(() => void loadHolders());
    }, [loadHolders]);

    useEffect(() => {
        queueMicrotask(() => void loadCampaign());
    }, [loadCampaign]);

    const sendInvites = async (userIds: string[]) => {
        setFormError('');
        setMessage('');
        // Письмо трёхъязычное (LV+RU+EN) — язык не передаём
        const res = await fetch('/api/admin/invitations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userIds }),
        });
        const json = await res.json();
        if (!res.ok) {
            setFormError(l('Не удалось отправить приглашения', 'Failed to send invitations', 'Neizdevās nosūtīt ielūgumus'));
            return;
        }
        const sent = (json.results ?? []).filter((r: { status: string }) => r.status === 'sent').length;
        const failed = (json.results ?? []).length - sent;
        setMessage(l(`Отправлено: ${sent}${failed ? `, ошибок: ${failed}` : ''}`, `Sent: ${sent}${failed ? `, errors: ${failed}` : ''}`, `Nosūtīts: ${sent}${failed ? `, kļūdas: ${failed}` : ''}`));
        await loadHolders();
    };

    const handleInviteOne = async (userId: string) => {
        setBusyIds((prev) => new Set(prev).add(userId));
        try {
            await sendInvites([userId]);
        } finally {
            setBusyIds((prev) => {
                const next = new Set(prev);
                next.delete(userId);
                return next;
            });
        }
    };

    // Ссылка-приглашение та же, что для email (общий токен в БД), уходит
    // через WhatsApp вручную админом — для держателей карты без реальной почты
    const handleWhatsApp = async (h: Holder) => {
        if (!h.phone) return;
        setBusyIds((prev) => new Set(prev).add(h.userId));
        setFormError('');
        try {
            const res = await fetch('/api/admin/invitations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userIds: [h.userId] }),
            });
            const json = await res.json();
            const inviteUrl = (json.results ?? [])[0]?.inviteUrl as string | undefined;
            if (!res.ok || !inviteUrl) {
                setFormError(l('Не удалось создать ссылку-приглашение', 'Failed to create invite link', 'Neizdevās izveidot ielūguma saiti'));
                return;
            }
            const digits = h.phone.replace(/\D/g, '');
            const waPhone = digits.length === 8 ? `371${digits}` : digits;
            const text = l(
                `Здравствуйте${h.name ? `, ${h.name}` : ''}! Приглашаем вас в hairshoppro.lv. Ваша карта клиента: ${h.cardNumber}. Активировать аккаунт: ${inviteUrl}`,
                `Hello${h.name ? `, ${h.name}` : ''}! You're invited to hairshoppro.lv. Your client card: ${h.cardNumber}. Activate your account: ${inviteUrl}`,
                `Sveiki${h.name ? `, ${h.name}` : ''}! Jūs esat aicināts uz hairshoppro.lv. Jūsu klienta karte: ${h.cardNumber}. Aktivizējiet kontu: ${inviteUrl}`
            );
            window.open(`https://wa.me/${waPhone}?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
            await loadHolders();
        } finally {
            setBusyIds((prev) => {
                const next = new Set(prev);
                next.delete(h.userId);
                return next;
            });
        }
    };

    const toggleSelect = (userId: string) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(userId)) next.delete(userId);
            else next.add(userId);
            return next;
        });
    };

    const toggleSelectMany = (ids: string[], checked: boolean) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            for (const id of ids) {
                if (checked) next.add(id);
                else next.delete(id);
            }
            return next;
        });
    };

    const handleInviteSelected = async () => {
        const ids = [...selectedIds];
        if (ids.length === 0) return;
        setBulkBusy(true);
        setBulkProgress({ processed: 0, total: ids.length });
        bulkStopRequested.current = false;
        setFormError('');
        setMessage('');
        let sent = 0;
        let failed = 0;
        try {
            for (let i = 0; i < ids.length; i += INVITE_BATCH) {
                if (bulkStopRequested.current) break;
                const chunk = ids.slice(i, i + INVITE_BATCH);
                const res = await fetch('/api/admin/invitations', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userIds: chunk }),
                });
                if (!res.ok) {
                    setFormError(l('Не удалось отправить приглашения', 'Failed to send invitations', 'Neizdevās nosūtīt ielūgumus'));
                    break;
                }
                const json = await res.json();
                const batchSent = (json.results ?? []).filter((r: { status: string }) => r.status === 'sent').length;
                sent += batchSent;
                failed += (json.results ?? []).length - batchSent;
                setSelectedIds((prev) => {
                    const next = new Set(prev);
                    chunk.forEach((id) => next.delete(id));
                    return next;
                });
                setBulkProgress({ processed: sent + failed, total: ids.length });
            }
            setMessage(
                bulkStopRequested.current
                    ? l(
                          `Остановлено. Отправлено: ${sent}${failed ? `, ошибок: ${failed}` : ''} из ${ids.length}`,
                          `Stopped. Sent: ${sent}${failed ? `, errors: ${failed}` : ''} of ${ids.length}`,
                          `Apturēts. Nosūtīts: ${sent}${failed ? `, kļūdas: ${failed}` : ''} no ${ids.length}`
                      )
                    : l(`Готово. Отправлено: ${sent}${failed ? `, ошибок: ${failed}` : ''}`, `Done. Sent: ${sent}${failed ? `, errors: ${failed}` : ''}`, `Gatavs. Nosūtīts: ${sent}${failed ? `, kļūdas: ${failed}` : ''}`)
            );
        } finally {
            setBulkBusy(false);
            setBulkProgress(null);
            await loadHolders();
        }
    };

    const handleAssignCard = async (e: React.FormEvent) => {
        e.preventDefault();
        setFormError('');
        setMessage('');
        setCardBusy(true);
        try {
            const res = await fetch('/api/admin/invitations/card', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: cardEmail, cardNumber }),
            });
            const json = await res.json();
            if (!res.ok) {
                const msg =
                    json.error === 'user_not_found'
                        ? l('Клиент с таким email не найден', 'No client with this email', 'Klients ar šādu e-pastu nav atrasts')
                        : json.error === 'card_taken'
                        ? l('Этот номер карты уже занят', 'This card number is already taken', 'Šis kartes numurs jau ir aizņemts')
                        : json.error === 'invalid_card'
                        ? l('Номер карты: 4–10 цифр', 'Card number: 4–10 digits', 'Kartes numurs: 4–10 cipari')
                        : l('Ошибка', 'Error', 'Kļūda');
                setFormError(msg);
                return;
            }
            setMessage(l(`Карта ${cardNumber} назначена ${cardEmail}`, `Card ${cardNumber} assigned to ${cardEmail}`, `Karte ${cardNumber} piešķirta ${cardEmail}`));
            setCardEmail('');
            setCardNumber('');
            // Клиент переходит из сегмента B в сегмент A — обновляем оба списка
            await Promise.all([loadHolders(), loadCampaign()]);
        } finally {
            setCardBusy(false);
        }
    };

    const runCampaign = async () => {
        setCampaignRunning(true);
        stopRequested.current = false;
        try {
            // Цикл батчей до finished или остановки админом
            for (;;) {
                if (stopRequested.current) break;
                const res = await fetch('/api/admin/card-rules-campaign', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({}),
                });
                const json = await res.json();
                if (json.state) setCampaign(json.state);
                if (!res.ok || json.state?.finished) break;
            }
        } finally {
            setCampaignRunning(false);
        }
    };

    const resetCampaign = async () => {
        const res = await fetch('/api/admin/card-rules-campaign', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reset: true }),
        });
        const json = await res.json();
        if (json.state) setCampaign(json.state);
    };

    const STATUS_LABEL: Record<Holder['status'], string> = {
        none: l('не приглашён', 'not invited', 'nav ielūgts'),
        sent: l('отправлено', 'sent', 'nosūtīts'),
        accepted: l('зарегистрировался', 'registered', 'reģistrējies'),
        expired: l('просрочено', 'expired', 'beidzies termiņš'),
        error: l('ошибка отправки', 'send error', 'sūtīšanas kļūda'),
    };
    const STATUS_CLASS: Record<Holder['status'], string> = {
        none: 'bg-muted text-muted-foreground',
        sent: 'bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300',
        accepted: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300',
        expired: 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300',
        error: 'bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300',
    };

    const displayedHolders = useMemo(() => {
        if (!holderSort || holderSort.key !== 'status') return holders;
        const mul = holderSort.dir === 'asc' ? 1 : -1;
        return [...holders].sort((a, b) => (HOLDER_STATUS_RANK[a.status] - HOLDER_STATUS_RANK[b.status]) * mul);
    }, [holders, holderSort]);

    const toggleHolderSort = (key: HolderSortKey) => {
        setHolderPage(0);
        setHolderSort((prev) => {
            if (!prev || prev.key !== key) return { key, dir: 'asc' };
            if (prev.dir === 'asc') return { key, dir: 'desc' };
            return null;
        });
    };

    const holderPageCount = Math.max(1, Math.ceil(holdersTotal / PAGE_SIZE));
    const effectiveHolderPage = Math.min(holderPage, holderPageCount - 1);
    const pageSelectableHolderIds = displayedHolders.filter((h) => h.status !== 'accepted').map((h) => h.userId);
    const allPageHoldersSelected = pageSelectableHolderIds.length > 0 && pageSelectableHolderIds.every((id) => selectedIds.has(id));

    // Кампания шлёт письма батчами по курсору (id asc), без лога на юзера —
    // "отправлено" здесь означает "id прошёл курсор", не факт доставки конкретного письма
    const ELIGIBLE_STATUS_LABEL = {
        sent: l('отправлено', 'sent', 'nosūtīts'),
        pending: l('не отправлено', 'not sent', 'nav nosūtīts'),
    };
    const ELIGIBLE_STATUS_CLASS = {
        sent: 'bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300',
        pending: 'bg-muted text-muted-foreground',
    };
    const isEligibleSent = (userId: string) => !!campaign?.cursor && userId <= campaign.cursor;

    const displayedEligible = useMemo(() => {
        if (!eligibleSort || eligibleSort.key !== 'status') return eligibleUsers;
        const mul = eligibleSort.dir === 'asc' ? 1 : -1;
        return [...eligibleUsers].sort((a, b) => (Number(isEligibleSent(a.id)) - Number(isEligibleSent(b.id))) * mul);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [eligibleUsers, eligibleSort, campaign?.cursor]);

    const toggleEligibleSort = (key: EligibleSortKey) => {
        setEligiblePage(0);
        setEligibleSort((prev) => {
            if (!prev || prev.key !== key) return { key, dir: 'asc' };
            if (prev.dir === 'asc') return { key, dir: 'desc' };
            return null;
        });
    };

    const eligiblePageCount = Math.max(1, Math.ceil(eligibleFilteredTotal / PAGE_SIZE));
    const effectiveEligiblePage = Math.min(eligiblePage, eligiblePageCount - 1);

    const stopBulkInvites = () => {
        bulkStopRequested.current = true;
    };

    const stopCampaign = () => {
        stopRequested.current = true;
    };


    return {
        l,
        locale,
        STATUS_LABEL,
        STATUS_CLASS,
        holders,
        setHolders,
        holdersTotal,
        setHoldersTotal,
        allHoldersCount,
        setAllHoldersCount,
        loading,
        setLoading,
        message,
        setMessage,
        formError,
        setFormError,
        busyIds,
        setBusyIds,
        selectedIds,
        setSelectedIds,
        bulkBusy,
        setBulkBusy,
        bulkProgress,
        setBulkProgress,
        bulkStopRequested,
        holderSearch,
        setHolderSearch,
        debouncedHolderSearch,
        setDebouncedHolderSearch,
        holderSort,
        setHolderSort,
        holderPage,
        setHolderPage,
        segment,
        setSegment,
        cardEmail,
        setCardEmail,
        cardNumber,
        setCardNumber,
        cardBusy,
        setCardBusy,
        campaign,
        setCampaign,
        totalEligible,
        setTotalEligible,
        eligibleFilteredTotal,
        setEligibleFilteredTotal,
        eligibleUsers,
        setEligibleUsers,
        eligibleLoading,
        setEligibleLoading,
        eligibleSearch,
        setEligibleSearch,
        debouncedEligibleSearch,
        setDebouncedEligibleSearch,
        eligibleSort,
        setEligibleSort,
        eligiblePage,
        setEligiblePage,
        campaignRunning,
        setCampaignRunning,
        stopRequested,
        holderServerSortDir,
        holdersAbortRef,
        loadHolders,
        eligibleServerSortDir,
        eligibleAbortRef,
        loadCampaign,
        sendInvites,
        handleInviteOne,
        handleWhatsApp,
        toggleSelect,
        toggleSelectMany,
        handleInviteSelected,
        handleAssignCard,
        runCampaign,
        resetCampaign,
        displayedHolders,
        toggleHolderSort,
        holderPageCount,
        effectiveHolderPage,
        pageSelectableHolderIds,
        allPageHoldersSelected,
        ELIGIBLE_STATUS_LABEL,
        ELIGIBLE_STATUS_CLASS,
        isEligibleSent,
        displayedEligible,
        toggleEligibleSort,
        eligiblePageCount,
        effectiveEligiblePage,
        stopBulkInvites,
        stopCampaign,
    };
}

export function useInvitationsPage(): ReturnType<typeof useInvitationsPageState> {
    return useInvitationsPageState();
}
