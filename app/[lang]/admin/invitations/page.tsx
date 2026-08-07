'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import AdminGate from '@/components/admin/AdminGate';
import { useTranslation } from '@/lib/use-translation';

type Holder = {
    userId: string;
    name: string | null;
    email: string;
    phone: string | null;
    cardNumber: string;
    status: 'none' | 'sent' | 'accepted' | 'expired' | 'error';
    sentAt: string | null;
    inviteUrl: string | null;
};

const isTechEmail = (email: string) => email.toLowerCase().endsWith('@client.local');

type CampaignState = {
    sentCount: number;
    errorCount: number;
    cursor: string | null;
    lastRunAt: string | null;
    finished: boolean;
    runningSince: string | null;
};

type EligibleUser = {
    id: string;
    name: string | null;
    email: string;
};

type HolderSortKey = 'name' | 'email' | 'cardNumber' | 'status';
type EligibleSortKey = 'name' | 'email' | 'status';
type SortDir = 'asc' | 'desc';

const compareStr = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

const HOLDER_STATUS_RANK: Record<Holder['status'], number> = { none: 0, sent: 1, accepted: 2, expired: 3, error: 4 };

const PAGE_SIZE = 50;
// Сервер принимает максимум INVITE_BATCH_SIZE id за запрос (lib/invitations.ts)
const INVITE_BATCH = 20;

