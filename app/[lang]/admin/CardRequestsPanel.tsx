'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCardRequestsPanel } from './useCardRequestsPanel';

type Localize = (ru: string, en: string, lv: string) => string;
type Props = {
    locale: string;
    l: Localize;
    /** Только для сотрудников с правом customers.read — иначе API ответит 403. */
    enabled: boolean;
    /** Вызывается после одобрения/отказа — например, чтобы обновить список держателей карт. */
    onChanged?: () => void | Promise<void>;
    /** Показывать блок и без заявок (с пустым состоянием). */
    alwaysVisible?: boolean;
};

/** Заявки клиентов без карты на главной админки: видна, только пока есть что разбирать. */
export default function CardRequestsPanel({ locale, l, enabled, onChanged, alwaysVisible = false }: Props): React.ReactElement | null {
    const {
        formError,
        message,
        noCardRequests,
        setNoCardDrafts,
        rejectNotes,
        setRejectNotes,
        emailBusy,
        getNoCardDraft,
        regenerateCardNumber,
        handleApproveNoCardRequest,
        handleRejectNoCardRequest,
    } = useCardRequestsPanel(l, enabled, onChanged);

    if (!enabled || (!alwaysVisible && noCardRequests.length === 0 && !formError && !message)) return null;

    return (
        <section className="mt-4 mb-8 overflow-hidden rounded-xl border border-amber-200 bg-card shadow-sm dark:border-amber-800">
            <div className="border-b border-border bg-amber-50 px-5 py-4 dark:bg-amber-950/20">
                <div className="flex items-center gap-2">
                    <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-amber-500 px-2 text-sm font-bold text-white dark:bg-amber-600">{noCardRequests.length}</span>
                    <h2 className="font-semibold text-foreground">{l('Заявки клиентов без карты', 'Customer applications without a card', 'Klientu pieteikumi bez kartes')}</h2>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                    {l(
                        'Проверьте заявку, выберите тип клиента и выдайте свободный номер карты.',
                        'Review the application, select the customer type, and assign an available card number.',
                        'Pārbaudiet pieteikumu, izvēlieties klienta veidu un piešķiriet brīvu kartes numuru.'
                    )}
                </p>
            </div>

            {(formError || message) && (
                <div className="border-b border-border px-5 py-3 text-sm">
                    {formError && <p className="text-red-600 dark:text-red-400">{formError}</p>}
                    {message && <p className="text-emerald-600 dark:text-emerald-400">{message}</p>}
                </div>
            )}

            {noCardRequests.length === 0 && (
                <p className="px-5 py-4 text-sm text-muted-foreground">
                    {l('Новых заявок от клиентов без карты нет.', 'There are no new applications from customers without a card.', 'Nav jaunu pieteikumu no klientiem bez kartes.')}
                </p>
            )}

            <div className="divide-y divide-border">
                {noCardRequests.map((req) => {
                    const draft = getNoCardDraft(req.id, req.name || req.email);
                    return (
                        <article key={req.id} className="space-y-3 px-5 py-4">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="space-y-1 min-w-0">
                                    <p className="font-semibold text-foreground">{req.name || req.email}</p>
                                    <p className="text-sm text-muted-foreground">Email: {req.email}</p>
                                    {req.phone && (
                                        <p className="text-sm text-muted-foreground">
                                            {l('Телефон', 'Phone', 'Tālrunis')}: {req.phone}
                                        </p>
                                    )}
                                    <p className="text-sm text-muted-foreground">{new Date(req.requestedAt).toLocaleString(locale)}</p>
                                </div>
                                {req.certificateName && (
                                    <a
                                        href={`/api/admin/access-requests/${encodeURIComponent(req.id)}/certificate`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1.5 rounded border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors shrink-0"
                                    >
                                        📄 {req.certificateName}
                                    </a>
                                )}
                            </div>

                            {req.message && <p className="rounded bg-muted px-3 py-2 text-sm text-muted-foreground italic">«{req.message}»</p>}

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                                <label htmlFor={`customer-type-${req.id}`} className="text-sm">
                                    <span className="block mb-1 text-muted-foreground">{l('Тип клиента', 'Customer type', 'Klienta veids')}</span>
                                    <Select
                                        value={draft.customerType}
                                        onValueChange={(value: 'individual' | 'company') =>
                                            setNoCardDrafts((prev) => ({ ...prev, [req.id]: { ...draft, customerType: value } }))
                                        }
                                    >
                                        <SelectTrigger id={`customer-type-${req.id}`}>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="individual">{l('Физлицо', 'Individual', 'Privātpersona')}</SelectItem>
                                            <SelectItem value="company">{l('Юрлицо', 'Company', 'Uzņēmums')}</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </label>
                                {draft.customerType === 'company' && (
                                    <label htmlFor={`company-name-${req.id}`} className="text-sm">
                                        <span className="block mb-1 text-muted-foreground">{l('Название компании', 'Company name', 'Uzņēmuma nosaukums')}</span>
                                        <Input
                                            id={`company-name-${req.id}`}
                                            value={draft.companyName}
                                            onChange={(e) =>
                                                setNoCardDrafts((prev) => ({ ...prev, [req.id]: { ...draft, companyName: e.target.value } }))
                                            }
                                            placeholder="SIA …"
                                        />
                                    </label>
                                )}
                                {draft.customerType === 'company' && (
                                    <label htmlFor={`registration-number-${req.id}`} className="text-sm">
                                        <span className="block mb-1 text-muted-foreground">{l('Регистрационный номер', 'Registration number', 'Reģistrācijas numurs')}</span>
                                        <Input
                                            id={`registration-number-${req.id}`}
                                            value={draft.registrationNumber}
                                            onChange={(e) =>
                                                setNoCardDrafts((prev) => ({ ...prev, [req.id]: { ...draft, registrationNumber: e.target.value } }))
                                            }
                                            placeholder={l('11 цифр', '11 digits', '11 cipari')}
                                            inputMode="numeric"
                                        />
                                    </label>
                                )}
                                <label htmlFor={`card-number-${req.id}`} className="text-sm">
                                    <span className="block mb-1 text-muted-foreground">{l('Номер карты', 'Card number', 'Kartes numurs')}</span>
                                    <div className="flex gap-2">
                                        <Input
                                            id={`card-number-${req.id}`}
                                            value={draft.cardNumber}
                                            onChange={(e) =>
                                                setNoCardDrafts((prev) => ({ ...prev, [req.id]: { ...draft, cardNumber: e.target.value } }))
                                            }
                                            placeholder="1000"
                                            className="font-mono"
                                        />
                                        <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={() => void regenerateCardNumber(req.id)}>
                                            ↺
                                        </Button>
                                    </div>
                                </label>
                            </div>

                            <div className="pt-1">
                                <label htmlFor={`reject-note-${req.id}`} className="text-sm text-muted-foreground block mb-1">
                                    {l('Комментарий к отказу', 'Rejection comment', 'Noraidījuma komentārs')}{' '}
                                    <span className="text-muted-foreground">{l('(необязательно — будет добавлен в письмо)', '(optional — it will be added to the email)', '(neobligāti — tiks pievienots e-pastam)')}</span>
                                </label>
                                <Textarea
                                    id={`reject-note-${req.id}`}
                                    value={rejectNotes[req.id] ?? ''}
                                    onChange={(e) => setRejectNotes((prev) => ({ ...prev, [req.id]: e.target.value }))}
                                    rows={2}
                                    placeholder={l(
                                        'Например: предоставленный документ не является действующим сертификатом...',
                                        'For example: the submitted document is not a valid certificate...',
                                        'Piemēram: iesniegtais dokuments nav derīgs sertifikāts...'
                                    )}
                                    className="w-full resize-none text-sm"
                                />
                            </div>
                            <div className="flex gap-2">
                                <Button size="sm" disabled={emailBusy[req.id]} onClick={() => handleApproveNoCardRequest(req.id, req.email)}>
                                    {emailBusy[req.id] ? l('Отправка...', 'Sending...', 'Nosūta...') : l('Выдать карту и уведомить', 'Issue card and notify', 'Izsniegt karti un paziņot')}
                                </Button>
                                <Button size="sm" variant="outline" disabled={emailBusy[req.id]} onClick={() => handleRejectNoCardRequest(req.id, req.email, req.name || req.email)}>
                                    {l('Отклонить', 'Reject', 'Noraidīt')}
                                </Button>
                            </div>
                        </article>
                    );
                })}
            </div>
        </section>
    );
}
