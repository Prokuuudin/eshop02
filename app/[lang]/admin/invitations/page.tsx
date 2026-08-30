'use client';

import React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import AdminGate from '@/components/admin/AdminGate';
import { INVITATIONS_PAGE_SIZE as PAGE_SIZE, isTechEmail } from './invitation-models';
import { InvitationPager, SortArrow } from './invitation-list-ui';
import { useInvitationsPage } from './useInvitationsPage';

export default function AdminInvitationsPage(): React.ReactElement {
    const {
        l,
        locale,
        STATUS_LABEL,
        STATUS_CLASS,
        holders,
        holdersTotal,
        allHoldersCount,
        loading,
        message,
        formError,
        busyIds,
        selectedIds,
        setSelectedIds,
        bulkBusy,
        bulkProgress,
        holderSearch,
        setHolderSearch,
        debouncedHolderSearch,
        holderSort,
        setHolderPage,
        segment,
        setSegment,
        cardEmail,
        setCardEmail,
        cardNumber,
        setCardNumber,
        cardBusy,
        campaign,
        totalEligible,
        eligibleFilteredTotal,
        eligibleUsers,
        eligibleLoading,
        eligibleSearch,
        setEligibleSearch,
        debouncedEligibleSearch,
        eligibleSort,
        setEligiblePage,
        campaignRunning,
        handleInviteOne,
        handleWhatsApp,
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
    } = useInvitationsPage();

    return (
        <AdminGate>
            <main className="w-full py-4 space-y-6">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-bold text-foreground">{l('Приглашения клиентов', 'Client invitations', 'Klientu ielūgumi')}</h1>
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
                        className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${segment === 'withCard' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                        {l('С картой', 'With a card', 'Ar karti')} <span className="text-muted-foreground font-normal">{allHoldersCount.toLocaleString(locale)}</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => setSegment('withoutCard')}
                        className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${segment === 'withoutCard' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                        {l('Без карты', 'Without a card', 'Bez kartes')} <span className="text-muted-foreground font-normal">{totalEligible.toLocaleString(locale)}</span>
                    </button>
                </div>

                {/* ── Сегмент A: держатели карт ── */}
                {segment === 'withCard' && (
                    <section className="rounded-lg border border-border bg-card p-6 space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <h2 className="text-xl font-semibold text-foreground">
                                {l('Клиенты с картой', 'Clients with a card', 'Klienti ar karti')} <span className="text-muted-foreground font-normal text-base">{holdersTotal.toLocaleString(locale)}</span>
                            </h2>
                            <div className="flex items-center gap-2">
                                <span className="text-sm text-muted-foreground">LV+RU+EN</span>
                                {(selectedIds.size > 0 || bulkBusy) &&
                                    (bulkBusy ? (
                                        <>
                                            <span className="text-sm text-muted-foreground animate-pulse">
                                                {l(
                                                    `Отправка… ${bulkProgress?.processed ?? 0} / ${bulkProgress?.total ?? 0}`,
                                                    `Sending… ${bulkProgress?.processed ?? 0} / ${bulkProgress?.total ?? 0}`,
                                                    `Sūta… ${bulkProgress?.processed ?? 0} / ${bulkProgress?.total ?? 0}`
                                                )}
                                            </span>
                                            <Button
                                                variant="outline"
                                                onClick={() => {
                                                    stopBulkInvites();
                                                }}
                                            >
                                                {l('Остановить после порции', 'Stop after batch', 'Apturēt pēc partijas')}
                                            </Button>
                                        </>
                                    ) : (
                                        <>
                                            <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
                                                {l('Снять выбор', 'Clear selection', 'Notīrīt atlasi')}
                                            </Button>
                                            <Button onClick={handleInviteSelected}>{l(`Отправить выбранным (${selectedIds.size})`, `Send to selected (${selectedIds.size})`, `Sūtīt izvēlētajiem (${selectedIds.size})`)}</Button>
                                        </>
                                    ))}
                            </div>
                        </div>

                        <Input
                            value={holderSearch}
                            onChange={(e) => {
                                setHolderSearch(e.target.value);
                                setHolderPage(0);
                            }}
                            placeholder={l('Поиск по имени, email, телефону или номеру карты…', 'Search by name, email, phone or card number…', 'Meklēt pēc vārda, e-pasta, tālruņa vai kartes numura…')}
                            className="max-w-sm"
                        />

                        {loading && holders.length === 0 ? (
                            <p className="text-sm text-muted-foreground animate-pulse py-4">{l('Загрузка…', 'Loading…', 'Ielādē…')}</p>
                        ) : holdersTotal === 0 ? (
                            <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                                {debouncedHolderSearch
                                    ? l('Ничего не найдено по запросу.', 'No matches for this search.', 'Pēc šī pieprasījuma nekas nav atrasts.')
                                    : l(
                                          'Пока нет клиентов с картой. Назначьте карту через форму ниже или дождитесь импорта из ERP.',
                                          'No clients with a card yet. Assign a card below or wait for the ERP import.',
                                          'Pagaidām nav klientu ar karti. Piešķiriet karti zemāk vai gaidiet ERP importu.'
                                      )}
                            </div>
                        ) : (
                            <div className={`overflow-x-auto overflow-y-auto max-h-[60vh] rounded-md border border-border transition-opacity ${loading ? 'pointer-events-none opacity-60' : 'opacity-100'}`} aria-busy={loading}>
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
                                                {l('Имя', 'Name', 'Vārds')}
                                                <SortArrow active={holderSort?.key === 'name'} dir={holderSort?.dir} />
                                            </th>
                                            <th className="py-2 pr-3 font-medium cursor-pointer select-none hover:text-foreground" onClick={() => toggleHolderSort('email')}>
                                                Email
                                                <SortArrow active={holderSort?.key === 'email'} dir={holderSort?.dir} />
                                            </th>
                                            <th className="py-2 pr-3 font-medium">{l('Телефон', 'Phone', 'Tālrunis')}</th>
                                            <th className="py-2 pr-3 font-medium cursor-pointer select-none hover:text-foreground" onClick={() => toggleHolderSort('cardNumber')}>
                                                {l('Карта', 'Card', 'Karte')}
                                                <SortArrow active={holderSort?.key === 'cardNumber'} dir={holderSort?.dir} />
                                            </th>
                                            <th className="py-2 pr-3 font-medium cursor-pointer select-none hover:text-foreground" onClick={() => toggleHolderSort('status')}>
                                                {l('Статус', 'Status', 'Statuss')}
                                                <SortArrow active={holderSort?.key === 'status'} dir={holderSort?.dir} />
                                            </th>
                                            <th className="py-2 pr-3 font-medium">{l('Отправлено', 'Sent', 'Nosūtīts')}</th>
                                            <th className="py-2 pr-3 font-medium"></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {displayedHolders.map((h) => (
                                            <tr key={h.userId} className="border-b border-border/50">
                                                <td className="py-2 pr-2 pl-1">
                                                    {h.status !== 'accepted' && (
                                                        <Checkbox checked={selectedIds.has(h.userId)} disabled={bulkBusy} onCheckedChange={() => toggleSelect(h.userId)} aria-label={l('Выбрать', 'Select', 'Atlasīt')} />
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
                                                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[h.status]}`}>{STATUS_LABEL[h.status]}</span>
                                                </td>
                                                <td className="py-2 pr-3 text-muted-foreground">{h.sentAt ? new Date(h.sentAt).toLocaleDateString(locale) : '—'}</td>
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
                                                        <Button size="sm" variant={h.status === 'none' ? 'default' : 'outline'} disabled={busyIds.has(h.userId)} onClick={() => handleInviteOne(h.userId)}>
                                                            {busyIds.has(h.userId) ? l('Отправка…', 'Sending…', 'Sūta…') : h.status === 'none' ? l('Пригласить', 'Invite', 'Ielūgt') : l('Повторно', 'Resend', 'Atkārtoti')}
                                                        </Button>
                                                    )}
                                                    {h.inviteUrl && (
                                                        <Button
                                                            size="sm"
                                                            variant="ghost"
                                                            className="ml-1"
                                                            onClick={() => {
                                                                void navigator.clipboard.writeText(h.inviteUrl!);
                                                            }}
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

                        {holdersTotal > PAGE_SIZE && <InvitationPager page={effectiveHolderPage} pageCount={holderPageCount} total={holdersTotal} setPage={setHolderPage} l={l} locale={locale} />}

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
                                    {debouncedEligibleSearch ? `${eligibleFilteredTotal.toLocaleString(locale)} / ${totalEligible.toLocaleString(locale)}` : totalEligible.toLocaleString(locale)}
                                </span>
                            </h2>
                        </div>

                        <Input
                            value={eligibleSearch}
                            onChange={(e) => {
                                setEligibleSearch(e.target.value);
                                setEligiblePage(0);
                            }}
                            placeholder={l('Поиск по имени или email…', 'Search by name or email…', 'Meklēt pēc vārda vai e-pasta…')}
                            className="max-w-sm"
                        />

                        {eligibleLoading && eligibleUsers.length === 0 ? (
                            <p className="text-sm text-muted-foreground animate-pulse py-4">{l('Загрузка…', 'Loading…', 'Ielādē…')}</p>
                        ) : eligibleFilteredTotal === 0 ? (
                            <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                                {debouncedEligibleSearch
                                    ? l('Ничего не найдено по запросу.', 'No matches for this search.', 'Pēc šī pieprasījuma nekas nav atrasts.')
                                    : l('Нет клиентов без карты.', 'No clients without a card.', 'Nav klientu bez kartes.')}
                            </div>
                        ) : (
                            <div className={`overflow-y-auto max-h-[60vh] rounded-md border border-border transition-opacity ${eligibleLoading ? 'pointer-events-none opacity-60' : 'opacity-100'}`} aria-busy={eligibleLoading}>
                                <table className="w-full table-fixed text-sm">
                                    <thead className="sticky top-0 bg-card z-10">
                                        <tr className="border-b border-border text-left text-muted-foreground">
                                            <th className="w-[35%] py-2 pr-3 font-medium cursor-pointer select-none hover:text-foreground" onClick={() => toggleEligibleSort('name')}>
                                                {l('Имя', 'Name', 'Vārds')}
                                                <SortArrow active={eligibleSort?.key === 'name'} dir={eligibleSort?.dir} />
                                            </th>
                                            <th className="w-[45%] py-2 pr-3 font-medium cursor-pointer select-none hover:text-foreground" onClick={() => toggleEligibleSort('email')}>
                                                Email
                                                <SortArrow active={eligibleSort?.key === 'email'} dir={eligibleSort?.dir} />
                                            </th>
                                            <th className="w-[20%] py-2 font-medium cursor-pointer select-none hover:text-foreground" onClick={() => toggleEligibleSort('status')}>
                                                {l('Статус', 'Status', 'Statuss')}
                                                <SortArrow active={eligibleSort?.key === 'status'} dir={eligibleSort?.dir} />
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {displayedEligible.map((u) => {
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

                        {eligibleFilteredTotal > PAGE_SIZE && <InvitationPager page={effectiveEligiblePage} pageCount={eligiblePageCount} total={eligibleFilteredTotal} setPage={setEligiblePage} l={l} locale={locale} />}

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
                                        <p className="text-lg font-semibold text-foreground">{totalEligible.toLocaleString(locale)}</p>
                                    </div>
                                    <div className="rounded-md border border-border p-3">
                                        <p className="text-muted-foreground">{l('Отправлено', 'Sent', 'Nosūtīts')}</p>
                                        <p className="text-lg font-semibold text-foreground">{campaign.sentCount.toLocaleString(locale)}</p>
                                    </div>
                                    <div className="rounded-md border border-border p-3">
                                        <p className="text-muted-foreground">{l('Ошибок', 'Errors', 'Kļūdas')}</p>
                                        <p className="text-lg font-semibold text-foreground">{campaign.errorCount}</p>
                                    </div>
                                    <div className="rounded-md border border-border p-3">
                                        <p className="text-muted-foreground">{l('Статус', 'Status', 'Statuss')}</p>
                                        <p className="text-lg font-semibold text-foreground">
                                            {campaign.finished ? l('Завершена', 'Finished', 'Pabeigta') : campaign.sentCount + campaign.errorCount > 0 ? l('В процессе', 'In progress', 'Procesā') : l('Не начата', 'Not started', 'Nav sākta')}
                                        </p>
                                    </div>
                                </div>
                            )}

                            <div className="flex flex-wrap gap-2">
                                {campaignRunning ? (
                                    <Button
                                        variant="outline"
                                        onClick={() => {
                                            stopCampaign();
                                        }}
                                    >
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
