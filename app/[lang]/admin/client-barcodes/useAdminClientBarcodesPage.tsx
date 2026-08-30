'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from '@/lib/use-translation';
import {
    createNoCardDraft,
    getCardHolderEdit,
    isValidCardNumber,
    isValidCompanyDraft,
    normalizeCardDigits,
    normalizeRegistrationNumber,
    type CardHolder,
    type NoCardDraft,
    type NoCardRequest,
} from './client-barcodes-model';

export type { CardHolder } from './client-barcodes-model';

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

function useAdminClientBarcodesPageState(registeredOnly: boolean) {
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
    const [clientEdits, setClientEdits] = useState<Record<string, { name: string; email: string; phone: string; customerType: 'individual' | 'company'; registrationNumber: string }>>({});
    const [clientSaveBusy, setClientSaveBusy] = useState<string | null>(null);

    useEffect(() => {
        const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
        return () => window.clearTimeout(timer);
    }, [search]);

    const loadCardHolders = useCallback(async () => {
        setCardHoldersLoading(true);
        try {
            const params = new URLSearchParams({ take: '50', hasCard: '1' });
            if (registeredOnly) params.set('registration', 'registered');
            params.set('skip', String(cardHoldersPage * 50));
            if (debouncedSearch) params.set('search', debouncedSearch);
            if (customerType !== 'all') params.set('customerType', customerType);
            const res = await fetch(`/api/admin/users?${params}`, { cache: 'no-store' });
            const data = await res.json().catch(() => null);
            if (res.status === 401) {
                window.location.assign('/auth/login?admin=1');
                return;
            }
            if (res.status === 403) throw new Error(language === 'ru' ? 'Недостаточно прав для просмотра карт клиентов.' : language === 'lv' ? 'Nav pietiekamu tiesību klientu karšu skatīšanai.' : 'Insufficient permission to view client cards.');
            if (!res.ok) throw new Error(data?.error ? `API: ${data.error}` : `API HTTP ${res.status}`);
            if (Array.isArray(data.users)) {
                setCardHolders(data.users);
                setCardHoldersTotal(data.total ?? data.users.length);
                setCardHoldersError('');
            }
        } catch (cause) {
            setCardHoldersError(cause instanceof Error ? cause.message : (language === 'ru' ? 'Не удалось загрузить карты клиентов.' : language === 'lv' ? 'Neizdevās ielādēt klientu kartes.' : 'Failed to load client cards.'));
        } finally {
            setCardHoldersLoading(false);
        }
    }, [debouncedSearch, customerType, cardHoldersPage, language, registeredOnly]);

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
        return noCardDrafts[requestId] ?? createNoCardDraft(defaultName);
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
        const digits = normalizeCardDigits(draft.cardNumber);
        if (!isValidCardNumber(digits)) {
            setFormError(l('Номер карты должен содержать от 4 до 6 цифр.', 'The card number must contain 4 to 6 digits.', 'Kartes numurā jābūt no 4 līdz 6 cipariem.'));
            return;
        }
        const registrationNumber = normalizeRegistrationNumber(draft.registrationNumber);
        if (!isValidCompanyDraft(draft)) {
            setFormError(l('Для юрлица укажите название и регистрационный номер из 11 цифр.', 'For a company, specify its name and an 11-digit registration number.', 'Uzņēmumam norādiet nosaukumu un 11 ciparu reģistrācijas numuru.'));
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
                    setMessage(l(`Карта выдана: ${digits}, но письмо не отправлено. Повторите отправку в разделе «Приглашения».`, `Card ${digits} was issued, but the email was not sent. Try again in Invitations.`, `Karte ${digits} ir izsniegta, bet e-pasts netika nosūtīts. Mēģiniet vēlreiz sadaļā Ielūgumi.`));
                    return;
                }
                setFormError(
                    json.error === 'card_taken'
                        ? l(`Номер ${digits} уже занят — укажите другой.`, `Number ${digits} is already in use — specify another.`, `Numurs ${digits} jau tiek izmantots — norādiet citu.`)
                        : json.error === 'user_has_card'
                        ? l(`У клиента уже есть карта №${json.cardNumber}.`, `The customer already has card No. ${json.cardNumber}.`, `Klientam jau ir karte Nr. ${json.cardNumber}.`)
                        : l('Не удалось одобрить заявку', 'Failed to approve the application', 'Neizdevās apstiprināt pieteikumu')
                );
                setMessage('');
                return;
            }
            setNoCardDrafts((prev) => { const next = { ...prev }; delete next[requestId]; return next; });
            setMessage(l(`Карта выдана: ${digits}. Одноразовое приглашение отправлено на ${email}.`, `Card ${digits} was issued. A one-time invitation was sent to ${email}.`, `Karte ${digits} ir izsniegta. Vienreizējs ielūgums nosūtīts uz ${email}.`));
            setFormError('');
        } finally {
            setEmailBusy((prev) => { const next = { ...prev }; delete next[requestId]; return next; });
            await loadNoCardRequests();
            await loadCardHolders();
        }
    };

    const getClientEdit = (holder: CardHolder) => clientEdits[holder.id] ?? getCardHolderEdit(holder);

    const handleSaveClientDetails = async (holder: CardHolder) => {
        const edit = getClientEdit(holder);
        const registrationNumber = normalizeRegistrationNumber(edit.registrationNumber);
        if (edit.customerType === 'company' && registrationNumber.length !== 11) {
            setFormError(l('Регистрационный номер юрлица должен содержать 11 цифр.', 'The company registration number must contain 11 digits.', 'Uzņēmuma reģistrācijas numurā jābūt 11 cipariem.'));
            return;
        }
        setClientSaveBusy(holder.id);
        try {
            const response = await fetch('/api/admin/users', {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: holder.id,
                    expectedUpdatedAt: holder.updatedAt,
                    name: edit.name.trim() || null,
                    ...(edit.email.trim() ? { email: edit.email.trim().toLowerCase() } : {}),
                    phone: edit.phone.trim() || null,
                    customerType: edit.customerType,
                    registrationNumber: edit.customerType === 'company' ? registrationNumber : null,
                }),
            });
            const payload = await response.json().catch(() => null);
            if (!response.ok) throw new Error(payload?.error ?? 'client_update_failed');
            setMessage(l('Данные клиента обновлены.', 'Customer details updated.', 'Klienta dati atjaunināti.'));
            setFormError('');
            await loadCardHolders();
        } catch (cause) {
            setFormError(cause instanceof Error ? cause.message : l('Не удалось обновить клиента.', 'Failed to update the customer.', 'Neizdevās atjaunināt klienta datus.'));
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
                body: JSON.stringify({ status: 'rejected', reviewNote: note ?? l('Отклонено администратором', 'Rejected by administrator', 'Administrators noraidīja') }),
            });
            if (!res.ok) {
                setFormError(l('Не удалось отклонить заявку', 'Failed to reject the application', 'Neizdevās noraidīt pieteikumu'));
                setMessage('');
                return;
            }
            try {
                await fetch('/api/admin/card-request', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'reject', email, name, note, language: noCardRequests.find(r => r.id === requestId)?.language ?? 'ru' }),
                });
                setMessage(l(`Заявка отклонена. Уведомление отправлено на ${email}.`, `Application rejected. A notification was sent to ${email}.`, `Pieteikums noraidīts. Paziņojums nosūtīts uz ${email}.`));
            } catch {
                setMessage(l('Заявка отклонена. Не удалось отправить уведомление.', 'Application rejected. Failed to send the notification.', 'Pieteikums noraidīts. Paziņojumu neizdevās nosūtīt.'));
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

export function useAdminClientBarcodesPage(registeredOnly = true): ReturnType<typeof useAdminClientBarcodesPageState> {
  return useAdminClientBarcodesPageState(registeredOnly)
}
