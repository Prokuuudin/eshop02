'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isValidPhoneNumber } from 'react-phone-number-input';
import { useAdminLocale } from '@/lib/use-admin-locale';
import {
    INVITATIONS_PAGE_SIZE as PAGE_SIZE,
    INVITE_BATCH_SIZE as INVITE_BATCH,
    type CampaignState,
    type EligibleSortKey,
    type EligibleUser,
    type Holder,
    type HolderContactFilter,
    type HolderInvitationFilter,
    type HolderSortKey,
    type SortDir,
    isTechEmail,
    isEligibleUserSent,
    nextSort,
    sortEligibleByStatus,
    sortHoldersByStatus,
} from './invitation-models';
import {
    assignInvitationCard,
    fetchCardCampaign,
    fetchInvitationHolders,
    sendInvitationBatch,
    sendSmsInvitationBatch,
    updateCardCampaign,
} from './invitations-api';

function useInvitationsPageState() {
    const { l, locale, language } = useAdminLocale();

    const [holders, setHolders] = useState<Holder[]>([]);
    const [holdersTotal, setHoldersTotal] = useState(0);
    const [allHoldersCount, setAllHoldersCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState('');
    const [formError, setFormError] = useState('');
    const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [bulkBusy, setBulkBusy] = useState(false);
    const [smsBulkBusy, setSmsBulkBusy] = useState(false);
    const [bulkProgress, setBulkProgress] = useState<{ processed: number; total: number } | null>(null);
    const bulkStopRequested = useRef(false);
    const [holderSearch, setHolderSearch] = useState('');
    const [debouncedHolderSearch, setDebouncedHolderSearch] = useState('');
    const [holderSort, setHolderSort] = useState<{ key: HolderSortKey; dir: SortDir } | null>(null);
    const [holderPage, setHolderPage] = useState(0);
    const [holderContactFilter, setHolderContactFilter] = useState<HolderContactFilter>('all');
    const [holderInvitationFilter, setHolderInvitationFilter] = useState<HolderInvitationFilter>('all');
    const [segment, setSegment] = useState<'withCard' | 'withoutCard'>('withCard');

    useEffect(() => {
        const timer = window.setTimeout(() => setDebouncedHolderSearch(holderSearch.trim()), 300);
        return () => window.clearTimeout(timer);
    }, [holderSearch]);

    // Форма назначения карты / добавления нового клиента (модалка)
    const [cardDialogOpen, setCardDialogOpen] = useState(false);
    const [cardEmail, setCardEmail] = useState('');
    const [cardNumber, setCardNumber] = useState('');
    const [cardName, setCardName] = useState('');
    const [cardPhone, setCardPhone] = useState('');
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
            const { ok, data: json } = await fetchInvitationHolders({
                take: PAGE_SIZE,
                skip: holderPage * PAGE_SIZE,
                search: debouncedHolderSearch,
                sort: holderServerSortField ?? undefined,
                dir: holderServerSortDir ?? undefined,
                contact: holderContactFilter,
                invitation: holderInvitationFilter,
            }, controller.signal);
            if (ok) {
                setHolders(json.holders ?? []);
                setHoldersTotal(json.total ?? 0);
                if (!debouncedHolderSearch && holderContactFilter === 'all' && holderInvitationFilter === 'all') {
                    setAllHoldersCount(json.total ?? 0);
                }
            }
        } catch (err) {
            if ((err as Error)?.name !== 'AbortError') throw err;
            return;
        } finally {
            // Отменённый (устаревший) запрос не должен гасить индикатор загрузки за более новый
            if (holdersAbortRef.current === controller) setLoading(false);
        }
    }, [debouncedHolderSearch, holderPage, holderServerSortField, holderServerSortDir, holderContactFilter, holderInvitationFilter]);

    const eligibleServerSortField: 'name' | 'email' | null = eligibleSort && eligibleSort.key !== 'status' ? eligibleSort.key : null;
    const eligibleServerSortDir = eligibleSort && eligibleSort.key !== 'status' ? eligibleSort.dir : null;

    const eligibleAbortRef = useRef<AbortController | null>(null);
    const loadCampaign = useCallback(async () => {
        eligibleAbortRef.current?.abort();
        const controller = new AbortController();
        eligibleAbortRef.current = controller;
        setEligibleLoading(true);
        try {
            const { ok, data: json } = await fetchCardCampaign({
                take: PAGE_SIZE,
                skip: eligiblePage * PAGE_SIZE,
                search: debouncedEligibleSearch,
                sort: eligibleServerSortField ?? undefined,
                dir: eligibleServerSortDir ?? undefined,
            }, controller.signal);
            if (ok) {
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
        const { ok, data: json } = await sendInvitationBatch(userIds);
        if (!ok) {
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

    // Телефонное приглашение не использует email и персональные токены:
    // администратор копирует готовый текст и отправляет его по SMS или в мессенджере.
    const sendPhoneInvites = async (userIds: string[]) => {
        const { ok, data } = await sendSmsInvitationBatch(userIds, language);
        if (!ok) {
            setFormError(data.error === 'sms_provider_not_configured'
                ? l('SMS-провайдер ещё не подключён', 'SMS provider is not connected yet', 'SMS pakalpojuma sniedzējs vēl nav pieslēgts')
                : l('Не удалось отправить SMS', 'Failed to send SMS', 'Neizdevās nosūtīt SMS'));
            return 0;
        }
        return data.results?.length ?? 0;
    };

    const handlePhoneMessage = async (h: Holder) => {
        if (!h.phone) return;
        setBusyIds((prev) => new Set(prev).add(h.userId));
        setFormError('');
        setMessage('');
        try {
            const sent = await sendPhoneInvites([h.userId]);
            if (sent) {
                setMessage(l('Тестовая SMS-отправка выполнена', 'Simulated SMS sending completed', 'SMS testa sūtīšana pabeigta'));
                await loadHolders();
            }
        } finally {
            setBusyIds((prev) => {
                const next = new Set(prev);
                next.delete(h.userId);
                return next;
            });
        }
    };

    const handleSmsSelected = async () => {
        const ids = [...selectedIds];
        if (!ids.length) return;
        setSmsBulkBusy(true);
        setFormError('');
        setMessage('');
        let sent = 0;
        try {
            for (let index = 0; index < ids.length; index += INVITE_BATCH) {
                sent += await sendPhoneInvites(ids.slice(index, index + INVITE_BATCH));
                if (sent === 0 && formError) break;
            }
            if (sent) setMessage(l(`Тестовых SMS обработано: ${sent}`, `Simulated SMS messages processed: ${sent}`, `Apstrādātas testa SMS: ${sent}`));
            setSelectedIds(new Set());
            await loadHolders();
        } finally {
            setSmsBulkBusy(false);
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
                const { ok, data: json } = await sendInvitationBatch(chunk);
                if (!ok) {
                    setFormError(l('Не удалось отправить приглашения', 'Failed to send invitations', 'Neizdevās nosūtīt ielūgumus'));
                    break;
                }
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
        const email = cardEmail.trim();
        const number = cardNumber.trim();
        if (!email || !number) {
            setFormError(l('Заполните email и номер карты', 'Fill in email and card number', 'Aizpildiet e-pastu un kartes numuru'));
            return;
        }
        if (!/^\d{1,6}$/.test(number.replace(/^0+(?=\d)/, ''))) {
            setFormError(l('Номер карты: 1–6 цифр', 'Card number: 1–6 digits', 'Kartes numurs: 1–6 cipari'));
            return;
        }
        const phone = cardPhone.trim();
        if (phone && !isValidPhoneNumber(phone, 'LV')) {
            setFormError(l('Проверьте номер телефона', 'Check the phone number', 'Pārbaudiet tālruņa numuru'));
            return;
        }
        setCardBusy(true);
        try {
            const { data: json } = await assignInvitationCard(email, number, cardName.trim(), phone);
            if ('error' in json) {
                const err = json.error;
                const msg =
                    err === 'phone_required'
                        ? l('Для нового клиента укажите телефон — это данные активации карты', 'Enter a phone number for a new client — it is the card-activation contact', 'Jaunam klientam norādiet tālruni — tie ir kartes aktivizācijas dati')
                        : err === 'card_taken'
                        ? l('Этот номер карты уже занят', 'This card number is already taken', 'Šis kartes numurs jau ir aizņemts')
                        : err === 'invalid_card'
                        ? l('Номер карты: 1–6 цифр', 'Card number: 1–6 digits', 'Kartes numurs: 1–6 cipari')
                        : err === 'invalid_email'
                        ? l('Некорректный email', 'Invalid email', 'Nederīgs e-pasts')
                        : l('Ошибка', 'Error', 'Kļūda');
                setFormError(msg);
                return;
            }
            const parts = [
                json.created
                    ? l(`Клиент создан, карта ${number} назначена ${email}`, `Client created, card ${number} assigned to ${email}`, `Klients izveidots, karte ${number} piešķirta ${email}`)
                    : l(`Карта ${number} назначена ${email}`, `Card ${number} assigned to ${email}`, `Karte ${number} piešķirta ${email}`),
            ];
            // Новый клиент — сразу отправляем приглашение, в этом и смысл активации карты.
            // Уже существующему клиенту инвайт не трогаем: он мог уже быть зарегистрирован
            // или получить письмо ранее — пересылку админ делает вручную из таблицы.
            if (json.created && !isTechEmail(email)) {
                const { ok: inviteOk, data: inviteJson } = await sendInvitationBatch([json.userId]);
                const sent = inviteOk && (inviteJson.results ?? []).some((r) => r.status === 'sent');
                parts.push(
                    sent
                        ? l('приглашение отправлено', 'invitation sent', 'ielūgums nosūtīts')
                        : l('приглашение не отправлено — отправьте вручную из таблицы', 'invitation not sent — send it manually from the table', 'ielūgums nav nosūtīts — nosūtiet to no tabulas')
                );
            }
            setMessage(parts.join(', '));
            setCardDialogOpen(false);
            setCardEmail('');
            setCardNumber('');
            setCardName('');
            setCardPhone('');
            // Сбрасываем фильтры/страницу и фильтруем список по email клиента —
            // иначе новый/переведённый клиент может оказаться на другой странице
            // или быть скрыт активным фильтром контактов и остаться незамеченным.
            setHolderContactFilter('all');
            setHolderInvitationFilter('all');
            setHolderPage(0);
            setHolderSearch(email);
            await loadCampaign();
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
                const { ok, data: json } = await updateCardCampaign();
                if (json.state) setCampaign(json.state);
                if (!ok || json.state?.finished) break;
            }
        } finally {
            setCampaignRunning(false);
        }
    };

    const resetCampaign = async () => {
        const { data: json } = await updateCardCampaign(true);
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
        return sortHoldersByStatus(holders, holderSort.dir);
    }, [holders, holderSort]);

    const toggleHolderSort = (key: HolderSortKey) => {
        setHolderPage(0);
        setHolderSort((prev) => nextSort(prev, key));
    };

    const holderPageCount = Math.max(1, Math.ceil(holdersTotal / PAGE_SIZE));
    const effectiveHolderPage = Math.min(holderPage, holderPageCount - 1);
    const pageSelectableHolderIds = displayedHolders
        .filter((h) => h.status !== 'accepted' && (!isTechEmail(h.email) || Boolean(h.phone)))
        .map((h) => h.userId);
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
    const isEligibleSent = (userId: string) => isEligibleUserSent(userId, campaign?.cursor);

    const displayedEligible = useMemo(() => {
        if (!eligibleSort || eligibleSort.key !== 'status') return eligibleUsers;
        return sortEligibleByStatus(eligibleUsers, campaign?.cursor, eligibleSort.dir);
    }, [eligibleUsers, eligibleSort, campaign?.cursor]);

    const toggleEligibleSort = (key: EligibleSortKey) => {
        setEligiblePage(0);
        setEligibleSort((prev) => nextSort(prev, key));
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
        language,
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
        smsBulkBusy,
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
        holderContactFilter,
        setHolderContactFilter,
        holderInvitationFilter,
        setHolderInvitationFilter,
        segment,
        setSegment,
        cardDialogOpen,
        setCardDialogOpen,
        cardEmail,
        setCardEmail,
        cardNumber,
        setCardNumber,
        cardName,
        setCardName,
        cardPhone,
        setCardPhone,
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
        handlePhoneMessage,
        handleSmsSelected,
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
