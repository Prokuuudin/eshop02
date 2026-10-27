'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useTranslation } from '@/lib/use-translation';
import type { CustomerCanonical } from '@/lib/admin/customer-edit-model';
import type { CustomerRecord } from '@/lib/admin/customer-edit';
import {
    buildCustomerEditRequest,
    customerDraftFrom,
    type CustomerDraft,
} from '@/lib/admin/customer-edit-draft';

type Props = {
    customerId: string | null;
    onClose: () => void;
    onSaved: () => void;
};

type ServerError = { error?: string; details?: unknown };
type Confirmations = { duplicates: boolean; guestOrders: boolean; companyScope: 'user_only' | 'shared_company' | null };

const TEXT_FIELDS: Array<{ field: keyof CustomerCanonical; ru: string; en: string; lv: string; mono?: boolean }> = [
    { field: 'firstName', ru: 'Имя', en: 'First name', lv: 'Vārds' },
    { field: 'lastName', ru: 'Фамилия', en: 'Last name', lv: 'Uzvārds' },
    { field: 'email', ru: 'Email', en: 'Email', lv: 'E-pasts' },
    { field: 'phone', ru: 'Телефон', en: 'Phone', lv: 'Tālrunis' },
    { field: 'cardNumber', ru: 'Номер карты', en: 'Card number', lv: 'Kartes numurs', mono: true },
];
const COMPANY_FIELDS: typeof TEXT_FIELDS = [
    { field: 'companyName', ru: 'Название компании', en: 'Company name', lv: 'Uzņēmuma nosaukums' },
    { field: 'registrationNumber', ru: 'Рег. номер (11 цифр)', en: 'Reg. number (11 digits)', lv: 'Reģ. numurs (11 cipari)', mono: true },
    { field: 'vatNumber', ru: 'PVN номер', en: 'VAT number', lv: 'PVN numurs', mono: true },
    { field: 'legalAddress', ru: 'Юр. адрес', en: 'Legal address', lv: 'Juridiskā adrese' },
];
const DELIVERY_FIELDS: typeof TEXT_FIELDS = [
    { field: 'address', ru: 'Адрес доставки', en: 'Delivery address', lv: 'Piegādes adrese' },
    { field: 'city', ru: 'Город', en: 'City', lv: 'Pilsēta' },
    { field: 'postalCode', ru: 'Индекс', en: 'Postal code', lv: 'Pasta indekss' },
    { field: 'bankName', ru: 'Банк', en: 'Bank', lv: 'Banka' },
    { field: 'iban', ru: 'IBAN', en: 'IBAN', lv: 'IBAN', mono: true },
];
const ADDRESS_FIELDS = ['firstName', 'lastName', 'phone', 'address', 'city', 'postalCode'] as const;

