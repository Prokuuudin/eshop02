'use client';

import { useCallback, useEffect, useState } from 'react';
import {
    createNoCardDraft,
    isValidCardNumber,
    isValidCompanyDraft,
    normalizeCardDigits,
    normalizeRegistrationNumber,
    type NoCardDraft,
    type NoCardRequest,
} from './client-barcodes/client-barcodes-model';

type Localize = (ru: string, en: string, lv: string) => string;

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

/** Заявки клиентов без карты: проверка, выдача номера карты или отказ. */
function useCardRequestsPanelState(l: Localize, enabled: boolean, onChanged?: () => void | Promise<void>) {
    const [formError, setFormError] = useState('');
    const [message, setMessage] = useState('');

    // Заявки — из Neon, не из localStorage: клиент подаёт заявку со
    // своего браузера, локальный store админа её не видит
    const [noCardRequests, setNoCardRequests] = useState<NoCardRequest[]>([]);
    const loadNoCardRequests = useCallback(async () => {
        if (!enabled) return;
        try {
            const res = await fetch('/api/admin/access-requests?status=pending', { cache: 'no-store' });
            if (!res.ok) return;
            const json = await res.json();
            setNoCardRequests(
                ((json.requests ?? []) as NoCardRequest[]).filter((r) => r.requestType === 'no-card')
            );
        } catch { /* сеть — оставляем прежний список */ }
    }, [enabled]);
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
                        : json.error === 'staff_account'
                        ? l('Email заявки принадлежит сотруднику — заявку нельзя одобрить.', 'The application email belongs to a staff account — it cannot be approved.', 'Pieteikuma e-pasts pieder darbiniekam — to nevar apstiprināt.')
                        : json.error === 'already_decided'
                        ? l('Заявка уже обработана. Список обновлён.', 'The application has already been processed. The list has been refreshed.', 'Pieteikums jau ir apstrādāts. Saraksts ir atjaunināts.')
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
            await onChanged?.();
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
                const json = await res.json().catch(() => ({}));
                setFormError(json.error === 'already_decided'
                    ? l('Заявка уже обработана. Список обновлён.', 'The application has already been processed. The list has been refreshed.', 'Pieteikums jau ir apstrādāts. Saraksts ir atjaunināts.')
                    : l('Не удалось отклонить заявку', 'Failed to reject the application', 'Neizdevās noraidīt pieteikumu'));
                setMessage('');
                return;
            }
            try {
                // One key per admin action: a technical retry is replayed by the
                // server instead of sending the rejection email twice.
                const notify = await fetch('/api/admin/card-request', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
                    body: JSON.stringify({ action: 'reject', accessRequestId: requestId, email, name, note, language: noCardRequests.find(r => r.id === requestId)?.language ?? 'ru' }),
                });
                if (!notify.ok) throw new Error('rejection_email_failed');
                setMessage(l(`Заявка отклонена. Уведомление отправлено на ${email}.`, `Application rejected. A notification was sent to ${email}.`, `Pieteikums noraidīts. Paziņojums nosūtīts uz ${email}.`));
            } catch {
                setMessage(l('Заявка отклонена. Не удалось отправить уведомление.', 'Application rejected. Failed to send the notification.', 'Pieteikums noraidīts. Paziņojumu neizdevās nosūtīt.'));
            }
            setFormError('');
        } finally {
            setEmailBusy((prev) => { const next = { ...prev }; delete next[requestId]; return next; });
            setRejectNotes((prev) => { const next = { ...prev }; delete next[requestId]; return next; });
            await loadNoCardRequests();
            await onChanged?.();
        }
    };

    return { formError, message, noCardRequests, setNoCardDrafts, rejectNotes, setRejectNotes, emailBusy, getNoCardDraft, regenerateCardNumber, handleApproveNoCardRequest, handleRejectNoCardRequest };
}

export function useCardRequestsPanel(l: Localize, enabled: boolean, onChanged?: () => void | Promise<void>): ReturnType<typeof useCardRequestsPanelState> {
    return useCardRequestsPanelState(l, enabled, onChanged);
}
