'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from '@/lib/use-translation';

async function fetchNextCardNumber(): Promise<string> {
    try {
        const res = await fetch('/api/admin/card-request/next-number');
        if (!res.ok) return '';
        const data = await res.json().catch(() => null);
        return typeof data?.cardNumber === 'string' ? data.cardNumber : '';
    } catch {
        return '';
    }
}

// Заявка мастера из Neon (GET /api/admin/access-requests); certificateData
// (картинка) на сервер не передаётся — есть только certificateName
type NoCardRequest = {
    id: string;
    email: string;
    name: string | null;
    phone: string | null;
    requestType: string;
    certificateName: string | null;
    message: string | null;
    language: string | null;
    requestedAt: string;
};

// Держатель карты — реальный клиент из Neon (User.cardNumber), не B2B-компания:
// компаний в проде пока нет (Company пустая), все ~10700 карт висят на User
export type CardHolder = {
    id: string;
    email: string;
    name: string | null;
    phone: string | null;
    cardNumber: string | null;
    bonusPoints: number;
    companyName: string | null;
    customerType: 'individual' | 'company' | null;
    registrationNumber: string | null;
    vatNumber: string | null;
    legalAddress: string | null;
    updatedAt: string;
};

type NoCardDraft = {
    customerType: 'individual' | 'company';
    companyName: string;
    registrationNumber: string;
    cardNumber: string;
};