export default function AdminInvitationsPage(): React.ReactElement {
    const { language } = useTranslation();
    const l = (ru: string, en: string, lv: string) =>
        language === 'ru' ? ru : language === 'lv' ? lv : en;

    const [holders, setHolders] = useState<Holder[]>([]);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState('');
    const [formError, setFormError] = useState('');
    const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [bulkBusy, setBulkBusy] = useState(false);
    const [bulkProgress, setBulkProgress] = useState<{ processed: number; total: number } | null>(null);
    const bulkStopRequested = useRef(false);
    const [holderSearch, setHolderSearch] = useState('');
    const [holderSort, setHolderSort] = useState<{ key: HolderSortKey; dir: SortDir } | null>(null);
    const [holderPage, setHolderPage] = useState(0);
    const [segment, setSegment] = useState<'withCard' | 'withoutCard'>('withCard');

    // Форма назначения карты
    const [cardEmail, setCardEmail] = useState('');
    const [cardNumber, setCardNumber] = useState('');
    const [cardBusy, setCardBusy] = useState(false);

    // Кампания сегмента B
    const [campaign, setCampaign] = useState<CampaignState | null>(null);
    const [totalEligible, setTotalEligible] = useState(0);
    const [eligibleUsers, setEligibleUsers] = useState<EligibleUser[]>([]);
    const [eligibleLoading, setEligibleLoading] = useState(true);
    const [eligibleSearch, setEligibleSearch] = useState('');
    const [eligibleSort, setEligibleSort] = useState<{ key: EligibleSortKey; dir: SortDir } | null>(null);
    const [eligiblePage, setEligiblePage] = useState(0);
    const [campaignRunning, setCampaignRunning] = useState(false);
    const stopRequested = useRef(false);

    const loadHolders = useCallback(async () => {
        try {
            const res = await fetch('/api/admin/invitations');
            const json = await res.json();
            if (res.ok) setHolders(json.holders ?? []);
        } finally {
            setLoading(false);
        }
    }, []);

    const loadCampaign = useCallback(async () => {
        try {
            const res = await fetch('/api/admin/card-rules-campaign');
            if (res.ok) {
                const json = await res.json();
                setCampaign(json.state);
                setTotalEligible(json.totalEligible ?? 0);
                setEligibleUsers(json.users ?? []);
            }
        } finally {
            setEligibleLoading(false);
        }
    }, []);

    useEffect(() => {
        queueMicrotask(() => {
            void loadHolders();
            void loadCampaign();
        });
    }, [loadHolders, loadCampaign]);

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
        setMessage(
            l(`Отправлено: ${sent}${failed ? `, ошибок: ${failed}` : ''}`,
              `Sent: ${sent}${failed ? `, errors: ${failed}` : ''}`,
              `Nosūtīts: ${sent}${failed ? `, kļūdas: ${failed}` : ''}`)
        );
        await loadHolders();
    };

    const handleInviteOne = async (userId: string) => {
        setBusyIds((prev) => new Set(prev).add(userId));
        try {
            await sendInvites([userId]);
        } finally {
            setBusyIds((prev) => { const next = new Set(prev); next.delete(userId); return next; });
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
                `Здравствуйте${h.name ? `, ${h.name}` : ''}! Приглашаем вас в hairshop-pro.lv. Ваша карта клиента: ${h.cardNumber}. Активировать аккаунт: ${inviteUrl}`,
                `Hello${h.name ? `, ${h.name}` : ''}! You're invited to hairshop-pro.lv. Your client card: ${h.cardNumber}. Activate your account: ${inviteUrl}`,
                `Sveiki${h.name ? `, ${h.name}` : ''}! Jūs esat aicināts uz hairshop-pro.lv. Jūsu klienta karte: ${h.cardNumber}. Aktivizējiet kontu: ${inviteUrl}`
            );
            window.open(`https://wa.me/${waPhone}?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
            await loadHolders();
        } finally {
            setBusyIds((prev) => { const next = new Set(prev); next.delete(h.userId); return next; });
        }
    };

    const toggleSelect = (userId: string) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(userId)) next.delete(userId); else next.add(userId);
            return next;
        });
    };

    const toggleSelectMany = (ids: string[], checked: boolean) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            for (const id of ids) { if (checked) next.add(id); else next.delete(id); }
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
                setSelectedIds((prev) => { const next = new Set(prev); chunk.forEach((id) => next.delete(id)); return next; });
                setBulkProgress({ processed: sent + failed, total: ids.length });
            }
            setMessage(
                bulkStopRequested.current
                    ? l(`Остановлено. Отправлено: ${sent}${failed ? `, ошибок: ${failed}` : ''} из ${ids.length}`,
                        `Stopped. Sent: ${sent}${failed ? `, errors: ${failed}` : ''} of ${ids.length}`,
                        `Apturēts. Nosūtīts: ${sent}${failed ? `, kļūdas: ${failed}` : ''} no ${ids.length}`)
                    : l(`Готово. Отправлено: ${sent}${failed ? `, ошибок: ${failed}` : ''}`,
                        `Done. Sent: ${sent}${failed ? `, errors: ${failed}` : ''}`,
                        `Gatavs. Nosūtīts: ${sent}${failed ? `, kļūdas: ${failed}` : ''}`)
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
            await loadHolders();
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

    const normalizedSearch = holderSearch.trim().toLowerCase();
    const filteredHolders = useMemo(() => {
        const base = normalizedSearch
            ? holders.filter((h) =>
                  (h.name ?? '').toLowerCase().includes(normalizedSearch) ||
                  h.email.toLowerCase().includes(normalizedSearch) ||
                  (h.phone ?? '').toLowerCase().includes(normalizedSearch) ||
                  h.cardNumber.toLowerCase().includes(normalizedSearch)
              )
            : holders;
        if (!holderSort) return base;
        const mul = holderSort.dir === 'asc' ? 1 : -1;
        return [...base].sort((a, b) => {
            switch (holderSort.key) {
                case 'name': return compareStr(a.name ?? '', b.name ?? '') * mul;
                case 'email': {
                    const techDiff = Number(isTechEmail(a.email)) - Number(isTechEmail(b.email));
                    return techDiff !== 0 ? techDiff * mul : compareStr(a.email, b.email) * mul;
                }
                case 'cardNumber': return compareStr(a.cardNumber, b.cardNumber) * mul;
                case 'status': return (HOLDER_STATUS_RANK[a.status] - HOLDER_STATUS_RANK[b.status]) * mul;
            }
        });
    }, [holders, normalizedSearch, holderSort]);

    const toggleHolderSort = (key: HolderSortKey) => {
        setHolderPage(0);
        setHolderSort((prev) => {
            if (!prev || prev.key !== key) return { key, dir: 'asc' };
            if (prev.dir === 'asc') return { key, dir: 'desc' };
            return null;
        });
    };

    const holderPageCount = Math.max(1, Math.ceil(filteredHolders.length / PAGE_SIZE));
    const effectiveHolderPage = Math.min(holderPage, holderPageCount - 1);
    const pagedHolders = useMemo(
        () => filteredHolders.slice(effectiveHolderPage * PAGE_SIZE, (effectiveHolderPage + 1) * PAGE_SIZE),
        [filteredHolders, effectiveHolderPage]
    );
    const pageSelectableHolderIds = pagedHolders.filter((h) => h.status !== 'accepted').map((h) => h.userId);
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

    const normalizedEligibleSearch = eligibleSearch.trim().toLowerCase();
    const filteredEligible = useMemo(() => {
        const base = normalizedEligibleSearch
            ? eligibleUsers.filter((u) =>
                  (u.name ?? '').toLowerCase().includes(normalizedEligibleSearch) ||
                  u.email.toLowerCase().includes(normalizedEligibleSearch)
              )
            : eligibleUsers;
        if (!eligibleSort) return base;
        const mul = eligibleSort.dir === 'asc' ? 1 : -1;
        return [...base].sort((a, b) => {
            switch (eligibleSort.key) {
                case 'name': return compareStr(a.name ?? '', b.name ?? '') * mul;
                case 'email': return compareStr(a.email, b.email) * mul;
                case 'status': return (Number(isEligibleSent(a.id)) - Number(isEligibleSent(b.id))) * mul;
            }
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [eligibleUsers, normalizedEligibleSearch, eligibleSort, campaign?.cursor]);

    const toggleEligibleSort = (key: EligibleSortKey) => {
        setEligiblePage(0);
        setEligibleSort((prev) => {
            if (!prev || prev.key !== key) return { key, dir: 'asc' };
            if (prev.dir === 'asc') return { key, dir: 'desc' };
            return null;
        });
    };

    const eligiblePageCount = Math.max(1, Math.ceil(filteredEligible.length / PAGE_SIZE));
    const effectiveEligiblePage = Math.min(eligiblePage, eligiblePageCount - 1);
    const pagedEligible = useMemo(
        () => filteredEligible.slice(effectiveEligiblePage * PAGE_SIZE, (effectiveEligiblePage + 1) * PAGE_SIZE),
        [filteredEligible, effectiveEligiblePage]
    );

    const sortArrow = (active: boolean, dir?: SortDir) => (
        <span className={`ml-1 text-[10px] ${active ? 'text-foreground' : 'text-gray-300 dark:text-gray-600'}`}>
            {active && dir === 'desc' ? '▼' : '▲'}
        </span>
    );

    const renderPager = (page: number, pageCount: number, total: number, setPage: (p: number) => void) => (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
            <span>
                {l(
                    `${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, total)} из ${total.toLocaleString('ru-RU')}`,
                    `${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, total)} of ${total.toLocaleString('ru-RU')}`,
                    `${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, total)} no ${total.toLocaleString('ru-RU')}`
                )}
            </span>
            <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" disabled={page <= 0} onClick={() => setPage(Math.max(0, page - 1))}>
                    {l('Назад', 'Prev', 'Atpakaļ')}
                </Button>
                <span>{page + 1} / {pageCount}</span>
                <Button size="sm" variant="outline" disabled={page >= pageCount - 1} onClick={() => setPage(Math.min(pageCount - 1, page + 1))}>
                    {l('Вперёд', 'Next', 'Uz priekšu')}
                </Button>
            </div>
        </div>
    );

    return (
        <AdminGate>
            <main className="w-full py-4 space-y-6">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-bold text-foreground">
                            {l('Приглашения клиентов', 'Client invitations', 'Klientu ielūgumi')}
                        </h1>
                        <p className="text-sm text-muted-foreground mt-1">
                            {l(
                                'Приглашения держателям карты клиента и рассылка правил получения карты остальным.',
                                'Invitations for card holders and card-rules mailing for everyone else.',
                                'Ielūgumi kartes īpašniekiem un kartes noteikumu izsūtīšana pārējiem.'
                            )}
                        </p>
                    </div>
                    <Link href="/admin">
                        <Button variant="outline">{l('Назад в админку', 'Back to admin', 'Atpakaļ uz admin')}</Button>
                    </Link>
                </div>

                {(formError || message) && (
                    <div className="rounded-lg border px-4 py-3 text-sm">
                        {formError && <p className="text-red-600 dark:text-red-400">{formError}</p>}
                        {message && <p className="text-emerald-600 dark:text-emerald-400">{message}</p>}
                    </div>
                )}

                {/* Тоггл: клиенты с картой / без карты */}
                <div className="inline-flex rounded-lg border border-border bg-muted p-1">
                    <button
                        type="button"
                        onClick={() => setSegment('withCard')}
                        className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                            segment === 'withCard'
                                ? 'bg-card text-foreground shadow-sm'
                                : 'text-muted-foreground hover:text-foreground'
                        }`}
                    >
                        {l('С картой', 'With a card', 'Ar karti')}{' '}
                        <span className="text-muted-foreground font-normal">{holders.length}</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => setSegment('withoutCard')}
                        className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                            segment === 'withoutCard'
                                ? 'bg-card text-foreground shadow-sm'
                                : 'text-muted-foreground hover:text-foreground'
                        }`}
                    >
                        {l('Без карты', 'Without a card', 'Bez kartes')}{' '}
                        <span className="text-muted-foreground font-normal">{totalEligible.toLocaleString('ru-RU')}</span>
                    </button>
                </div>

                {/* ── Сегмент A: держатели карт ── */}
                {segment === 'withCard' && (
                <section className="rounded-lg border border-border bg-card p-6 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <h2 className="text-xl font-semibold text-foreground">
                            {l('Клиенты с картой', 'Clients with a card', 'Klienti ar karti')}{' '}
                            <span className="text-muted-foreground font-normal text-base">
                                {normalizedSearch ? `${filteredHolders.length} / ${holders.length}` : holders.length}
                            </span>
                        </h2>
                        <div className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground">LV+RU+EN</span>
                            {(selectedIds.size > 0 || bulkBusy) && (
                                bulkBusy ? (
                                    <>
                                        <span className="text-sm text-muted-foreground animate-pulse">
                                            {l(`Отправка… ${bulkProgress?.processed ?? 0} / ${bulkProgress?.total ?? 0}`,
                                               `Sending… ${bulkProgress?.processed ?? 0} / ${bulkProgress?.total ?? 0}`,
                                               `Sūta… ${bulkProgress?.processed ?? 0} / ${bulkProgress?.total ?? 0}`)}
                                        </span>
                                        <Button variant="outline" onClick={() => { bulkStopRequested.current = true; }}>
                                            {l('Остановить после порции', 'Stop after batch', 'Apturēt pēc partijas')}
                                        </Button>
                                    </>
                                ) : (
                                    <>
                                        <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
                                            {l('Снять выбор', 'Clear selection', 'Notīrīt atlasi')}
                                        </Button>
                                        <Button onClick={handleInviteSelected}>
                                            {l(`Отправить выбранным (${selectedIds.size})`, `Send to selected (${selectedIds.size})`, `Sūtīt izvēlētajiem (${selectedIds.size})`)}
                                        </Button>
                                    </>
                                )
                            )}
                        </div>
                    </div>

                    {!loading && holders.length > 0 && (
                        <Input
                            value={holderSearch}
                            onChange={(e) => { setHolderSearch(e.target.value); setHolderPage(0); }}
                            placeholder={l('Поиск по имени, email, телефону или номеру карты…', 'Search by name, email, phone or card number…', 'Meklēt pēc vārda, e-pasta, tālruņa vai kartes numura…')}
                            className="max-w-sm"
                        />
                    )}

                    {loading ? (
                        <p className="text-sm text-muted-foreground animate-pulse py-4">{l('Загрузка…', 'Loading…', 'Ielādē…')}</p>
                    ) : holders.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                            {l(
                                'Пока нет клиентов с картой. Назначьте карту через форму ниже или дождитесь импорта из ERP.',
                                'No clients with a card yet. Assign a card below or wait for the ERP import.',
                                'Pagaidām nav klientu ar karti. Piešķiriet karti zemāk vai gaidiet ERP importu.'
                            )}
                        </div>
                    ) : filteredHolders.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                            {l('Ничего не найдено по запросу.', 'No matches for this search.', 'Pēc šī pieprasījuma nekas nav atrasts.')}
                        </div>
                    ) : (
                        <div className="overflow-x-auto overflow-y-auto max-h-[60vh] rounded-md border border-border">
                            <table className="w-full text-sm">
                                <thead className="sticky top-0 bg-card z-10">
                                    <tr className="border-b border-border text-left text-muted-foreground">
                                        <th className="py-2 pr-2 pl-1 font-medium w-8">
                                            <Checkbox
                                                checked={allPageHoldersSelected}
                                                disabled={pageSelectableHolderIds.length === 0 || bulkBusy}
                                                onCheckedChange={(checked) => toggleSelectMany(pageSelectableHolderIds, checked)}
                                                aria-label={l('Выбрать все на странице', 'Select all on page', 'Atlasīt visus lapā')}
                                            />
                                        </th>
                                        <th className="py-2 pr-3 font-medium cursor-pointer select-none hover:text-foreground" onClick={() => toggleHolderSort('name')}>
                                            {l('Имя', 'Name', 'Vārds')}{sortArrow(holderSort?.key === 'name', holderSort?.dir)}
                                        </th>
                                        <th className="py-2 pr-3 font-medium cursor-pointer select-none hover:text-foreground" onClick={() => toggleHolderSort('email')}>
                                            Email{sortArrow(holderSort?.key === 'email', holderSort?.dir)}
                                        </th>
                                        <th className="py-2 pr-3 font-medium">{l('Телефон', 'Phone', 'Tālrunis')}</th>
                                        <th className="py-2 pr-3 font-medium cursor-pointer select-none hover:text-foreground" onClick={() => toggleHolderSort('cardNumber')}>
                                            {l('Карта', 'Card', 'Karte')}{sortArrow(holderSort?.key === 'cardNumber', holderSort?.dir)}
                                        </th>
                                        <th className="py-2 pr-3 font-medium cursor-pointer select-none hover:text-foreground" onClick={() => toggleHolderSort('status')}>
                                            {l('Статус', 'Status', 'Statuss')}{sortArrow(holderSort?.key === 'status', holderSort?.dir)}
                                        </th>
                                        <th className="py-2 pr-3 font-medium">{l('Отправлено', 'Sent', 'Nosūtīts')}</th>
                                        <th className="py-2 pr-3 font-medium"></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {pagedHolders.map((h) => (
                                        <tr key={h.userId} className="border-b border-border/50">
                                            <td className="py-2 pr-2 pl-1">
                                                {h.status !== 'accepted' && (
                                                    <Checkbox
                                                        checked={selectedIds.has(h.userId)}
                                                        disabled={bulkBusy}
                                                        onCheckedChange={() => toggleSelect(h.userId)}
                                                        aria-label={l('Выбрать', 'Select', 'Atlasīt')}
                                                    />
                                                )}
                                            </td>
                                            <td className="py-2 pr-3 text-foreground">{h.name || '—'}</td>
                                            <td className="py-2 pr-3 text-foreground">
                                                {h.email}
                                                {isTechEmail(h.email) && (
                                                    <span
                                                        className="ml-1.5 inline-block rounded-full bg-amber-100 dark:bg-amber-900/40 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:text-amber-300 align-middle"
                                                        title={l('Техническая почта — письма на неё не доходят', 'Technical address — emails to it never arrive', 'Tehniska adrese — vēstules uz to nenonāk')}
                                                    >
                                                        {l('техпочта', 'tech', 'tehn.')}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="py-2 pr-3 text-foreground">{h.phone || '—'}</td>
                                            <td className="py-2 pr-3 font-mono text-foreground">{h.cardNumber}</td>
                                            <td className="py-2 pr-3">
                                                <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[h.status]}`}>
                                                    {STATUS_LABEL[h.status]}
                                                </span>
                                            </td>
                                            <td className="py-2 pr-3 text-muted-foreground">
                                                {h.sentAt ? new Date(h.sentAt).toLocaleDateString('ru-RU') : '—'}
                                            </td>
                                            <td className="py-2 pr-3 text-right whitespace-nowrap">
                                                {h.status === 'accepted' ? null : isTechEmail(h.email) && h.phone ? (
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        className="text-emerald-700 border-emerald-300 hover:bg-emerald-50 dark:text-emerald-400 dark:border-emerald-800 dark:hover:bg-emerald-900/20"
                                                        disabled={busyIds.has(h.userId)}
                                                        onClick={() => handleWhatsApp(h)}
                                                        title={l('Открыть WhatsApp с готовым текстом приглашения', 'Open WhatsApp with a pre-filled invite message', 'Atvērt WhatsApp ar sagatavotu ielūguma tekstu')}
                                                    >
                                                        {busyIds.has(h.userId) ? l('Отправка…', 'Sending…', 'Sūta…') : 'WhatsApp'}
                                                    </Button>
                                                ) : isTechEmail(h.email) && !h.phone ? (
                                                    <span
                                                        className="inline-block rounded-full bg-muted px-2 py-1 text-xs font-medium text-muted-foreground"
                                                        title={l(
                                                            'Нет реальной почты и телефона — связаться не получится',
                                                            'No real email or phone on file — cannot be reached',
                                                            'Nav reālas e-pasta adreses ne tālruņa — nav iespējams sazināties'
                                                        )}
                                                    >
                                                        {l('Нет доступа', 'No contact', 'Nav pieejams')}
                                                    </span>
                                                ) : (
                                                    <Button
                                                        size="sm"
                                                        variant={h.status === 'none' ? 'default' : 'outline'}
                                                        disabled={busyIds.has(h.userId)}
                                                        onClick={() => handleInviteOne(h.userId)}
                                                    >
                                                        {busyIds.has(h.userId)
                                                            ? l('Отправка…', 'Sending…', 'Sūta…')
                                                            : h.status === 'none'
                                                            ? l('Пригласить', 'Invite', 'Ielūgt')
                                                            : l('Повторно', 'Resend', 'Atkārtoti')}
                                                    </Button>
                                                )}
                                                {h.inviteUrl && (
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        className="ml-1"
                                                        onClick={() => { void navigator.clipboard.writeText(h.inviteUrl!); }}
                                                        title={l('Скопировать ссылку', 'Copy link', 'Kopēt saiti')}
                                                    >
                                                        ⧉
                                                    </Button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {!loading && filteredHolders.length > PAGE_SIZE &&
                        renderPager(effectiveHolderPage, holderPageCount, filteredHolders.length, setHolderPage)}

                    {/* Ручное назначение карты (до ERP-импорта) */}
                    <form onSubmit={handleAssignCard} className="rounded-md border border-border p-4 grid grid-cols-1 sm:grid-cols-[1.5fr_1fr_auto] gap-3 items-end">
                        <p className="sm:col-span-3 text-xs text-muted-foreground -mb-1">
                            {l(
                                'Только для уже зарегистрированных клиентов — находит аккаунт по email и проставляет ему номер карты. Имя и телефон брать не нужно: они уже есть в профиле клиента. Если email не найден в системе — форма вернёт ошибку, новый аккаунт она не создаёт.',
                                'For already registered clients only — finds the account by email and sets its card number. No need for name or phone: already on file in the client profile. If the email isn’t found — the form errors out, it does not create a new account.',
                                'Tikai jau reģistrētiem klientiem — atrod kontu pēc e-pasta un piešķir tam kartes numuru. Vārds un tālrunis nav jānorāda — tie jau ir klienta profilā. Ja e-pasts nav atrasts — forma uzrāda kļūdu, jaunu kontu tā nerada.'
                            )}
                        </p>
                        <label className="text-sm">
                            <span className="block mb-1 text-muted-foreground">{l('Email клиента', 'Client email', 'Klienta e-pasts')}</span>
                            <Input type="email" required value={cardEmail} onChange={(e) => setCardEmail(e.target.value)} placeholder="client@inbox.lv" />
                        </label>
                        <label className="text-sm">
                            <span className="block mb-1 text-muted-foreground">{l('Номер карты', 'Card number', 'Kartes numurs')}</span>
                            <Input required value={cardNumber} onChange={(e) => setCardNumber(e.target.value)} placeholder="1001" className="font-mono" />
                        </label>
                        <Button type="submit" disabled={cardBusy}>
                            {cardBusy ? l('Сохраняем…', 'Saving…', 'Saglabā…') : l('Назначить карту', 'Assign card', 'Piešķirt karti')}
                        </Button>
                    </form>
                </section>
                )}

                {/* ── Сегмент B: остальные клиенты ── */}
                {segment === 'withoutCard' && (
                <section className="rounded-lg border border-border bg-card p-6 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <h2 className="text-xl font-semibold text-foreground">
                            {l('Клиенты без карты', 'Clients without a card', 'Klienti bez kartes')}{' '}
                            <span className="text-muted-foreground font-normal text-base">
                                {normalizedEligibleSearch ? `${filteredEligible.length} / ${eligibleUsers.length}` : eligibleUsers.length}
                            </span>
                        </h2>
                    </div>

                    {!eligibleLoading && eligibleUsers.length > 0 && (
                        <Input
                            value={eligibleSearch}
                            onChange={(e) => { setEligibleSearch(e.target.value); setEligiblePage(0); }}
                            placeholder={l('Поиск по имени или email…', 'Search by name or email…', 'Meklēt pēc vārda vai e-pasta…')}
                            className="max-w-sm"
                        />
                    )}

                    {eligibleLoading ? (
                        <p className="text-sm text-muted-foreground animate-pulse py-4">{l('Загрузка…', 'Loading…', 'Ielādē…')}</p>
                    ) : eligibleUsers.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                            {l('Нет клиентов без карты.', 'No clients without a card.', 'Nav klientu bez kartes.')}
                        </div>
                    ) : filteredEligible.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                            {l('Ничего не найдено по запросу.', 'No matches for this search.', 'Pēc šī pieprasījuma nekas nav atrasts.')}
                        </div>
                    ) : (
                        <div className="overflow-y-auto max-h-[60vh] rounded-md border border-border">
                            <table className="w-full table-fixed text-sm">
                                <thead className="sticky top-0 bg-card z-10">
                                    <tr className="border-b border-border text-left text-muted-foreground">
                                        <th className="w-[35%] py-2 pr-3 font-medium cursor-pointer select-none hover:text-foreground" onClick={() => toggleEligibleSort('name')}>
                                            {l('Имя', 'Name', 'Vārds')}{sortArrow(eligibleSort?.key === 'name', eligibleSort?.dir)}
                                        </th>
                                        <th className="w-[45%] py-2 pr-3 font-medium cursor-pointer select-none hover:text-foreground" onClick={() => toggleEligibleSort('email')}>
                                            Email{sortArrow(eligibleSort?.key === 'email', eligibleSort?.dir)}
                                        </th>
                                        <th className="w-[20%] py-2 font-medium cursor-pointer select-none hover:text-foreground" onClick={() => toggleEligibleSort('status')}>
                                            {l('Статус', 'Status', 'Statuss')}{sortArrow(eligibleSort?.key === 'status', eligibleSort?.dir)}
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {pagedEligible.map((u) => {
                                        const sent = isEligibleSent(u.id);
                                        return (
                                            <tr key={u.id} className="border-b border-border/50">
                                                <td className="py-2 pr-3 text-foreground break-words">{u.name || '—'}</td>
                                                <td className="py-2 pr-3 text-foreground break-words">{u.email}</td>
                                                <td className="py-2">
                                                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${ELIGIBLE_STATUS_CLASS[sent ? 'sent' : 'pending']}`}>
                                                        {ELIGIBLE_STATUS_LABEL[sent ? 'sent' : 'pending']}
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {!eligibleLoading && filteredEligible.length > PAGE_SIZE &&
                        renderPager(effectiveEligiblePage, eligiblePageCount, filteredEligible.length, setEligiblePage)}

                    {/* Рассылка правил получения карты (аналог формы назначения карты в сегменте A) */}
                    <div className="rounded-md border border-border p-4 space-y-3">
                        <p className="text-sm text-muted-foreground">
                            {l(
                                'Письмо с правилами получения карты клиента всем, у кого карты нет. Отправка порциями по 50.',
                                'An email with card rules to everyone without a card. Sent in batches of 50.',
                                'E-pasts ar kartes noteikumiem visiem bez kartes. Sūta pa 50.'
                            )}
                        </p>

                        {campaign && (
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                                <div className="rounded-md border border-border p-3">
                                    <p className="text-muted-foreground">{l('Получателей', 'Recipients', 'Saņēmēji')}</p>
                                    <p className="text-lg font-semibold text-foreground">{totalEligible.toLocaleString('ru-RU')}</p>
                                </div>
                                <div className="rounded-md border border-border p-3">
                                    <p className="text-muted-foreground">{l('Отправлено', 'Sent', 'Nosūtīts')}</p>
                                    <p className="text-lg font-semibold text-foreground">{campaign.sentCount.toLocaleString('ru-RU')}</p>
                                </div>
                                <div className="rounded-md border border-border p-3">
                                    <p className="text-muted-foreground">{l('Ошибок', 'Errors', 'Kļūdas')}</p>
                                    <p className="text-lg font-semibold text-foreground">{campaign.errorCount}</p>
                                </div>
                                <div className="rounded-md border border-border p-3">
                                    <p className="text-muted-foreground">{l('Статус', 'Status', 'Statuss')}</p>
                                    <p className="text-lg font-semibold text-foreground">
                                        {campaign.finished
                                            ? l('Завершена', 'Finished', 'Pabeigta')
                                            : campaign.sentCount + campaign.errorCount > 0
                                            ? l('В процессе', 'In progress', 'Procesā')
                                            : l('Не начата', 'Not started', 'Nav sākta')}
                                    </p>
                                </div>
                            </div>
                        )}

                        <div className="flex flex-wrap gap-2">
                            {campaignRunning ? (
                                <Button variant="outline" onClick={() => { stopRequested.current = true; }}>
                                    {l('Остановить после текущей порции', 'Stop after current batch', 'Apturēt pēc pašreizējās partijas')}
                                </Button>
                            ) : (
                                <Button onClick={runCampaign} disabled={campaign?.finished ?? false}>
                                    {campaign && campaign.sentCount + campaign.errorCount > 0 && !campaign.finished
                                        ? l('Продолжить рассылку', 'Continue mailing', 'Turpināt sūtīšanu')
                                        : l('Начать рассылку', 'Start mailing', 'Sākt sūtīšanu')}
                                </Button>
                            )}
                            {campaign?.finished && (
                                <Button variant="outline" onClick={resetCampaign}>
                                    {l('Сбросить (новая кампания)', 'Reset (new campaign)', 'Atiestatīt (jauna kampaņa)')}
                                </Button>
                            )}
                        </div>
                    </div>
                </section>
                )}
            </main>
        </AdminGate>
    );
}