export default function AdminCustomerEditDialog({ customerId, onClose, onSaved }: Props): React.ReactElement {
    const { language } = useTranslation();
    const l = useCallback((ru: string, en: string, lv: string) => (language === 'ru' ? ru : language === 'lv' ? lv : en), [language]);

    const [record, setRecord] = useState<CustomerRecord | null>(null);
    const [canEdit, setCanEdit] = useState(false);
    const [draft, setDraft] = useState<CustomerDraft | null>(null);
    const [reason, setReason] = useState('');
    const [currentPassword, setCurrentPassword] = useState('');
    const [mfaCode, setMfaCode] = useState('');
    const [confirm, setConfirm] = useState<Confirmations>({ duplicates: false, guestOrders: false, companyScope: null });
    const [pending, setPending] = useState<ServerError | null>(null);
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    const load = useCallback(async (keepDraft: boolean) => {
        if (!customerId) return;
        const response = await fetch(`/api/admin/customers/${encodeURIComponent(customerId)}`, { cache: 'no-store' });
        const payload = await response.json().catch(() => null) as { customer?: CustomerRecord; canEdit?: boolean; error?: string } | null;
        if (!response.ok || !payload?.customer) {
            setError(payload?.error === 'staff_account'
                ? l('Это аккаунт сотрудника — он редактируется в разделе управления персоналом.', 'This is a staff account — edit it in staff management.', 'Šis ir darbinieka konts — to rediģē personāla pārvaldībā.')
                : l('Не удалось загрузить клиента.', 'Failed to load the customer.', 'Neizdevās ielādēt klientu.'));
            return;
        }
        setRecord(payload.customer);
        setCanEdit(payload.canEdit === true);
        if (!keepDraft) setDraft(customerDraftFrom(payload.customer));
    }, [customerId, l]);

    // The parent remounts the dialog per customer (key), so state starts fresh here.
    useEffect(() => {
        if (customerId) queueMicrotask(() => void load(false));
    }, [customerId, load]);

    const request = record && draft ? buildCustomerEditRequest(record, draft) : null;
    const emailChanging = request?.changes.email !== undefined;
    const hasChanges = !!request && (Object.keys(request.changes).length > 0 || request.savedAddresses.length > 0);

    const errorText = (code: string): string => ({
        required: l('Обязательное поле', 'Required', 'Obligāts lauks'),
        invalid_email: l('Неверный email', 'Invalid email', 'Nederīgs e-pasts'),
        synthetic_email_forbidden: l('Служебный адрес @client.local нельзя назначить', 'A @client.local service address cannot be assigned', '@client.local adresi nevar piešķirt'),
        invalid_phone: l('Неверный телефон', 'Invalid phone', 'Nederīgs tālrunis'),
        invalid_card_number: l('Номер карты: 1–6 цифр', 'Card number: 1–6 digits', 'Kartes numurs: 1–6 cipari'),
        invalid_registration_number: l('Нужно 11 цифр', '11 digits required', 'Nepieciešami 11 cipari'),
        invalid_vat_number: l('Формат: LV + цифры', 'Format: LV + digits', 'Formāts: LV + cipari'),
        invalid_iban: l('Неверный IBAN', 'Invalid IBAN', 'Nederīgs IBAN'),
        invalid_characters: l('Недопустимые символы', 'Invalid characters', 'Nederīgas rakstzīmes'),
        name_encoding_suspect: l('Похоже на испорченную кодировку (BUG-001)', 'Looks like broken encoding (BUG-001)', 'Izskatās pēc bojāta kodējuma (BUG-001)'),
    } as Record<string, string>)[code] ?? code;

    const save = async () => {
        if (!record || !draft || !request || !customerId) return;
        if (reason.trim().length < 5) {
            setError(l('Укажите причину изменения (минимум 5 символов).', 'Enter the reason for the change (at least 5 characters).', 'Norādiet izmaiņu iemeslu (vismaz 5 rakstzīmes).'));
            return;
        }
        setBusy(true);
        setError('');
        setFieldErrors({});
        try {
            const response = await fetch(`/api/admin/customers/${encodeURIComponent(customerId)}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    expectedUpdatedAt: record.updatedAt,
                    reason: reason.trim(),
                    changes: request.changes,
                    ...(request.savedAddresses.length ? { savedAddresses: request.savedAddresses } : {}),
                    ...(record.company ? { expectedCompanyUpdatedAt: record.company.updatedAt } : {}),
                    ...(confirm.companyScope ? { companyScope: confirm.companyScope } : {}),
                    ...(confirm.duplicates ? { confirmDuplicates: true } : {}),
                    ...(confirm.guestOrders ? { guestOrdersBelongToCustomer: true } : {}),
                    ...(emailChanging ? { currentPassword, mfaCode: mfaCode.trim() } : {}),
                }),
            });
            const payload = await response.json().catch(() => ({})) as ServerError;
            if (response.ok) {
                onSaved();
                onClose();
                return;
            }
            const code = payload.error ?? 'server_error';
            if (code === 'validation_failed' && Array.isArray(payload.details)) {
                setFieldErrors(Object.fromEntries((payload.details as Array<{ field: string; code: string }>).map((item) => [item.field, errorText(item.code)])));
                setError(l('Исправьте отмеченные поля.', 'Fix the highlighted fields.', 'Izlabojiet atzīmētos laukus.'));
            } else if (['duplicate_confirmation_required', 'guest_orders_confirmation_required', 'company_scope_required'].includes(code)) {
                setPending(payload);
            } else if (code === 'optimistic_conflict' || code === 'company_conflict' || code === 'address_conflict' || code === 'concurrent_update') {
                await load(true);
                setError(l('Данные клиента изменились, пока форма была открыта. Карточка обновлена, ваши правки сохранены в форме — проверьте и сохраните ещё раз.', 'The customer changed while the form was open. The card was reloaded and your edits kept — review and save again.', 'Klienta dati mainījās, kamēr forma bija atvērta. Kartīte atjaunināta, jūsu labojumi saglabāti formā — pārbaudiet un saglabājiet vēlreiz.'));
            } else {
                setError(({
                    reauthentication_required: l('Для смены email введите свой пароль и код TOTP.', 'Enter your password and TOTP code to change the email.', 'E-pasta maiņai ievadiet savu paroli un TOTP kodu.'),
                    reauthentication_failed: l('Неверный пароль или код TOTP.', 'Wrong password or TOTP code.', 'Nepareiza parole vai TOTP kods.'),
                    too_many_attempts: l('Слишком много попыток. Повторите через 15 минут.', 'Too many attempts. Try again in 15 minutes.', 'Pārāk daudz mēģinājumu. Mēģiniet pēc 15 minūtēm.'),
                    email_taken: l('Этот email уже у другого аккаунта.', 'This email belongs to another account.', 'Šis e-pasts pieder citam kontam.'),
                    card_taken: l('Номер карты занят (другой клиент, компания, приглашение или заявка).', 'The card number is taken (another customer, company, invitation or application).', 'Kartes numurs ir aizņemts.'),
                    staff_account: l('Аккаунт сотрудника редактируется только Super Admin.', 'Staff accounts are edited by a Super Admin only.', 'Darbinieku kontus rediģē tikai Super Admin.'),
                    no_changes: l('Нет изменений.', 'No changes.', 'Nav izmaiņu.'),
                    forbidden: l('Недостаточно прав.', 'Insufficient permission.', 'Nepietiekamas tiesības.'),
                } as Record<string, string>)[code] ?? l(`Не удалось сохранить (${code}).`, `Save failed (${code}).`, `Neizdevās saglabāt (${code}).`));
            }
        } finally {
            setBusy(false);
        }
    };

    const setField = (field: keyof CustomerCanonical, value: string) => setDraft((prev) => prev ? { ...prev, fields: { ...prev.fields, [field]: value } } : prev);
    const renderField = ({ field, ru, en, lv, mono }: (typeof TEXT_FIELDS)[number]) => (
        <label key={field} className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">{l(ru, en, lv)}</span>
            <Input
                className={mono ? 'font-mono text-sm' : undefined}
                value={draft?.fields[field] ?? ''}
                disabled={!canEdit || busy}
                onChange={(e) => setField(field, e.target.value)}
                placeholder={field === 'email' && record?.emailIsSynthetic ? l('Не указан (служебный адрес)', 'Not set (service address)', 'Nav norādīts') : undefined}
            />
            {fieldErrors[field] && <span className="text-xs text-red-600 dark:text-red-400">{fieldErrors[field]}</span>}
        </label>
    );

    const details = pending?.details as { duplicates?: Array<{ field: string; cardNumber: string | null }>; guestOrders?: number; otherMembers?: number } | undefined;

    return (
        <Dialog open={customerId !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
            <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto p-6">
                <DialogTitle className="text-lg font-semibold">
                    {l('Карточка клиента', 'Customer card', 'Klienta kartīte')}{record?.canonical.cardNumber ? ` · ${record.canonical.cardNumber}` : ''}
                </DialogTitle>
                <DialogDescription className="text-sm text-muted-foreground">
                    {l('Изменения сохраняются одной операцией и записываются в журнал аудита. Заказы и счета не меняются.', 'Changes are saved as one operation and written to the audit log. Orders and invoices are not changed.', 'Izmaiņas saglabā vienā darbībā un ieraksta audita žurnālā. Pasūtījumi un rēķini netiek mainīti.')}
                </DialogDescription>

                {!record || !draft ? (
                    <p className="py-6 text-sm text-muted-foreground">{error || l('Загрузка...', 'Loading...', 'Ielāde...')}</p>
                ) : (
                    <div className="space-y-5">
                        <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
                            <span>{l('Бонусы', 'Bonuses', 'Bonusi')}: {record.bonusPoints}</span>
                            <span>{record.registered ? l('Зарегистрирован', 'Registered', 'Reģistrēts') : l('Не зарегистрирован', 'Not registered', 'Nav reģistrēts')}</span>
                            <span>{l('Заказов в аккаунте', 'Account orders', 'Konta pasūtījumi')}: {record.linkedOrders}</span>
                            {record.company && <span>{l('Компания', 'Company', 'Uzņēmums')}: {record.company.companyName}{record.company.otherMembers > 0 ? ` (${l('общая', 'shared', 'kopīgs')}: +${record.company.otherMembers})` : ''}</span>}
                        </div>
                        {Object.keys(record.profileDrift).length > 0 && (
                            <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
                                {l('В чекаут-профиле клиента другие значения (будут перезаписаны при сохранении)', 'The checkout profile holds different values (overwritten on save)', 'Pirkuma profilā ir citas vērtības (tiks pārrakstītas)')}: {Object.entries(record.profileDrift).map(([field, value]) => `${field}: ${value}`).join('; ')}
                            </p>
                        )}

                        <section className="grid gap-3 sm:grid-cols-2">{TEXT_FIELDS.map(renderField)}</section>

                        <section className="space-y-3">
                            <label className="block max-w-xs space-y-1">
                                <span className="text-xs font-medium text-muted-foreground">{l('Тип клиента', 'Customer type', 'Klienta veids')}</span>
                                <Select value={draft.fields.customerType} disabled={!canEdit || busy} onValueChange={(value) => setField('customerType', value)}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="individual">{l('Физлицо', 'Individual', 'Privātpersona')}</SelectItem>
                                        <SelectItem value="company">{l('Юрлицо', 'Company', 'Uzņēmums')}</SelectItem>
                                    </SelectContent>
                                </Select>
                            </label>
                            {draft.fields.customerType === 'company'
                                ? <div className="grid gap-3 sm:grid-cols-2">{COMPANY_FIELDS.map(renderField)}</div>
                                : record.canonical.customerType === 'company' && (
                                    <p className="text-xs text-amber-700 dark:text-amber-300">{l('При смене на физлицо реквизиты компании будут очищены у клиента (компания не меняется).', 'Switching to individual clears the customer\'s company requisites (the company itself is not changed).', 'Mainot uz privātpersonu, klienta uzņēmuma rekvizīti tiks notīrīti.')}</p>
                                )}
                        </section>

                        <section className="grid gap-3 sm:grid-cols-2">{DELIVERY_FIELDS.map(renderField)}</section>

                        {draft.savedAddresses.length > 0 && (
                            <section className="space-y-3">
                                <h3 className="text-sm font-semibold">{l('Сохранённые адреса клиента', 'Saved addresses', 'Saglabātās adreses')}</h3>
                                {draft.savedAddresses.map((address, index) => (
                                    <div key={address.id} className="grid gap-2 rounded-md border border-border p-3 sm:grid-cols-3">
                                        {ADDRESS_FIELDS.map((field) => (
                                            <label key={field} className="block space-y-1">
                                                <span className="text-xs text-muted-foreground">{field}</span>
                                                <Input
                                                    value={address[field] ?? ''}
                                                    disabled={!canEdit || busy}
                                                    onChange={(e) => setDraft((prev) => prev ? {
                                                        ...prev,
                                                        savedAddresses: prev.savedAddresses.map((item, i) => i === index ? { ...item, [field]: e.target.value } : item),
                                                    } : prev)}
                                                />
                                                {fieldErrors[`savedAddresses.${address.id}.${field}`] && <span className="text-xs text-red-600 dark:text-red-400">{fieldErrors[`savedAddresses.${address.id}.${field}`]}</span>}
                                            </label>
                                        ))}
                                    </div>
                                ))}
                            </section>
                        )}

                        {canEdit && (
                            <section className="space-y-3 border-t border-border pt-4">
                                <label className="block space-y-1">
                                    <span className="text-xs font-medium text-muted-foreground">{l('Причина изменения (обязательно)', 'Reason for the change (required)', 'Izmaiņu iemesls (obligāti)')}</span>
                                    <Textarea value={reason} disabled={busy} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={1000} />
                                </label>
                                {emailChanging && (
                                    <div className="grid gap-3 rounded-md border border-amber-300 p-3 sm:grid-cols-2 dark:border-amber-700">
                                        <p className="text-xs text-muted-foreground sm:col-span-2">{l('Смена email: подтвердите своим паролем и кодом TOTP. Сессии клиента, ссылки восстановления пароля и неиспользованные приглашения будут отозваны.', 'Email change: confirm with your password and TOTP code. The customer\'s sessions, password reset links and unused invitations will be revoked.', 'E-pasta maiņa: apstipriniet ar savu paroli un TOTP kodu. Klienta sesijas, paroles atjaunošanas saites un neizmantotie ielūgumi tiks atsaukti.')}</p>
                                        <Input type="password" autoComplete="current-password" value={currentPassword} disabled={busy} onChange={(e) => setCurrentPassword(e.target.value)} placeholder={l('Ваш пароль', 'Your password', 'Jūsu parole')} />
                                        <Input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={mfaCode} disabled={busy} onChange={(e) => setMfaCode(e.target.value)} placeholder="TOTP" />
                                    </div>
                                )}
                                {pending?.error === 'duplicate_confirmation_required' && (
                                    <div className="space-y-2 rounded-md border border-amber-300 p-3 text-xs dark:border-amber-700">
                                        <p>{l('Похожие клиенты (объединение не выполняется):', 'Similar customers (they are not merged):', 'Līdzīgi klienti (netiek apvienoti):')} {(details?.duplicates ?? []).map((item) => `${item.field} → ${l('карта', 'card', 'karte')} ${item.cardNumber ?? '—'}`).join(', ')}</p>
                                        <Checkbox checked={confirm.duplicates} onCheckedChange={(checked) => setConfirm((prev) => ({ ...prev, duplicates: checked }))} label={l('Это разные клиенты, сохранить', 'These are different customers, save anyway', 'Tie ir dažādi klienti, saglabāt')} />
                                    </div>
                                )}
                                {pending?.error === 'guest_orders_confirmation_required' && (
                                    <div className="space-y-2 rounded-md border border-amber-300 p-3 text-xs dark:border-amber-700">
                                        <p>{l(`С этим email есть гостевые заказы (${details?.guestOrders ?? 0}). После смены они станут видны клиенту.`, `There are guest orders with this email (${details?.guestOrders ?? 0}). After the change the customer will see them.`, `Ar šo e-pastu ir viesa pasūtījumi (${details?.guestOrders ?? 0}). Pēc maiņas klients tos redzēs.`)}</p>
                                        <Checkbox checked={confirm.guestOrders} onCheckedChange={(checked) => setConfirm((prev) => ({ ...prev, guestOrders: checked }))} label={l('Я проверил: эти заказы сделал этот клиент', 'I verified these orders were placed by this customer', 'Esmu pārbaudījis: šos pasūtījumus veica šis klients')} />
                                    </div>
                                )}
                                {pending?.error === 'company_scope_required' && (
                                    <div className="space-y-2 rounded-md border border-amber-300 p-3 text-xs dark:border-amber-700">
                                        <p>{l(`Компания общая ещё с ${details?.otherMembers ?? 0} клиентами. Где применить изменения реквизитов?`, `The company is shared with ${details?.otherMembers ?? 0} other customers. Where should the requisite changes apply?`, `Uzņēmums ir kopīgs ar vēl ${details?.otherMembers ?? 0} klientiem. Kur piemērot izmaiņas?`)}</p>
                                        <div className="flex flex-wrap gap-2">
                                            <Button size="sm" variant={confirm.companyScope === 'user_only' ? 'default' : 'outline'} onClick={() => setConfirm((prev) => ({ ...prev, companyScope: 'user_only' }))}>{l('Только этому клиенту', 'This customer only', 'Tikai šim klientam')}</Button>
                                            <Button size="sm" variant={confirm.companyScope === 'shared_company' ? 'default' : 'outline'} onClick={() => setConfirm((prev) => ({ ...prev, companyScope: 'shared_company' }))}>{l('И общей компании', 'Also the shared company', 'Arī kopīgajam uzņēmumam')}</Button>
                                        </div>
                                    </div>
                                )}
                            </section>
                        )}

                        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

                        <div className="flex justify-end gap-2">
                            <Button variant="outline" onClick={onClose} disabled={busy}>{l('Закрыть', 'Close', 'Aizvērt')}</Button>
                            {canEdit && <Button onClick={() => void save()} disabled={busy || !hasChanges}>{busy ? l('Сохранение…', 'Saving…', 'Saglabā…') : l('Сохранить', 'Save', 'Saglabāt')}</Button>}
                        </div>

                        {record.history.length > 0 && (
                            <section className="space-y-2 border-t border-border pt-4">
                                <h3 className="text-sm font-semibold">{l('История изменений', 'Change history', 'Izmaiņu vēsture')}</h3>
                                <ul className="space-y-1 text-xs text-muted-foreground">
                                    {record.history.map((entry) => {
                                        const fields = Object.keys((entry.after as { fields?: Record<string, unknown> } | null)?.fields ?? {});
                                        return (
                                            <li key={`${entry.at}-${entry.action}`}>
                                                {new Date(entry.at).toLocaleString()} · {entry.adminName || entry.adminEmail} · {fields.join(', ') || entry.action} · {entry.reason}
                                            </li>
                                        );
                                    })}
                                </ul>
                            </section>
                        )}
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