function useAdminClientBarcodesPageState() {
    const { t, language } = useTranslation();
    const l = (ru: string, en: string, lv: string) =>
        language === 'ru' ? ru : language === 'lv' ? lv : en;
    const tl = (
        key: string,
        ru: string,
        en: string,
        lv: string,
        params?: Record<string, string | number>
    ) => t(key, l(ru, en, lv), params);

    const [formError, setFormError] = useState('');
    const [message, setMessage] = useState('');
    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [customerType, setCustomerType] = useState('all');
    const [cardHoldersPage, setCardHoldersPage] = useState(0);

    // Список держателей карт — из Neon по /api/admin/users, фильтр по email/
    // имени/номеру карты идёт на сервере (WHERE ... contains)
    const [cardHolders, setCardHolders] = useState<CardHolder[]>([]);
    const [cardHoldersTotal, setCardHoldersTotal] = useState(0);
    const [cardHoldersLoading, setCardHoldersLoading] = useState(false);
    const [cardHoldersError, setCardHoldersError] = useState('');
    const [clientEdits, setClientEdits] = useState<Record<string, { customerType: 'individual' | 'company'; registrationNumber: string }>>({});
    const [clientSaveBusy, setClientSaveBusy] = useState<string | null>(null);

    useEffect(() => {
        const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
        return () => window.clearTimeout(timer);
    }, [search]);

    const loadCardHolders = useCallback(async () => {
        setCardHoldersLoading(true);
        try {
            const params = new URLSearchParams({ take: '50', hasCard: '1' });
            params.set('skip', String(cardHoldersPage * 50));
            if (debouncedSearch) params.set('search', debouncedSearch);
            if (customerType !== 'all') params.set('customerType', customerType);
            const res = await fetch(`/api/admin/users?${params}`, { cache: 'no-store' });
            if (!res.ok) throw new Error(`users_${res.status}`);
            const data = await res.json();
            if (Array.isArray(data.users)) {
                setCardHolders(data.users);
                setCardHoldersTotal(data.total ?? data.users.length);
                setCardHoldersError('');
            }
        } catch {
            setCardHoldersError(language === 'ru' ? 'Не удалось загрузить карты клиентов.' : language === 'lv' ? 'Neizdevās ielādēt klientu kartes.' : 'Failed to load client cards.');
        } finally {
            setCardHoldersLoading(false);
        }
    }, [debouncedSearch, customerType, cardHoldersPage, language]);

    useEffect(() => {
        queueMicrotask(() => void loadCardHolders());
    }, [loadCardHolders]);

    // Заявки мастеров — из Neon, не из localStorage: клиент подаёт заявку со
    // своего браузера, локальный store админа её не видит
    const [noCardRequests, setNoCardRequests] = useState<NoCardRequest[]>([]);
    const loadNoCardRequests = useCallback(async () => {
        try {
            const res = await fetch('/api/admin/access-requests?status=pending');
            if (!res.ok) return;
            const json = await res.json();
            setNoCardRequests(
                ((json.requests ?? []) as NoCardRequest[]).filter((r) => r.requestType === 'no-card')
            );
        } catch { /* сеть — оставляем прежний список */ }
    }, [setNoCardRequests]);
    useEffect(() => {
        queueMicrotask(() => void loadNoCardRequests());
    }, [loadNoCardRequests]);

    const [noCardDrafts, setNoCardDrafts] = useState<Record<string, NoCardDraft>>({});
    const [rejectNotes, setRejectNotes] = useState<Record<string, string>>({});
    const [emailBusy, setEmailBusy] = useState<Record<string, boolean>>({});

    const getNoCardDraft = (requestId: string, defaultName: string) => {
        return noCardDrafts[requestId] ?? { customerType: 'individual', companyName: defaultName, registrationNumber: '', cardNumber: '' };
    };

    useEffect(() => {
        const missing = noCardRequests.find((request) => !noCardDrafts[request.id]);
        if (!missing) return;
        let cancelled = false;
        void fetchNextCardNumber().then((cardNumber) => {
            if (cancelled) return;
            setNoCardDrafts((prev) => prev[missing.id] ? prev : {
                ...prev,
                [missing.id]: { customerType: 'individual', companyName: missing.name || missing.email, registrationNumber: '', cardNumber },
            });
        });
        return () => { cancelled = true; };
    }, [noCardRequests, noCardDrafts]);

    const regenerateCardNumber = async (requestId: string) => {
        const cardNumber = await fetchNextCardNumber();
        if (!cardNumber) return;
        setNoCardDrafts((prev) => ({
            ...prev,
            [requestId]: { ...prev[requestId], cardNumber },
        }));
    };

    const handleApproveNoCardRequest = async (requestId: string, email: string) => {
        const draft = noCardDrafts[requestId];
        if (!draft) return;
        const digits = draft.cardNumber.replace(/\D/g, '');
        if (digits.length < 4 || digits.length > 6) {
            setFormError('Номер карты должен содержать от 4 до 6 цифр.');
            return;
        }
        const registrationNumber = draft.registrationNumber.replace(/\D/g, '');
        if (draft.customerType === 'company' && (!draft.companyName.trim() || registrationNumber.length !== 11)) {
            setFormError('Для юрлица укажите название и регистрационный номер из 11 цифр.');
            return;
        }
        setEmailBusy((prev) => ({ ...prev, [requestId]: true }));
        try {
            // Сервер создаёт спящий аккаунт с картой — клиент сразу попадает
            // в список держателей на /admin/invitations
            const res = await fetch(`/api/admin/access-requests/${encodeURIComponent(requestId)}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'approved', cardNumber: digits, customerType: draft.customerType, companyName: draft.customerType === 'company' ? draft.companyName.trim() : undefined, registrationNumber: draft.customerType === 'company' ? registrationNumber : undefined }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
                if (res.status === 502 && json.emailStatus === 'error') {
                    setNoCardDrafts((prev) => { const next = { ...prev }; delete next[requestId]; return next; });
                    setFormError('');
                    setMessage(`Карта выдана: ${digits}, но письмо не отправлено. Повторите отправку в разделе «Приглашения».`);
                    return;
                }
                setFormError(
                    json.error === 'card_taken'
                        ? `Номер ${digits} уже занят — укажите другой.`
                        : json.error === 'user_has_card'
                        ? `У клиента уже есть карта №${json.cardNumber}.`
                        : 'Не удалось одобрить заявку'
                );
                setMessage('');
                return;
            }
            setNoCardDrafts((prev) => { const next = { ...prev }; delete next[requestId]; return next; });
            setMessage(`Карта выдана: ${digits}. Одноразовое приглашение отправлено на ${email}.`);
            setFormError('');
        } finally {
            setEmailBusy((prev) => { const next = { ...prev }; delete next[requestId]; return next; });
            await loadNoCardRequests();
            await loadCardHolders();
        }
    };

    const getClientEdit = (holder: CardHolder) => clientEdits[holder.id] ?? {
        customerType: holder.customerType === 'company' ? 'company' : 'individual',
        registrationNumber: holder.registrationNumber ?? '',
    };

    const handleSaveClientDetails = async (holder: CardHolder) => {
        const edit = getClientEdit(holder);
        const registrationNumber = edit.registrationNumber.replace(/\D/g, '');
        if (edit.customerType === 'company' && registrationNumber.length !== 11) {
            setFormError('Регистрационный номер юрлица должен содержать 11 цифр.');
            return;
        }
        setClientSaveBusy(holder.id);
        try {
            const response = await fetch('/api/admin/users', {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: holder.id, expectedUpdatedAt: holder.updatedAt, customerType: edit.customerType, registrationNumber: edit.customerType === 'company' ? registrationNumber : null }),
            });
            const payload = await response.json().catch(() => null);
            if (!response.ok) throw new Error(payload?.error ?? 'client_update_failed');
            setMessage('Данные клиента обновлены.');
            setFormError('');
            await loadCardHolders();
        } catch (cause) {
            setFormError(cause instanceof Error ? cause.message : 'Не удалось обновить клиента.');
        } finally {
            setClientSaveBusy(null);
        }
    };

    const handleRejectNoCardRequest = async (requestId: string, email: string, name: string) => {
        const note = rejectNotes[requestId]?.trim() || undefined;
        setEmailBusy((prev) => ({ ...prev, [requestId]: true }));
        try {
            const res = await fetch(`/api/admin/access-requests/${encodeURIComponent(requestId)}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'rejected', reviewNote: note ?? 'Отклонено администратором' }),
            });
            if (!res.ok) {
                setFormError('Не удалось отклонить заявку');
                setMessage('');
                return;
            }
            try {
                await fetch('/api/admin/card-request', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'reject', email, name, note, language: noCardRequests.find(r => r.id === requestId)?.language ?? 'ru' }),
                });
                setMessage(`Заявка отклонена. Уведомление отправлено на ${email}.`);
            } catch {
                setMessage('Заявка отклонена. Не удалось отправить уведомление.');
            }
            setFormError('');
        } finally {
            setEmailBusy((prev) => { const next = { ...prev }; delete next[requestId]; return next; });
            setRejectNotes((prev) => { const next = { ...prev }; delete next[requestId]; return next; });
            await loadNoCardRequests();
        }
    };

      return { t, language, l, tl, formError, setFormError, message, setMessage, search, setSearch, customerType, setCustomerType, cardHoldersPage, setCardHoldersPage, cardHolders, cardHoldersTotal, cardHoldersLoading, cardHoldersError, clientEdits, setClientEdits, clientSaveBusy, getClientEdit, handleSaveClientDetails, noCardRequests, setNoCardRequests, loadNoCardRequests, noCardDrafts, setNoCardDrafts, rejectNotes, setRejectNotes, emailBusy, setEmailBusy, getNoCardDraft, regenerateCardNumber, handleApproveNoCardRequest, handleRejectNoCardRequest }
}

export function useAdminClientBarcodesPage(): ReturnType<typeof useAdminClientBarcodesPageState> {
  return useAdminClientBarcodesPageState()
}
