'use client';

import React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import AdminGate from '@/components/admin/AdminGate';
import { INVITATIONS_PAGE_SIZE as PAGE_SIZE, isTechEmail } from './invitation-models';
import { InvitationPager, SortArrow } from './invitation-list-ui';
import { useInvitationsPage } from './useInvitationsPage';

export default function AdminInvitationsPage(): React.ReactElement {
    const {
        l,
        language,
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
        smsBulkBusy,
        bulkProgress,
        holderSearch,
        setHolderSearch,
        debouncedHolderSearch,
        holderSort,
        setHolderPage,
        holderContactFilter,
        setHolderContactFilter,
        holderInvitationFilter,
        setHolderInvitationFilter,
        segment,
        setSegment,
        cardEmail,
        setCardEmail,
        cardNumber,
        setCardNumber,
        cardName,
        setCardName,
        cardPhone,
        setCardPhone,
        cardBusy,
        handleAssignCard,
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
        handlePhoneMessage,
        toggleSelect,
        toggleSelectMany,
        handleInviteSelected,
        handleSmsSelected,
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

    // Один и тот же алерт рендерим у формы добавления карты и у остальных действий
    // страницы (инвайты/рассылка) — иначе результат последнего действия оказывается
    // вне поля зрения админа, если он не пролистал страницу до нижнего блока.
    const formAlert = (formError || message) && (
        <div className="rounded-lg border px-4 py-3 text-sm">
            {formError && <p className="text-red-600 dark:text-red-400">{formError}</p>}
            {message && <p className="text-emerald-600 dark:text-emerald-400">{message}</p>}
        </div>
    );

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
                    <div className="flex flex-wrap gap-2">
                        <Link href="/admin/client-barcodes">
                            <Button variant="outline">{l('Зарегистрированные', 'Registered customers', 'Reģistrētie klienti')}</Button>
                        </Link>
                        <Link href="/admin">
                            <Button variant="outline">{l('Назад в админку', 'Back to admin', 'Atpakaļ uz admin')}</Button>
                        </Link>
                    </div>
                </div>

                <details className="group rounded-lg border border-emerald-200 bg-emerald-50/70 p-5 text-sm dark:border-emerald-900 dark:bg-emerald-950/30">
                    <summary className="flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
                        <h2 className="text-base font-semibold leading-6 text-foreground">
                            {l('Новый клиент с картой', 'New client with a card', 'Jauns klients ar karti')}
                        </h2>
                        <span className="relative top-px shrink-0 text-xs font-medium leading-6 text-emerald-700 group-open:hidden dark:text-emerald-300">
                            {l('Развернуть', 'Expand', 'Izvērst')} ↓
                        </span>
                        <span className="relative top-px hidden shrink-0 text-xs font-medium leading-6 text-emerald-700 group-open:inline dark:text-emerald-300">
                            {l('Свернуть', 'Collapse', 'Sakļaut')} ↑
                        </span>
                    </summary>
                    <form onSubmit={handleAssignCard} className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
                        <p className="sm:col-span-2 text-xs text-muted-foreground -mb-1">
                            {l(
                                'Карта уже выдана клиенту на месте, у него взяты email и телефон для активации. Внесите данные в течение рабочего дня (без учёта выходных) — если email уже зарегистрирован в системе, форма только проставит ему номер карты (имя/телефон не нужны — уже есть в профиле); если email новый — будет создан аккаунт клиента, и телефон обязателен. После сохранения клиент появится в таблице «Клиенты с картой» — новому клиенту приглашение отправится автоматически, уже зарегистрированному отправьте его вручную кнопкой «Email» или «Сообщение».',
                                'The card has already been handed to the client, and their email and phone were collected for activation. Enter the data within one business day (weekends excluded) — if the email is already registered, the form only assigns the card number (no need for name/phone — already on file); if the email is new, a client account is created and phone is required. Once saved, the client appears in the "Clients with a card" table — a new client is invited automatically, an already-registered one should be invited manually with the "Email" or "Message" button.',
                                'Karte klientam jau izsniegta klātienē, no viņa paņemts e-pasts un tālrunis aktivizācijai. Ievadiet datus viena darba dienas laikā (neskaitot brīvdienas) — ja e-pasts jau reģistrēts sistēmā, forma tikai piešķir kartes numuru (vārds/tālrunis nav vajadzīgi — jau ir profilā); ja e-pasts ir jauns, tiks izveidots klienta konts, un tālrunis ir obligāts. Pēc saglabāšanas klients parādīsies tabulā “Klienti ar karti” — jaunam klientam ielūgums tiks nosūtīts automātiski, jau reģistrētam nosūtiet to pats ar pogu “E-pasts” vai “Ziņa”.'
                            )}
                        </p>
                        <label className="text-sm">
                            <span className="block mb-1 text-muted-foreground">{l('Email клиента', 'Client email', 'Klienta e-pasts')}</span>
                            <Input type="email" required value={cardEmail} onChange={(e) => setCardEmail(e.target.value)} placeholder="client@inbox.lv" />
                        </label>
                        <label className="text-sm">
                            <span className="block mb-1 text-muted-foreground">{l('Номер карты', 'Card number', 'Kartes numurs')}</span>
                            <Input
                                required
                                inputMode="numeric"
                                pattern="\d{1,6}"
                                title={l('1–6 цифр', '1–6 digits', '1–6 cipari')}
                                value={cardNumber}
                                onChange={(e) => setCardNumber(e.target.value)}
                                placeholder="1001"
                                className="font-mono"
                            />
                        </label>
                        <label className="text-sm">
                            <span className="block mb-1 text-muted-foreground">{l('Телефон (для нового клиента — обязательно)', 'Phone (required for a new client)', 'Tālrunis (jaunam klientam — obligāts)')}</span>
                            <Input type="tel" value={cardPhone} onChange={(e) => setCardPhone(e.target.value)} placeholder="+371 20000000" />
                        </label>
                        <label className="text-sm">
                            <span className="block mb-1 text-muted-foreground">{l('Имя (опционально)', 'Name (optional)', 'Vārds (nav obligāts)')}</span>
                            <Input value={cardName} onChange={(e) => setCardName(e.target.value)} placeholder="Anna" />
                        </label>
                        <Button type="submit" disabled={cardBusy} className="sm:col-span-2 sm:w-auto sm:justify-self-start">
                            {cardBusy ? l('Сохраняем…', 'Saving…', 'Saglabā…') : l('Сохранить и активировать карту', 'Save and activate card', 'Saglabāt un aktivizēt karti')}
                        </Button>
                    </form>
                    {formAlert && <div className="mt-3">{formAlert}</div>}
                </details>

                <aside className="rounded-lg border border-blue-200 bg-blue-50/70 p-5 text-sm text-blue-950 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-100">
                    <details className="group">
                    <summary className="flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
                        <h2 className="text-base font-semibold leading-6">
                            {l('Памятка администратору', 'Administrator guide', 'Administratora atgādne')}
                        </h2>
                        <span className="relative top-px shrink-0 text-xs font-medium leading-6 text-blue-700 group-open:hidden dark:text-blue-300">
                            {l('Развернуть', 'Expand', 'Izvērst')} ↓
                        </span>
                        <span className="relative top-px hidden shrink-0 text-xs font-medium leading-6 text-blue-700 group-open:inline dark:text-blue-300">
                            {l('Свернуть', 'Collapse', 'Sakļaut')} ↑
                        </span>
                    </summary>
                    <div className="pt-3">
                    <p className="text-blue-900/80 dark:text-blue-100/80">
                        {l(
                            'Выберите нужную группу клиентов и следуйте инструкции для соответствующего способа приглашения.',
                            'Choose the required client group and follow the instructions for the appropriate invitation method.',
                            'Izvēlieties vajadzīgo klientu grupu un izpildiet norādījumus atbilstošajam uzaicināšanas veidam.'
                        )}
                    </p>

                    <div className="mt-4 grid gap-6 lg:grid-cols-2">
                        <section className="space-y-4">
                            <h3 className="text-base font-semibold">{l('Клиенты с картой', 'Clients with a card', 'Klienti ar karti')}</h3>
                            <div>
                            <h4 className="font-medium">{l('Приглашение по email', 'Invitation by email', 'Ielūgums e-pastā')}</h4>
                            <ol className="mt-2 list-decimal space-y-1 pl-5 text-blue-900/80 dark:text-blue-100/80">
                                <li>{l('Отметьте клиента/-ов с реальными email. Помните, что @client.local почтой клиента не является — это технический адрес.', 'Select the client(s) with real email addresses. Remember that @client.local is not a client email — it is a technical address.', 'Atlasiet klientu/-us ar īstām e-pasta adresēm. Atcerieties, ka @client.local nav klienta e-pasts — tā ir tehniska adrese.')}</li>
                                <li>{l('Отправьте приглашение кнопкой «Email» или общей кнопкой отправки. Система обрабатывает ваш выбор порциями по 20 писем.', 'Send the invitation using the “Email” button or the bulk-send button. The system processes your selection in batches of 20 emails.', 'Nosūtiet ielūgumu ar pogu “E-pasts” vai kopējās sūtīšanas pogu. Sistēma apstrādā jūsu atlasi 20 e-pastu partijās.')}</li>
                                <li>{l('После отправки обратите внимание на ответ системы — нет ли ошибки отправки. При необходимости повторите отправку ещё раз.', 'After sending, check the system response for a sending error. If necessary, send the invitation again.', 'Pēc sūtīšanas pārbaudiet sistēmas atbildi — vai nav sūtīšanas kļūdas. Ja nepieciešams, nosūtiet ielūgumu vēlreiz.')}</li>
                            </ol>
                            <Link href="/admin/config/email-templates?template=pro-invite" className="mt-2 inline-block text-xs font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900 dark:text-blue-300 dark:hover:text-blue-100">
                                {l('Редактировать шаблон письма', 'Edit email template', 'Rediģēt e-pasta veidni')}
                            </Link>
                            </div>

                            <div>
                            <h4 className="font-medium">{l('Приглашение по телефону', 'Invitation by phone', 'Ielūgums pa tālruni')}</h4>
                            <ol className="mt-2 list-decimal space-y-1 pl-5 text-blue-900/80 dark:text-blue-100/80">
                                <li>{l('Отметьте клиента/-ов с телефоном.', 'Select the client(s) with a phone number.', 'Atlasiet klientu/-us ar tālruņa numuru.')}</li>
                                <li>{l('Нажмите «Сообщение». После подключения SMS-сервиса клиенты получат SMS с приглашением зарегистрироваться на сайте.', 'Click “Message”. Once the SMS service is connected, clients will receive an SMS inviting them to register on the website.', 'Nospiediet “Ziņa”. Pēc SMS pakalpojuma pieslēgšanas klienti saņems SMS ar uzaicinājumu reģistrēties vietnē.')}</li>
                            </ol>
                            <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                                {l('Сейчас действует тестовый режим: система проверяет выбор и шаблон, но не отправляет реальное SMS.', 'Test mode is currently active: the system validates the selection and template but does not send a real SMS.', 'Pašlaik darbojas testa režīms: sistēma pārbauda atlasi un veidni, bet nenosūta īstu SMS.')}
                            </p>
                            <Link href={`/admin/config/email-templates?template=sms-invite-${language}`} className="mt-2 inline-block text-xs font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900 dark:text-blue-300 dark:hover:text-blue-100">
                                {l('Редактировать шаблон сообщения', 'Edit message template', 'Rediģēt ziņas veidni')}
                            </Link>
                            </div>

                            <p className="border-t border-blue-200 pt-3 font-medium dark:border-blue-900">
                                {l(
                                    'После регистрации клиент исчезает из этой таблицы и появляется в разделе «Зарегистрированные».',
                                    'After registration, the client disappears from this table and appears under “Registered customers”.',
                                    'Pēc reģistrācijas klients pazūd no šīs tabulas un parādās sadaļā “Reģistrētie klienti”.'
                                )}
                            </p>
                        </section>

                        <section>
                            <h3 className="text-base font-semibold">{l('Клиенты без карты', 'Clients without a card', 'Klienti bez kartes')}</h3>
                            <ol className="mt-2 list-decimal space-y-1 pl-5 text-blue-900/80 dark:text-blue-100/80">
                                <li>{l('Проверьте текст письма по ссылке «Проверить шаблон правил» и при необходимости сохраните изменения.', 'Review the email using “Review card-rules template” and save any required changes.', 'Pārbaudiet e-pasta tekstu saitē “Pārbaudīt noteikumu veidni” un, ja nepieciešams, saglabājiet izmaiņas.')}</li>
                                <li>{l('Нажмите «Начать рассылку». Письма получат все клиенты без карты, у которых указан реальный email. Отправка выполняется порциями по 50 писем.', 'Click “Start mailing”. Emails are sent to all clients without a card who have a real email address, in batches of 50.', 'Nospiediet “Sākt sūtīšanu”. E-pastus saņems visi klienti bez kartes, kuriem ir norādīta īsta e-pasta adrese. Sūtīšana notiek 50 e-pastu partijās.')}</li>
                                <li>{l('Поиск используется только для просмотра списка и не меняет состав получателей рассылки.', 'Search is only used to view the list and does not change the campaign recipients.', 'Meklēšana paredzēta tikai saraksta apskatei un nemaina izsūtnes saņēmējus.')}</li>
                                <li>{l('Следите за количеством отправленных писем и ошибок. Кнопка «Остановить» завершит текущую порцию и приостановит рассылку; затем её можно продолжить.', 'Monitor the sent and error counts. “Stop” finishes the current batch and pauses the campaign; it can then be continued.', 'Sekojiet nosūtīto e-pastu un kļūdu skaitam. Poga “Apturēt” pabeigs pašreizējo partiju un apturēs izsūtni; pēc tam to var turpināt.')}</li>
                                <li>{l('Кнопка «Сбросить» начинает новую рассылку с самого начала. Используйте её только если письма нужно повторно отправить всем получателям.', '“Reset” starts a new campaign from the beginning. Use it only when every recipient must receive the email again.', 'Poga “Atiestatīt” sāk jaunu izsūtni no sākuma. Izmantojiet to tikai tad, ja e-pasts atkārtoti jānosūta visiem saņēmējiem.')}</li>
                            </ol>
                            <Link href="/admin/config/email-templates?template=card-rules-ru" className="mt-2 inline-block text-xs font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900 dark:text-blue-300 dark:hover:text-blue-100">
                                {l('Проверить шаблон правил', 'Review card-rules template', 'Pārbaudīt noteikumu veidni')}
                            </Link>
                        </section>
                    </div>
                    </div>
                    </details>
                </aside>

                {formAlert}

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
                                {(selectedIds.size > 0 || bulkBusy || smsBulkBusy) &&
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
                                            <Button variant="outline" disabled={smsBulkBusy} onClick={handleSmsSelected}>
                                                {smsBulkBusy ? l('SMS…', 'SMS…', 'SMS…') : l(`Сообщение (${selectedIds.size})`, `Message (${selectedIds.size})`, `Ziņa (${selectedIds.size})`)}
                                            </Button>
                                        </>
                                    ))}
                            </div>
                        </div>

                        <div className="flex flex-wrap gap-3">
                            <Input
                                value={holderSearch}
                                onChange={(e) => {
                                    setHolderSearch(e.target.value);
                                    setHolderPage(0);
                                }}
                                placeholder={l('Поиск по имени, email, телефону или номеру карты…', 'Search by name, email, phone or card number…', 'Meklēt pēc vārda, e-pasta, tālruņa vai kartes numura…')}
                                className="w-full sm:max-w-sm"
                            />
                            <Select value={holderContactFilter} onValueChange={(value) => {
                                setHolderContactFilter(value as typeof holderContactFilter);
                                setHolderPage(0);
                                setSelectedIds(new Set());
                            }}>
                                <SelectTrigger className="w-full sm:w-56" aria-label={l('Фильтр по контактам', 'Contact filter', 'Kontaktu filtrs')}><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">{l('Все контакты', 'All contact states', 'Visi kontaktu veidi')}</SelectItem>
                                    <SelectItem value="emailOnly">{l('Только с почтой', 'Email only', 'Tikai ar e-pastu')}</SelectItem>
                                    <SelectItem value="phoneOnly">{l('Только с телефоном', 'Phone only', 'Tikai ar tālruni')}</SelectItem>
                                    <SelectItem value="complete">{l('Со всеми данными', 'Email and phone', 'Ar e-pastu un tālruni')}</SelectItem>
                                    <SelectItem value="none">{l('Без данных', 'No contact details', 'Bez kontaktinformācijas')}</SelectItem>
                                </SelectContent>
                            </Select>
                            <Select value={holderInvitationFilter} onValueChange={(value) => {
                                setHolderInvitationFilter(value as typeof holderInvitationFilter);
                                setHolderPage(0);
                                setSelectedIds(new Set());
                            }}>
                                <SelectTrigger className="w-full sm:w-52" aria-label={l('Фильтр по приглашению', 'Invitation filter', 'Ielūgumu filtrs')}><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">{l('Все статусы', 'All invitation states', 'Visi ielūgumu statusi')}</SelectItem>
                                    <SelectItem value="invited">{l('Приглашённые', 'Invited', 'Uzaicinātie')}</SelectItem>
                                    <SelectItem value="notInvited">{l('Не приглашённые', 'Not invited', 'Nav uzaicināti')}</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {loading && holders.length === 0 ? (
                            <p className="text-sm text-muted-foreground animate-pulse py-4">{l('Загрузка…', 'Loading…', 'Ielādē…')}</p>
                        ) : holdersTotal === 0 ? (
                            <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                                {debouncedHolderSearch
                                    ? l('Ничего не найдено по запросу.', 'No matches for this search.', 'Pēc šī pieprasījuma nekas nav atrasts.')
                                    : l(
                                          'Пока нет клиентов с картой. Добавьте клиента через форму вверху страницы или дождитесь импорта из ERP.',
                                          'No clients with a card yet. Add one via the form at the top of the page or wait for the ERP import.',
                                          'Pagaidām nav klientu ar karti. Pievienojiet klientu ar formu lapas augšā vai gaidiet ERP importu.'
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
                                                    {h.status !== 'accepted' && (!isTechEmail(h.email) || Boolean(h.phone)) && (
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
                                                    {h.status === 'accepted' ? null : (
                                                        <>
                                                    {!isTechEmail(h.email) && (
                                                        <Button size="sm" variant={h.status === 'none' ? 'default' : 'outline'} disabled={busyIds.has(h.userId)} onClick={() => handleInviteOne(h.userId)}>
                                                            {busyIds.has(h.userId) ? l('Отправка…', 'Sending…', 'Sūta…') : h.status === 'none' ? l('Email', 'Email', 'E-pasts') : l('Email повторно', 'Resend email', 'Sūtīt e-pastu atkārtoti')}
                                                        </Button>
                                                    )}
                                                    {h.phone && (
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            className="ml-1"
                                                            disabled={busyIds.has(h.userId)}
                                                            onClick={() => handlePhoneMessage(h)}
                                                            title={l('Скопировать текст приглашения для отправки по телефону', 'Copy the invitation text for sending by phone', 'Kopēt ielūguma tekstu nosūtīšanai pa tālruni')}
                                                        >
                                                            {l('Сообщение', 'Message', 'Ziņa')}
                                                        </Button>
                                                    )}
                                                    {isTechEmail(h.email) && !h.phone && (
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
                                                    )}
                                                        </>
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
