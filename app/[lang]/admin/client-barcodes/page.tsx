'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import AdminGate from '@/components/admin/AdminGate';
import IconSearch from '@/components/ui/icon-search';
import { pointsToEuros } from '@/lib/bonus-program';
import { formatEuro, getLocaleFromLanguage } from '@/lib/utils';

import { useAdminClientBarcodesPage } from './useAdminClientBarcodesPage'

export default function AdminClientBarcodesPage(): React.ReactElement {
  const pathname = usePathname()
  const registeredOnly = !pathname.endsWith('/client-database')
  const pageState = useAdminClientBarcodesPage(registeredOnly)
  const { l, tl, language, formError, message, search, setSearch, customerType, setCustomerType, cardHoldersPage, setCardHoldersPage, cardHolders, cardHoldersTotal, cardHoldersLoading, cardHoldersError, setClientEdits, clientSaveBusy, getClientEdit, handleSaveClientDetails, noCardRequests, setNoCardDrafts, rejectNotes, setRejectNotes, emailBusy, getNoCardDraft, regenerateCardNumber, handleApproveNoCardRequest, handleRejectNoCardRequest } = pageState
  const locale = getLocaleFromLanguage(language)
return (
        <AdminGate>
            <main className="w-full py-4 space-y-6">
                <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                        <h1 className="text-3xl font-bold text-foreground">
                            {registeredOnly
                                ? l('Зарегистрированные клиенты', 'Registered customers', 'Reģistrētie klienti')
                                : l('База клиентов', 'Customer database', 'Klientu datubāze')}
                        </h1>
                        <p className="text-sm text-muted-foreground mt-1">
                            {registeredOnly
                                ? l('Заявки на карту и клиенты с картой, прошедшие регистрацию на сайте.', 'Card applications and cardholders registered on the website.', 'Karšu pieteikumi un karšu īpašnieki, kas reģistrējušies vietnē.')
                                : l('Все клиенты с картами, включая тех, кто ещё не зарегистрировался на сайте.', 'All cardholders, including those who have not registered on the website yet.', 'Visi karšu īpašnieki, tostarp tie, kuri vēl nav reģistrējušies vietnē.')}
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Link href={registeredOnly ? '/admin/client-database' : '/admin/client-barcodes'}>
                            <Button variant="outline">{registeredOnly ? l('База клиентов', 'Customer database', 'Klientu datubāze') : l('Зарегистрированные клиенты', 'Registered customers', 'Reģistrētie klienti')}</Button>
                        </Link>
                        <Link href="/admin"><Button variant="outline">{tl('admin.clientBarcodes.backToAdmin', 'Назад в админку', 'Back to admin', 'Atpakal uz admin')}</Button></Link>
                    </div>
                </div>

                {(formError || message) && (
                    <div className="rounded-lg border px-4 py-3 text-sm">
                        {formError && <p className="text-red-600 dark:text-red-400">{formError}</p>}
                        {message && <p className="text-emerald-600 dark:text-emerald-400">{message}</p>}
                    </div>
                )}

                {/* ── Заявки мастеров без карты ── */}
                {registeredOnly && <section className="rounded-lg border border-amber-200 dark:border-amber-800 bg-card p-6">
                    <div className="mb-4">
                        <h2 className="text-xl font-semibold text-foreground">
                            {l('Заявки клиентов без карты', 'Customers without a card', 'Klientu pieteikumi bez kartes')}{' '}
                            <span className="ml-1 rounded-full bg-amber-100 dark:bg-amber-900/40 px-2 py-0.5 text-sm font-medium text-amber-800 dark:text-amber-300">
                                {noCardRequests.length}
                            </span>
                        </h2>
                        <p className="text-sm text-muted-foreground mt-1">
                            {l('Проверьте заявку, выберите тип клиента и выдайте свободный номер карты.', 'Review the application, select the customer type, and assign an available card number.', 'Pārbaudiet pieteikumu, izvēlieties klienta veidu un piešķiriet brīvu kartes numuru.')}
                        </p>
                    </div>

                    {noCardRequests.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                            {l('Новых заявок от мастеров нет.', 'There are no new specialist applications.', 'Nav jaunu speciālistu pieteikumu.')}
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {noCardRequests.map((req) => {
                                const draft = getNoCardDraft(req.id, req.name || req.email);
                                return (
                                    <div key={req.id} className="rounded-lg border border-border p-4 space-y-3">
                                        <div className="flex flex-wrap items-start justify-between gap-3">
                                            <div className="space-y-1 min-w-0">
                                                <p className="font-semibold text-foreground">
                                                    {req.name || req.email}
                                                </p>
                                                <p className="text-sm text-muted-foreground">Email: {req.email}</p>
                                                {req.phone && (
                                                    <p className="text-sm text-muted-foreground">{l('Телефон', 'Phone', 'Tālrunis')}: {req.phone}</p>
                                                )}
                                                <p className="text-sm text-muted-foreground">
                                                    {new Date(req.requestedAt).toLocaleString(locale)}
                                                </p>
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

                                        {req.message && (
                                            <p className="rounded bg-muted px-3 py-2 text-sm text-muted-foreground italic">
                                                «{req.message}»
                                            </p>
                                        )}

                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                                            <label htmlFor={`customer-type-${req.id}`} className="text-sm">
                                                <span className="block mb-1 text-muted-foreground">{l('Тип клиента', 'Customer type', 'Klienta veids')}</span>
                                                <Select value={draft.customerType} onValueChange={(value: 'individual' | 'company') => setNoCardDrafts((prev) => ({ ...prev, [req.id]: { ...draft, customerType: value } }))}>
                                                    <SelectTrigger id={`customer-type-${req.id}`}><SelectValue /></SelectTrigger>
                                                    <SelectContent><SelectItem value="individual">{l('Физлицо', 'Individual', 'Privātpersona')}</SelectItem><SelectItem value="company">{l('Юрлицо', 'Company', 'Uzņēmums')}</SelectItem></SelectContent>
                                                </Select>
                                            </label>
                                            {draft.customerType === 'company' && (
                                            <label htmlFor={`company-name-${req.id}`} className="text-sm">
                                                <span className="block mb-1 text-muted-foreground">{l('Название компании', 'Company name', 'Uzņēmuma nosaukums')}</span>
                                                <Input
                                                    id={`company-name-${req.id}`}
                                                    value={draft.companyName}
                                                    onChange={(e) =>
                                                        setNoCardDrafts((prev) => ({
                                                            ...prev,
                                                            [req.id]: { ...draft, companyName: e.target.value },
                                                        }))
                                                    }
                                                    placeholder="SIA …"
                                                />
                                            </label>
                                            )}
                                            {draft.customerType === 'company' && (
                                                <label htmlFor={`registration-number-${req.id}`} className="text-sm">
                                                    <span className="block mb-1 text-muted-foreground">{l('Регистрационный номер', 'Registration number', 'Reģistrācijas numurs')}</span>
                                                    <Input id={`registration-number-${req.id}`} value={draft.registrationNumber} onChange={(e) => setNoCardDrafts((prev) => ({ ...prev, [req.id]: { ...draft, registrationNumber: e.target.value } }))} placeholder={l('11 цифр', '11 digits', '11 cipari')} inputMode="numeric" />
                                                </label>
                                            )}
                                            <label htmlFor={`card-number-${req.id}`} className="text-sm">
                                                <span className="block mb-1 text-muted-foreground">{l('Номер карты', 'Card number', 'Kartes numurs')}</span>
                                                <div className="flex gap-2">
                                                    <Input
                                                        id={`card-number-${req.id}`}
                                                        value={draft.cardNumber}
                                                        onChange={(e) =>
                                                            setNoCardDrafts((prev) => ({
                                                                ...prev,
                                                                [req.id]: { ...draft, cardNumber: e.target.value },
                                                            }))
                                                        }
                                                        placeholder="1000"
                                                        className="font-mono"
                                                    />
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        size="sm"
                                                        className="shrink-0"
                                                        onClick={() => void regenerateCardNumber(req.id)}
                                                    >
                                                        ↺
                                                    </Button>
                                                </div>
                                            </label>
                                        </div>

                                        <div className="pt-1">
                                            <label className="text-sm text-muted-foreground block mb-1">
                                                {l('Комментарий к отказу', 'Rejection comment', 'Noraidījuma komentārs')}{' '}
                                                <span className="text-muted-foreground">{l('(необязательно — будет добавлен в письмо)', '(optional — it will be added to the email)', '(neobligāti — tiks pievienots e-pastam)')}</span>
                                            </label>
                                            <Textarea
                                                value={rejectNotes[req.id] ?? ''}
                                                onChange={(e) =>
                                                    setRejectNotes((prev) => ({ ...prev, [req.id]: e.target.value }))
                                                }
                                                rows={2}
                                                placeholder={l('Например: предоставленный документ не является действующим сертификатом...', 'For example: the submitted document is not a valid certificate...', 'Piemēram: iesniegtais dokuments nav derīgs sertifikāts...')}
                                                className="w-full resize-none text-sm"
                                            />
                                        </div>
                                        <div className="flex gap-2">
                                            <Button
                                                size="sm"
                                                disabled={emailBusy[req.id]}
                                                onClick={() => handleApproveNoCardRequest(req.id, req.email)}
                                            >
                                                {emailBusy[req.id] ? l('Отправка...', 'Sending...', 'Nosūta...') : l('Выдать карту и уведомить', 'Issue card and notify', 'Izsniegt karti un paziņot')}
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                disabled={emailBusy[req.id]}
                                                onClick={() => handleRejectNoCardRequest(req.id, req.email, req.name || req.email)}
                                            >
                                                {l('Отклонить', 'Reject', 'Noraidīt')}
                                            </Button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </section>}

                {/* ── Держатели карт ── */}
                <section className="min-h-[70vh] rounded-lg border border-border bg-card p-6">
                    <h2 className="text-xl font-semibold mb-4">
                        {registeredOnly ? l('Зарегистрированные клиенты', 'Registered customers', 'Reģistrētie klienti') : l('Все держатели карт', 'All cardholders', 'Visi karšu īpašnieki')}{' '}
                        <span className="text-muted-foreground font-normal text-base">
                            {cardHoldersTotal === 0 ? '0' : `${cardHoldersPage * 50 + 1}–${Math.min((cardHoldersPage + 1) * 50, cardHoldersTotal)} / ${cardHoldersTotal}`}
                        </span>
                    </h2>

                    <div className="mb-4 flex w-full max-w-2xl flex-wrap gap-2">
                        <div className="relative min-w-64 flex-1">
                            <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                            <Input
                                value={search}
                                onChange={(e) => { setSearch(e.target.value); setCardHoldersPage(0) }}
                                placeholder={l('Поиск по карте, имени, email, телефону или рег. номеру...', 'Search by card, name, email, phone, or registration number...', 'Meklēt pēc kartes, vārda, e-pasta, tālruņa vai reģistrācijas numura...')}
                                className="h-9 pl-9"
                            />
                        </div>
                        <Select value={customerType} onValueChange={(value) => { setCustomerType(value); setCardHoldersPage(0) }}>
                            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">{l('Все клиенты', 'All customers', 'Visi klienti')}</SelectItem>
                                <SelectItem value="individual">{l('Физлица', 'Individuals', 'Privātpersonas')}</SelectItem>
                                <SelectItem value="company">{l('Юрлица', 'Companies', 'Uzņēmumi')}</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {cardHoldersError && <p className="mb-3 text-sm text-red-600 dark:text-red-400">{cardHoldersError}</p>}
                    {cardHoldersLoading && cardHolders.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-4">{l('Загрузка...', 'Loading...', 'Ielāde...')}</p>
                    ) : cardHolders.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-4 text-center">
                            {search.trim() ? l(`Ничего не найдено по запросу «${search}»`, `Nothing found for “${search}”`, `Vaicājumam “${search}” nekas nav atrasts`) : l('Держателей карт пока нет.', 'There are no cardholders yet.', 'Karšu īpašnieku vēl nav.')}
                        </p>
                    ) : (
                        <div className={`overflow-x-auto transition-opacity ${cardHoldersLoading ? 'pointer-events-none opacity-60' : 'opacity-100'}`} aria-busy={cardHoldersLoading}>
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-border text-left">
                                        <th className="pb-2 pr-4 font-medium">{l('Карта', 'Card', 'Karte')}</th>
                                        <th className="pb-2 pr-4 font-medium">{l('Имя', 'Name', 'Vārds')}</th>
                                        <th className="pb-2 pr-4 font-medium">Email</th>
                                        <th className="pb-2 pr-4 font-medium">{l('Телефон', 'Phone', 'Tālrunis')}</th>
                                        <th className="pb-2 pr-4 font-medium">{l('Тип', 'Type', 'Veids')}</th>
                                        <th className="pb-2 pr-4 font-medium">{l('Рег. номер', 'Reg. number', 'Reģ. numurs')}</th>
                                        <th className="pb-2 pr-4 font-medium">{l('НДС', 'VAT', 'PVN')}</th>
                                        <th className="pb-2 pr-4 font-medium">{l('Юр. адрес', 'Legal address', 'Juridiskā adrese')}</th>
                                        <th className="pb-2 pr-4 font-medium">{l('Адрес', 'Address', 'Adrese')}</th>
                                        <th className="pb-2 pr-4 font-medium">{l('Банк / IBAN', 'Bank / IBAN', 'Banka / IBAN')}</th>
                                        <th className="pb-2 pr-4 font-medium">{l('Перс. код', 'Personal ID', 'Personas kods')}</th>
                                        {!registeredOnly && <th className="pb-2 pr-4 font-medium">{l('Регистрация', 'Registration', 'Reģistrācija')}</th>}
                                        <th className="pb-2 font-medium">{l('Бонусы', 'Bonuses', 'Bonusi')}</th>
                                        <th className="pb-2 font-medium">{l('Действие', 'Action', 'Darbība')}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border">
                                    {cardHolders.map((holder) => {
                                        const edit = getClientEdit(holder)
                                        return (
                                        <tr key={holder.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                                            <td className="py-2 pr-4 font-mono text-xs">{holder.cardNumber ?? '—'}</td>
                                            <td className="py-2 pr-4"><Input className="min-w-36" value={edit.name} onChange={(e) => setClientEdits((prev) => ({ ...prev, [holder.id]: { ...edit, name: e.target.value } }))} placeholder={l('Не указано', 'Not specified', 'Nav norādīts')} /></td>
                                            <td className="py-2 pr-4"><Input className="min-w-44 font-mono text-xs" type="email" value={edit.email} onChange={(e) => setClientEdits((prev) => ({ ...prev, [holder.id]: { ...edit, email: e.target.value } }))} placeholder={tl('admin.clientBarcodes.emailMissing', 'Не указано', 'Not specified', 'Nav norādīts')} /></td>
                                            <td className="py-2 pr-4"><Input className="min-w-36" value={edit.phone} onChange={(e) => setClientEdits((prev) => ({ ...prev, [holder.id]: { ...edit, phone: e.target.value } }))} placeholder={tl('admin.clientBarcodes.phoneMissing', 'Не указан', 'Not specified', 'Nav norādīts')} /></td>
                                            <td className="py-2 pr-4">
                                                <Select value={edit.customerType} onValueChange={(value: 'individual' | 'company') => setClientEdits((prev) => ({ ...prev, [holder.id]: { ...edit, customerType: value } }))}>
                                                    <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                                                    <SelectContent><SelectItem value="individual">{l('Физлицо', 'Individual', 'Privātpersona')}</SelectItem><SelectItem value="company">{l('Юрлицо', 'Company', 'Uzņēmums')}</SelectItem></SelectContent>
                                                </Select>
                                            </td>
                                            <td className="py-2 pr-4"><Input className="min-w-32 font-mono text-xs" disabled={edit.customerType !== 'company'} value={edit.customerType === 'company' ? edit.registrationNumber : ''} onChange={(e) => setClientEdits((prev) => ({ ...prev, [holder.id]: { ...edit, registrationNumber: e.target.value } }))} placeholder={l('11 цифр', '11 digits', '11 cipari')} /></td>
                                            <td className="py-2 pr-4 text-xs">{edit.customerType === 'company' ? holder.vatNumber || l('Не указан', 'Not specified', 'Nav norādīts') : '—'}</td>
                                            <td className="min-w-48 py-2 pr-4 text-xs">{edit.customerType === 'company' ? holder.legalAddress || l('Не указан', 'Not specified', 'Nav norādīts') : '—'}</td>
                                            <td className="min-w-48 py-2 pr-4 text-xs">{holder.address || l('Не указан', 'Not specified', 'Nav norādīts')}</td>
                                            <td className="min-w-48 py-2 pr-4 text-xs">{holder.bankName || holder.iban ? <>{holder.bankName || l('Банк не указан', 'Bank not specified', 'Banka nav norādīta')}{holder.iban && <span className="block font-mono">{holder.iban}</span>}</> : l('Не указан', 'Not specified', 'Nav norādīts')}</td>
                                            <td className="py-2 pr-4 font-mono text-xs">{edit.customerType === 'individual' ? holder.personalCodeMasked ?? l('Не указан', 'Not specified', 'Nav norādīts') : '—'}</td>
                                            {!registeredOnly && <td className="py-2 pr-4"><span className={holder.registered ? 'text-emerald-600' : 'text-muted-foreground'}>{holder.registered ? l('Зарегистрирован', 'Registered', 'Reģistrēts') : l('Не зарегистрирован', 'Not registered', 'Nav reģistrēts')}</span></td>}
                                            <td className="py-2">
                                                {holder.bonusPoints}
                                                <span className="ml-1 text-xs text-muted-foreground">
                                                    ({formatEuro(pointsToEuros(holder.bonusPoints ?? 0), locale)})
                                                </span>
                                            </td>
                                            <td className="py-2 pl-2"><Button size="sm" variant="outline" disabled={clientSaveBusy === holder.id} onClick={() => void handleSaveClientDetails(holder)}>{clientSaveBusy === holder.id ? l('Сохранение…', 'Saving…', 'Saglabā…') : l('Сохранить', 'Save', 'Saglabāt')}</Button></td>
                                        </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                    {cardHoldersTotal > 50 && (
                        <div className="mt-4 flex items-center justify-end gap-3 text-sm">
                            <Button size="sm" variant="outline" disabled={cardHoldersLoading || cardHoldersPage === 0} onClick={() => setCardHoldersPage((page) => Math.max(0, page - 1))}>{l('Назад', 'Previous', 'Atpakaļ')}</Button>
                            <span>{cardHoldersPage + 1} / {Math.ceil(cardHoldersTotal / 50)}</span>
                            <Button size="sm" variant="outline" disabled={cardHoldersLoading || (cardHoldersPage + 1) * 50 >= cardHoldersTotal} onClick={() => setCardHoldersPage((page) => page + 1)}>{l('Далее', 'Next', 'Tālāk')}</Button>
                        </div>
                    )}
                </section>
            </main>
        </AdminGate>
    );
}
