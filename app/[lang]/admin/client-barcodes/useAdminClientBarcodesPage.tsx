'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from '@/lib/use-translation';
import { useAuthStore } from '@/lib/auth-store';
import {
    buildClientDetailsPatch,
    classifyClientSaveFailure,
    getCardHolderEdit,
    isCompleteClientStepUp,
    normalizeRegistrationNumber,
    type CardHolder,
    type CardHolderEdit,
    type ClientSaveFailure,
    type ClientStepUp,
} from './client-barcodes-model';

export type { CardHolder } from './client-barcodes-model';

function useAdminClientBarcodesPageState(registeredOnly: boolean) {
    const { t, language } = useTranslation();
    // Bank and IBAN are admin-only; the server enforces it, this only avoids a guaranteed 403.
    const canEditBankDetails = useAuthStore((s) => s.user?.platformRole === 'admin');
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
    const [clientEdits, setClientEdits] = useState<Record<string, CardHolderEdit>>({});
    const [clientSaveBusy, setClientSaveBusy] = useState<string | null>(null);
    // Save errors are shown next to the row: the page-level banner is often scrolled out of view,
    // and the edited value stays in the input, so a failed save looked like a successful one.
    const [clientRowErrors, setClientRowErrors] = useState<Record<string, string>>({});

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

    const getClientEdit = (holder: CardHolder) => clientEdits[holder.id] ?? getCardHolderEdit(holder);

    const setClientRowError = (holderId: string, error: string) =>
        setClientRowErrors((prev) => {
            const next = { ...prev };
            if (error) next[holderId] = error;
            else delete next[holderId];
            return next;
        });

    const clientSaveErrorText = (failure: ClientSaveFailure, status: number) => {
        switch (failure) {
            case 'email_taken':
                return l('Не сохранено: этот email уже есть у другого клиента. Найдите его поиском по email.', 'Not saved: this email already belongs to another customer. Search by email to find them.', 'Nav saglabāts: šis e-pasts jau pieder citam klientam. Atrodiet to, meklējot pēc e-pasta.');
            case 'invalid':
                return l('Не сохранено: проверьте данные (например, формат email).', 'Not saved: check the entered data (e.g. the email format).', 'Nav saglabāts: pārbaudiet ievadītos datus (piem., e-pasta formātu).');
            case 'conflict':
                return l('Не сохранено: данные клиента только что изменились. Обновите страницу и повторите.', 'Not saved: the customer was just changed. Reload the page and try again.', 'Nav saglabāts: klienta dati tikko mainījās. Pārlādējiet lapu un mēģiniet vēlreiz.');
            case 'staff_account':
                return l('Не сохранено: это аккаунт сотрудника — изменить его может только Super Admin.', 'Not saved: this is a staff account — only a Super Admin can edit it.', 'Nav saglabāts: šis ir darbinieka konts — to var labot tikai Super Admin.');
            case 'forbidden':
                return l('Не сохранено: недостаточно прав для изменения этого аккаунта.', 'Not saved: insufficient permission to edit this account.', 'Nav saglabāts: nepietiek tiesību šī konta labošanai.');
            case 'step_up_required':
                return l('Это аккаунт сотрудника: подтвердите изменение паролем, кодом 2FA и причиной.', 'This is a staff account: confirm the change with your password, 2FA code and a reason.', 'Šis ir darbinieka konts: apstipriniet izmaiņas ar paroli, 2FA kodu un iemeslu.');
            case 'step_up_failed':
                return l('Неверный пароль или код из приложения.', 'Invalid password or app code.', 'Nederīga parole vai lietotnes kods.');
            case 'session_expired':
                return l('Не сохранено: сессия истекла. Войдите в админ-панель снова.', 'Not saved: your session has expired. Sign in to the admin panel again.', 'Nav saglabāts: sesija ir beigusies. Piesakieties administrēšanas panelī vēlreiz.');
            case 'origin_rejected':
                return l('Не сохранено: запрос отклонён проверкой адреса сайта. Откройте админ-панель по основному адресу сайта (без www) и повторите.', 'Not saved: the request was rejected by the site address check. Open the admin panel on the main site address (without www) and try again.', 'Nav saglabāts: pieprasījumu noraidīja vietnes adreses pārbaude. Atveriet administrēšanas paneli galvenajā vietnes adresē (bez www) un mēģiniet vēlreiz.');
            case 'not_found':
                return l('Не сохранено: клиент не найден. Обновите страницу.', 'Not saved: the customer was not found. Reload the page.', 'Nav saglabāts: klients nav atrasts. Pārlādējiet lapu.');
            case 'rate_limited':
                return l('Не сохранено: слишком много попыток. Подождите и повторите.', 'Not saved: too many attempts. Wait and try again.', 'Nav saglabāts: pārāk daudz mēģinājumu. Uzgaidiet un mēģiniet vēlreiz.');
            default:
                return l(`Не сохранено: не удалось обновить клиента (HTTP ${status}).`, `Not saved: failed to update the customer (HTTP ${status}).`, `Nav saglabāts: neizdevās atjaunināt klienta datus (HTTP ${status}).`);
        }
    };

    // Step-up for staff accounts: the server demands the acting Super Admin's own password,
    // TOTP code and a reason. They are kept only in memory for this one request.
    const [clientStepUp, setClientStepUp] = useState<(ClientStepUp & { holderId: string; error: string }) | null>(null);
    const closeClientStepUp = () => setClientStepUp(null);

    const handleSaveClientDetails = async (holder: CardHolder, stepUp?: ClientStepUp) => {
        const edit = getClientEdit(holder);
        const registrationNumber = normalizeRegistrationNumber(edit.registrationNumber);
        if (edit.customerType === 'company' && registrationNumber.length !== 11) {
            const error = l('Регистрационный номер юрлица должен содержать 11 цифр.', 'The company registration number must contain 11 digits.', 'Uzņēmuma reģistrācijas numurā jābūt 11 cipariem.');
            setFormError(error);
            setClientRowError(holder.id, error);
            return;
        }
        setClientRowError(holder.id, '');
        setClientSaveBusy(holder.id);
        try {
            const response = await fetch('/api/admin/users', {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: holder.id,
                    expectedUpdatedAt: holder.updatedAt,
                    ...buildClientDetailsPatch(edit, { canEditBankDetails }),
                    ...(stepUp ? { currentPassword: stepUp.currentPassword, mfaCode: stepUp.mfaCode.trim(), reason: stepUp.reason.trim() } : {}),
                }),
            });
            const payload = await response.json().catch(() => null);
            if (!response.ok) {
                const failure = classifyClientSaveFailure(response.status, typeof payload?.error === 'string' ? payload.error : undefined);
                const error = clientSaveErrorText(failure, response.status);
                if (failure === 'step_up_required' || failure === 'step_up_failed') {
                    // Keep the draft and ask (again) for the confirmation instead of a dead-end error.
                    setClientStepUp((prev) => ({
                        holderId: holder.id,
                        currentPassword: prev?.holderId === holder.id ? prev.currentPassword : '',
                        mfaCode: '',
                        reason: prev?.holderId === holder.id ? prev.reason : '',
                        error: failure === 'step_up_failed' ? error : '',
                    }));
                    setClientRowError(holder.id, error);
                    setMessage('');
                    return;
                }
                closeClientStepUp();
                setFormError(error);
                setMessage('');
                setClientRowError(holder.id, error);
                return;
            }
            closeClientStepUp();
            setMessage(l('Данные клиента обновлены.', 'Customer details updated.', 'Klienta dati atjaunināti.'));
            setFormError('');
            // Drop the draft so the row shows what the server actually stored.
            setClientEdits((prev) => {
                const next = { ...prev };
                delete next[holder.id];
                return next;
            });
            await loadCardHolders();
        } catch {
            const error = l('Не сохранено: нет связи с сервером. Повторите.', 'Not saved: no connection to the server. Try again.', 'Nav saglabāts: nav savienojuma ar serveri. Mēģiniet vēlreiz.');
            setFormError(error);
            setMessage('');
            setClientRowError(holder.id, error);
        } finally {
            setClientSaveBusy(null);
        }
    };

    const submitClientStepUp = async () => {
        if (!clientStepUp || !isCompleteClientStepUp(clientStepUp)) return;
        const holder = cardHolders.find((candidate) => candidate.id === clientStepUp.holderId);
        if (!holder) {
            closeClientStepUp();
            return;
        }
        await handleSaveClientDetails(holder, clientStepUp);
    };

      return { t, language, l, tl, formError, setFormError, message, setMessage, search, setSearch, customerType, setCustomerType, cardHoldersPage, setCardHoldersPage, cardHolders, loadCardHolders, cardHoldersTotal, cardHoldersLoading, cardHoldersError, clientEdits, setClientEdits, canEditBankDetails, clientSaveBusy, clientRowErrors, getClientEdit, handleSaveClientDetails, clientStepUp, setClientStepUp, closeClientStepUp, submitClientStepUp }
}

export function useAdminClientBarcodesPage(registeredOnly = true): ReturnType<typeof useAdminClientBarcodesPageState> {
  return useAdminClientBarcodesPageState(registeredOnly)
}
