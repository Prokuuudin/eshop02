'use client';

import React from 'react';
import Link from '@/components/LocalizedLink';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import AdminGate from '@/components/admin/AdminGate';
import IconSearch from '@/components/ui/icon-search';
import CardRequestsPanel from '../CardRequestsPanel';
import { pointsToEuros } from '@/lib/bonus-program';
import { formatEuro, getLocaleFromLanguage } from '@/lib/utils';

import { useAdminClientBarcodesPage } from './useAdminClientBarcodesPage';
import { isCompleteClientStepUp } from './client-barcodes-model';
import { LEGAL_ADDRESS_MAX_LENGTH } from '@/lib/legal-details-limits';

export default function AdminClientBarcodesPage(): React.ReactElement {
    const pathname = usePathname();
    const registeredOnly = !pathname.endsWith('/client-database');
    const pageState = useAdminClientBarcodesPage(registeredOnly);
    const {
        l,
        tl,
        language,
        formError,
        message,
        search,
        setSearch,
        customerType,
        setCustomerType,
        cardHoldersPage,
        setCardHoldersPage,
        cardHolders,
        loadCardHolders,
        cardHoldersTotal,
        cardHoldersLoading,
        cardHoldersError,
        setClientEdits,
        canEditBankDetails,
        clientSaveBusy,
        clientRowErrors,
        getClientEdit,
        handleSaveClientDetails,
        clientStepUp,
        setClientStepUp,
        closeClientStepUp,
        submitClientStepUp,
    } = pageState;
    const locale = getLocaleFromLanguage(language);
    const bankAdminOnlyHint = l('Банк и IBAN может менять только администратор.', 'Only an administrator can change the bank and IBAN.', 'Banku un IBAN var mainīt tikai administrators.');
    return (
        <AdminGate>
            <main className="w-full py-4 space-y-6">
                <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                        <h1 className="text-3xl font-bold text-foreground">{registeredOnly ? l('Зарегистрированные клиенты', 'Registered customers', 'Reģistrētie klienti') : l('База клиентов', 'Customer database', 'Klientu datubāze')}</h1>
                        <p className="text-sm text-muted-foreground mt-1">
                            {registeredOnly
                                ? l('Заявки на карту и клиенты с картой, прошедшие регистрацию на сайте.', 'Card applications and cardholders registered on the website.', 'Karšu pieteikumi un karšu īpašnieki, kas reģistrējušies vietnē.')
                                : l(
                                      'Все клиенты с картами, включая тех, кто ещё не зарегистрировался на сайте.',
                                      'All cardholders, including those who have not registered on the website yet.',
                                      'Visi karšu īpašnieki, tostarp tie, kuri vēl nav reģistrējušies vietnē.'
                                  )}
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Button asChild variant="outline"><Link href={registeredOnly ? '/admin/client-database' : '/admin/client-barcodes'}>{registeredOnly ? l('База клиентов', 'Customer database', 'Klientu datubāze') : l('Зарегистрированные клиенты', 'Registered customers', 'Reģistrētie klienti')}</Link></Button>
                    </div>
                </div>

                {(formError || message) && (
                    <div className="rounded-lg border px-4 py-3 text-sm">
                        {formError && <p className="text-red-600 dark:text-red-400">{formError}</p>}
                        {message && <p className="text-emerald-600 dark:text-emerald-400">{message}</p>}
                    </div>
                )}

                {/* ── Заявки клиентов без карты (та же панель, что на главной админки) ── */}
                {registeredOnly && <CardRequestsPanel locale={locale} l={l} enabled alwaysVisible onChanged={loadCardHolders} />}

                {/* ── Держатели карт ── */}
                <section className="min-h-[70vh] rounded-lg border border-border bg-card p-6">
                    <h2 className="text-xl font-semibold mb-4">
                        {registeredOnly ? l('Зарегистрированные клиенты', 'Registered customers', 'Reģistrētie klienti') : l('Все держатели карт', 'All cardholders', 'Visi karšu īpašnieki')}{' '}
                        <span className="text-muted-foreground font-normal text-base">{cardHoldersTotal === 0 ? '0' : `${cardHoldersPage * 50 + 1}–${Math.min((cardHoldersPage + 1) * 50, cardHoldersTotal)} / ${cardHoldersTotal}`}</span>
                    </h2>

                    <div className="mb-4 flex w-full max-w-2xl flex-wrap gap-2">
                        <div className="relative min-w-64 flex-1">
                            <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                            <Input
                                value={search}
                                onChange={(e) => {
                                    setSearch(e.target.value);
                                    setCardHoldersPage(0);
                                }}
                                placeholder={l(
                                    'Поиск по карте, имени, email, телефону или рег. номеру...',
                                    'Search by card, name, email, phone, or registration number...',
                                    'Meklēt pēc kartes, vārda, e-pasta, tālruņa vai reģistrācijas numura...'
                                )}
                                className="h-9 pl-9"
                            />
                        </div>
                        <Select
                            value={customerType}
                            onValueChange={(value) => {
                                setCustomerType(value);
                                setCardHoldersPage(0);
                            }}
                        >
                            <SelectTrigger className="w-44">
                                <SelectValue />
                            </SelectTrigger>
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
                            {search.trim()
                                ? l(`Ничего не найдено по запросу «${search}»`, `Nothing found for “${search}”`, `Vaicājumam “${search}” nekas nav atrasts`)
                                : l('Держателей карт пока нет.', 'There are no cardholders yet.', 'Karšu īpašnieku vēl nav.')}
                        </p>
                    ) : (
                        // On desktop the table gets its own viewport-high scroll box, so its horizontal
                        // scrollbar stays on screen instead of below 50 rows; the header row stays on top.
                        <div className={`overflow-x-auto md:max-h-[70vh] md:overflow-y-auto transition-opacity ${cardHoldersLoading ? 'pointer-events-none opacity-60' : 'opacity-100'}`} aria-busy={cardHoldersLoading}>
                            <table className="w-full text-sm">
                                <thead className="sticky top-0 z-20 bg-card">
                                    <tr className="border-b border-border text-left">
                                        <th className="pb-2 pr-4 font-medium">{l('Карта', 'Card', 'Karte')}</th>
                                        <th className="pb-2 pr-4 font-medium">{l('Имя', 'Name', 'Vārds')}</th>
                                        <th className="pb-2 pr-4 font-medium">Email</th>
                                        <th className="pb-2 pr-4 font-medium">{l('Телефон', 'Phone', 'Tālrunis')}</th>
                                        <th className="pb-2 pr-4 font-medium">{l('Тип', 'Type', 'Veids')}</th>
                                        <th className="pb-2 pr-4 font-medium">{l('Рег. номер', 'Reg. number', 'Reģ. numurs')}</th>
                                        <th className="pb-2 pr-4 font-medium">{l('НДС', 'VAT', 'PVN')}</th>
                                        <th className="pb-2 pr-4 font-medium">{l('Юр. адрес', 'Legal address', 'Juridiskā adrese')}</th>
                                        <th className="pb-2 pr-4 font-medium">{l('Адрес доставки', 'Delivery address', 'Piegādes adrese')}</th>
                                        <th className="pb-2 pr-4 font-medium">{l('Банк / IBAN', 'Bank / IBAN', 'Banka / IBAN')}</th>
                                        {!registeredOnly && <th className="pb-2 pr-4 font-medium">{l('Регистрация', 'Registration', 'Reģistrācija')}</th>}
                                        <th className="pb-2 font-medium">{l('Бонусы', 'Bonuses', 'Bonusi')}</th>
                                        {/* Pinned to the right edge: the table scrolls sideways, «Сохранить» must stay in view (BUG-002). */}
                                        <th className="sticky right-0 z-10 border-l border-border bg-card pb-2 pl-2 font-medium">{l('Действие', 'Action', 'Darbība')}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border">
                                    {cardHolders.map((holder) => {
                                        const edit = getClientEdit(holder);
                                        return (
                                            <tr key={holder.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                                                <td className="py-2 pr-4 font-mono text-xs">{holder.cardNumber ?? '—'}</td>
                                                <td className="py-2 pr-4">
                                                    <Input
                                                        className="min-w-36"
                                                        value={edit.name}
                                                        onChange={(e) =>
                                                            setClientEdits((prev) => ({
                                                                ...prev,
                                                                [holder.id]: {
                                                                    ...edit,
                                                                    name: e.target.value,
                                                                },
                                                            }))
                                                        }
                                                        placeholder={l('Не указано', 'Not specified', 'Nav norādīts')}
                                                    />
                                                </td>
                                                <td className="py-2 pr-4">
                                                    <Input
                                                        className="min-w-44 font-mono text-xs"
                                                        type="email"
                                                        value={edit.email}
                                                        onChange={(e) =>
                                                            setClientEdits((prev) => ({
                                                                ...prev,
                                                                [holder.id]: {
                                                                    ...edit,
                                                                    email: e.target.value,
                                                                },
                                                            }))
                                                        }
                                                        placeholder={tl('admin.clientBarcodes.emailMissing', 'Не указано', 'Not specified', 'Nav norādīts')}
                                                    />
                                                </td>
                                                <td className="py-2 pr-4">
                                                    <Input
                                                        className="min-w-36"
                                                        value={edit.phone}
                                                        onChange={(e) =>
                                                            setClientEdits((prev) => ({
                                                                ...prev,
                                                                [holder.id]: {
                                                                    ...edit,
                                                                    phone: e.target.value,
                                                                },
                                                            }))
                                                        }
                                                        placeholder={tl('admin.clientBarcodes.phoneMissing', 'Не указан', 'Not specified', 'Nav norādīts')}
                                                    />
                                                </td>
                                                <td className="py-2 pr-4">
                                                    <Select
                                                        value={edit.customerType}
                                                        onValueChange={(value: 'individual' | 'company') =>
                                                            setClientEdits((prev) => ({
                                                                ...prev,
                                                                [holder.id]: {
                                                                    ...edit,
                                                                    customerType: value,
                                                                },
                                                            }))
                                                        }
                                                    >
                                                        <SelectTrigger className="w-28">
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="individual">{l('Физлицо', 'Individual', 'Privātpersona')}</SelectItem>
                                                            <SelectItem value="company">{l('Юрлицо', 'Company', 'Uzņēmums')}</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                </td>
                                                <td className="py-2 pr-4">
                                                    <Input
                                                        className="min-w-32 font-mono text-xs"
                                                        disabled={edit.customerType !== 'company'}
                                                        value={edit.customerType === 'company' ? edit.registrationNumber : ''}
                                                        onChange={(e) =>
                                                            setClientEdits((prev) => ({
                                                                ...prev,
                                                                [holder.id]: {
                                                                    ...edit,
                                                                    registrationNumber: e.target.value,
                                                                },
                                                            }))
                                                        }
                                                        placeholder={l('11 цифр', '11 digits', '11 cipari')}
                                                    />
                                                </td>
                                                <td className="py-2 pr-4">
                                                    <Input
                                                        className="min-w-36 font-mono text-xs"
                                                        aria-label={l('НДС', 'VAT', 'PVN')}
                                                        disabled={edit.customerType !== 'company'}
                                                        value={edit.customerType === 'company' ? edit.vatNumber : ''}
                                                        onChange={(e) =>
                                                            setClientEdits((prev) => ({
                                                                ...prev,
                                                                [holder.id]: {
                                                                    ...edit,
                                                                    vatNumber: e.target.value,
                                                                },
                                                            }))
                                                        }
                                                        placeholder={edit.customerType === 'company' ? 'LV40003000000' : '—'}
                                                    />
                                                </td>
                                                <td className="py-2 pr-4">
                                                    <Input
                                                        className="min-w-48"
                                                        aria-label={l('Юр. адрес', 'Legal address', 'Juridiskā adrese')}
                                                        maxLength={LEGAL_ADDRESS_MAX_LENGTH}
                                                        disabled={edit.customerType !== 'company'}
                                                        value={edit.customerType === 'company' ? edit.legalAddress : ''}
                                                        onChange={(e) =>
                                                            setClientEdits((prev) => ({
                                                                ...prev,
                                                                [holder.id]: {
                                                                    ...edit,
                                                                    legalAddress: e.target.value,
                                                                },
                                                            }))
                                                        }
                                                        placeholder={edit.customerType === 'company' ? l('Не указан', 'Not specified', 'Nav norādīts') : '—'}
                                                    />
                                                </td>
                                                <td className="py-2 pr-4">
                                                    <div className="flex min-w-56 flex-col gap-1">
                                                        <Input
                                                            aria-label={l('Адрес доставки', 'Delivery address', 'Piegādes adrese')}
                                                            value={edit.deliveryAddress}
                                                            onChange={(e) => setClientEdits((prev) => ({ ...prev, [holder.id]: { ...edit, deliveryAddress: e.target.value } }))}
                                                            placeholder={l('Улица, дом', 'Street, building', 'Iela, māja')}
                                                        />
                                                        <div className="flex gap-1">
                                                            <Input
                                                                aria-label={l('Город', 'City', 'Pilsēta')}
                                                                value={edit.deliveryCity}
                                                                onChange={(e) => setClientEdits((prev) => ({ ...prev, [holder.id]: { ...edit, deliveryCity: e.target.value } }))}
                                                                placeholder={l('Город', 'City', 'Pilsēta')}
                                                            />
                                                            <Input
                                                                className="w-28"
                                                                aria-label={l('Индекс', 'Postal code', 'Pasta indekss')}
                                                                value={edit.deliveryPostalCode}
                                                                onChange={(e) => setClientEdits((prev) => ({ ...prev, [holder.id]: { ...edit, deliveryPostalCode: e.target.value } }))}
                                                                placeholder="LV-1001"
                                                            />
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="py-2 pr-4">
                                                    <div className="flex min-w-52 flex-col gap-1">
                                                        <Input
                                                            aria-label={l('Банк', 'Bank', 'Banka')}
                                                            disabled={edit.customerType !== 'company' || !canEditBankDetails}
                                                            title={canEditBankDetails ? undefined : bankAdminOnlyHint}
                                                            value={edit.customerType === 'company' ? edit.bankName : ''}
                                                            onChange={(e) => setClientEdits((prev) => ({ ...prev, [holder.id]: { ...edit, bankName: e.target.value } }))}
                                                            placeholder={edit.customerType === 'company' ? l('Банк', 'Bank', 'Banka') : '—'}
                                                        />
                                                        <Input
                                                            className="font-mono text-xs"
                                                            aria-label="IBAN"
                                                            disabled={edit.customerType !== 'company' || !canEditBankDetails}
                                                            title={canEditBankDetails ? undefined : bankAdminOnlyHint}
                                                            value={edit.customerType === 'company' ? edit.iban : ''}
                                                            onChange={(e) => setClientEdits((prev) => ({ ...prev, [holder.id]: { ...edit, iban: e.target.value } }))}
                                                            placeholder={edit.customerType === 'company' ? 'IBAN' : '—'}
                                                        />
                                                    </div>
                                                </td>
                                                {!registeredOnly && (
                                                    <td className="py-2 pr-4">
                                                        <span className={holder.registered ? 'text-emerald-600' : 'text-muted-foreground'}>
                                                            {holder.registered ? l('Зарегистрирован', 'Registered', 'Reģistrēts') : l('Не зарегистрирован', 'Not registered', 'Nav reģistrēts')}
                                                        </span>
                                                    </td>
                                                )}
                                                <td className="py-2">
                                                    {holder.bonusPoints}
                                                    <span className="ml-1 text-xs text-muted-foreground">({formatEuro(pointsToEuros(holder.bonusPoints ?? 0), locale)})</span>
                                                </td>
                                                <td className="sticky right-0 z-10 border-l border-border bg-card py-2 pl-2">
                                                    <Button size="sm" variant="outline" disabled={clientSaveBusy === holder.id} onClick={() => void handleSaveClientDetails(holder)}>
                                                        {clientSaveBusy === holder.id ? l('Сохранение…', 'Saving…', 'Saglabā…') : l('Сохранить', 'Save', 'Saglabāt')}
                                                    </Button>
                                                    {clientRowErrors[holder.id] && (
                                                        <p role="alert" className="mt-1 w-48 whitespace-normal text-xs text-red-600 dark:text-red-400">
                                                            {clientRowErrors[holder.id]}
                                                        </p>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                    {cardHoldersTotal > 50 && (
                        <div className="mt-4 flex items-center justify-end gap-3 text-sm">
                            <Button size="sm" variant="outline" disabled={cardHoldersLoading || cardHoldersPage === 0} onClick={() => setCardHoldersPage((page) => Math.max(0, page - 1))}>
                                {l('Назад', 'Previous', 'Atpakaļ')}
                            </Button>
                            <span>
                                {cardHoldersPage + 1} / {Math.ceil(cardHoldersTotal / 50)}
                            </span>
                            <Button size="sm" variant="outline" disabled={cardHoldersLoading || (cardHoldersPage + 1) * 50 >= cardHoldersTotal} onClick={() => setCardHoldersPage((page) => page + 1)}>
                                {l('Далее', 'Next', 'Tālāk')}
                            </Button>
                        </div>
                    )}
                </section>
                <Dialog open={clientStepUp !== null} onOpenChange={(open) => { if (!open) closeClientStepUp(); }}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>{l('Подтверждение изменения аккаунта сотрудника', 'Confirm a staff account change', 'Darbinieka konta izmaiņu apstiprināšana')}</DialogTitle>
                            <DialogDescription>
                                {l('Этот держатель карты — сотрудник. Изменение сохранится после подтверждения вашим паролем и кодом из приложения 2FA; причина попадёт в журнал аудита.', 'This card holder is a staff member. The change is saved after you confirm it with your password and 2FA app code; the reason is recorded in the audit log.', 'Šis kartes turētājs ir darbinieks. Izmaiņas tiks saglabātas pēc apstiprināšanas ar jūsu paroli un 2FA lietotnes kodu; iemesls tiks ierakstīts audita žurnālā.')}
                            </DialogDescription>
                        </DialogHeader>
                        {clientStepUp && (
                            <form
                                className="space-y-2"
                                onSubmit={(e) => { e.preventDefault(); void submitClientStepUp(); }}
                            >
                                <Input type="password" value={clientStepUp.currentPassword} autoComplete="current-password"
                                    onChange={(e) => setClientStepUp((prev) => prev && { ...prev, currentPassword: e.target.value })}
                                    placeholder={l('Ваш пароль', 'Your password', 'Jūsu parole')} />
                                <Input value={clientStepUp.mfaCode} inputMode="numeric" autoComplete="one-time-code" maxLength={6}
                                    onChange={(e) => setClientStepUp((prev) => prev && { ...prev, mfaCode: e.target.value })}
                                    placeholder={l('Ваш код из приложения', 'Your code from the app', 'Jūsu kods no lietotnes')} />
                                <Input value={clientStepUp.reason} maxLength={1000}
                                    onChange={(e) => setClientStepUp((prev) => prev && { ...prev, reason: e.target.value })}
                                    placeholder={l('Причина (минимум 5 символов)', 'Reason (at least 5 characters)', 'Iemesls (vismaz 5 rakstzīmes)')} />
                                {clientStepUp.error && (
                                    <p role="alert" className="text-sm text-red-600 dark:text-red-400">{clientStepUp.error}</p>
                                )}
                                <DialogFooter>
                                    <Button type="button" variant="outline" onClick={closeClientStepUp}>{l('Отмена', 'Cancel', 'Atcelt')}</Button>
                                    <Button type="submit" disabled={clientSaveBusy === clientStepUp.holderId || !isCompleteClientStepUp(clientStepUp)}>
                                        {clientSaveBusy === clientStepUp.holderId ? l('Сохранение…', 'Saving…', 'Saglabā…') : l('Подтвердить и сохранить', 'Confirm and save', 'Apstiprināt un saglabāt')}
                                    </Button>
                                </DialogFooter>
                            </form>
                        )}
                    </DialogContent>
                </Dialog>
            </main>
        </AdminGate>
    );
}
