'use client';

import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { MergeAccountSummary, MergeBlocker, MergePreview, ProfileAction, ProfileItem } from '@/lib/admin-account-merge';
import { MERGE_NOTE_MAX_LENGTH, checkMergeNote, type MergeReasonCode } from '@/lib/admin-account-merge-reason';

type L = (ru: string, en: string, lv: string) => string;

export type AccountMergeRequest = { sourceId: string; targetId: string };
export type AccountMergeDone = { sourceId: string; email: string; alreadyMerged: boolean };

export function mergeBlockerText(l: L, blocker: MergeBlocker): string {
    const texts: Record<MergeBlocker, [string, string, string]> = {
        same_account: ['Это один и тот же аккаунт.', 'This is the same account.', 'Tas ir viens un tas pats konts.'],
        staff_account: ['Один из аккаунтов — аккаунт сотрудника.', 'One of the accounts is a staff account.', 'Viens no kontiem ir darbinieka konts.'],
        not_customer: ['Объединять можно только клиентские аккаунты.', 'Only customer accounts can be merged.', 'Apvienot var tikai klientu kontus.'],
        source_has_card: ['У старого аккаунта есть карта.', 'The old account has a card.', 'Vecajam kontam ir karte.'],
        source_no_email: ['У старого аккаунта нет настоящего email.', 'The old account has no real email.', 'Vecajam kontam nav īstas e-pasta adreses.'],
        source_erased: ['Старый аккаунт анонимизирован (GDPR).', 'The old account was anonymised (GDPR).', 'Vecais konts ir anonimizēts (GDPR).'],
        source_revoked_card: ['У старого аккаунта была отозванная карта.', 'The old account held a revoked card.', 'Vecajam kontam bija atsaukta karte.'],
        source_activated: ['Старый аккаунт уже активирован в новом магазине (вход, пароль или согласие).', 'The old account was already activated in the new shop (login, password or consent).', 'Vecais konts jau aktivizēts jaunajā veikalā (pieteikšanās, parole vai piekrišana).'],
        source_secrets: ['У старого аккаунта есть данные входа по карте или 2FA.', 'The old account has card login or 2FA data.', 'Vecajam kontam ir kartes pieteikšanās vai 2FA dati.'],
        source_company: ['Старый аккаунт связан с компанией.', 'The old account belongs to a company.', 'Vecais konts ir saistīts ar uzņēmumu.'],
        source_legal_details: ['У старого аккаунта есть реквизиты юрлица.', 'The old account has company details.', 'Vecajam kontam ir uzņēmuma rekvizīti.'],
        source_bonus_balance: ['У старого аккаунта есть бонусный баланс.', 'The old account has a bonus balance.', 'Vecajam kontam ir bonusu atlikums.'],
        source_bonus_history: ['У старого аккаунта есть бонусные операции.', 'The old account has bonus transactions.', 'Vecajam kontam ir bonusu darījumi.'],
        source_sessions: ['У старого аккаунта есть сессии входа.', 'The old account has login sessions.', 'Vecajam kontam ir pieteikšanās sesijas.'],
        source_invitations: ['Старому аккаунту отправлялись приглашения.', 'Invitations were sent to the old account.', 'Vecajam kontam tika sūtīti ielūgumi.'],
        source_pending_tokens: ['У старого аккаунта есть незавершённый сброс пароля или вход.', 'The old account has a pending password reset or login.', 'Vecajam kontam ir nepabeigta paroles atiestatīšana vai pieteikšanās.'],
        source_open_orders: ['У старого аккаунта есть незавершённые заказы нового магазина.', 'The old account has unfinished orders of the new shop.', 'Vecajam kontam ir nepabeigti jaunā veikala pasūtījumi.'],
        source_site_activity: ['Старый аккаунт уже пользовался сайтом (отзывы, голоса).', 'The old account was already used on the site (reviews, votes).', 'Vecais konts jau ir lietots vietnē (atsauksmes, balsojumi).'],
        source_staff_history: ['Старый аккаунт встречается в служебной истории (сотрудник).', 'The old account appears in staff history.', 'Vecais konts parādās dienesta vēsturē.'],
        source_settings_reference: ['Старый аккаунт упоминается в настройках магазина.', 'The old account is referenced in shop settings.', 'Vecais konts ir minēts veikala iestatījumos.'],
        profile_conflict: ['Профили оформления заказа у аккаунтов различаются.', 'The checkout profiles of the accounts differ.', 'Kontu pasūtījuma profili atšķiras.'],
        target_no_card: ['У сохраняемого аккаунта нет карты.', 'The kept account has no card.', 'Saglabājamajam kontam nav kartes.'],
        target_card_revoked: ['Карта сохраняемого аккаунта отозвана.', 'The kept account\'s card is revoked.', 'Saglabājamā konta karte ir atsaukta.'],
        target_erased: ['Сохраняемый аккаунт анонимизирован (GDPR).', 'The kept account was anonymised (GDPR).', 'Saglabājamais konts ir anonimizēts (GDPR).'],
        target_pending_tokens: ['У аккаунта с картой есть действующее приглашение или сброс пароля.', 'The card account has an open invitation or password reset.', 'Kontam ar karti ir aktīvs ielūgums vai paroles atiestatīšana.'],
    };
    return l(...texts[blocker]);
}

function mergeErrorText(l: L, code: string | undefined, status: number): string {
    switch (code) {
        case 'blocked': return l('Объединение невозможно — см. причины выше.', 'The merge is not possible — see the reasons above.', 'Apvienošana nav iespējama — skatiet iemeslus augstāk.');
        case 'optimistic_conflict':
        case 'concurrent_update':
            return l('Один из аккаунтов только что изменился. Ничего не изменено — откройте объединение заново.', 'One of the accounts has just changed. Nothing was changed — open the merge again.', 'Viens no kontiem tikko mainījās. Nekas netika mainīts — atveriet apvienošanu vēlreiz.');
        case 'already_merged': return l('Этот аккаунт уже объединён с другим клиентом.', 'This account was already merged into another customer.', 'Šis konts jau ir apvienots ar citu klientu.');
        case 'target_changed':
        case 'target_new_access':
        case 'suppression_changed':
        case 'moved_rows_changed':
        case 'source_exists':
            return l('После объединения данные уже менялись — отменить автоматически нельзя. Ничего не изменено.', 'The data changed after the merge — it cannot be undone automatically. Nothing was changed.', 'Pēc apvienošanas dati jau mainījās — to nevar atcelt automātiski. Nekas netika mainīts.');
        // Wording avoids secret-scanner trigger words; the server check is in lib/admin-account-merge-reason.
        case 'invalid_note': return l('Пояснение отклонено: до 200 символов, без email, телефонов, номеров и данных для входа.', 'Note rejected: up to 200 characters, no emails, phone numbers, other numbers or sign-in data.', 'Piezīme noraidīta: līdz 200 rakstzīmēm, bez e-pastiem, tālruņiem, citiem numuriem un pieteikšanās datiem.');
        case 'not_found': return l('Аккаунт не найден. Обновите страницу.', 'Account not found. Reload the page.', 'Konts nav atrasts. Pārlādējiet lapu.');
        case 'forbidden': return l('Объединять аккаунты может только администратор.', 'Only an administrator can merge accounts.', 'Kontus var apvienot tikai administrators.');
        case 'card_policy_unavailable': return l('Реестр отозванных карт недоступен. Повторите позже.', 'The revoked card registry is unavailable. Try again later.', 'Atsaukto karšu reģistrs nav pieejams. Mēģiniet vēlāk.');
        default: return l(`Не удалось выполнить (HTTP ${status}).`, `The action failed (HTTP ${status}).`, `Darbība neizdevās (HTTP ${status}).`);
    }
}

function profileItemText(l: L, item: ProfileItem): string {
    const texts: Record<ProfileItem, [string, string, string]> = {
        name: ['Имя', 'Name', 'Vārds'],
        phone: ['Телефон', 'Phone', 'Tālrunis'],
        avatarUrl: ['Фото профиля', 'Profile photo', 'Profila foto'],
        checkoutProfile: ['Данные оформления заказа', 'Checkout details', 'Pasūtījuma dati'],
        marketingConsent: ['Согласие на рассылку', 'Marketing consent', 'Piekrišana sūtījumiem'],
        notifications: ['Уведомления', 'Notifications', 'Paziņojumi'],
    };
    return l(...texts[item]);
}

function profileActionText(l: L, action: ProfileAction): string {
    switch (action) {
        case 'same': return l('совпадает', 'same', 'sakrīt');
        case 'keep_target': return l('остаётся значение аккаунта с картой', 'the card account value is kept', 'paliek konta ar karti vērtība');
        case 'copy_from_source': return l('переносится со старого аккаунта', 'copied from the old account', 'tiek pārnesta no vecā konta');
        case 'conflict': return l('конфликт — объединение невозможно', 'conflict — merge not possible', 'konflikts — apvienošana nav iespējama');
    }
}

/** Reason code + optional short note: shared by the merge and the undo. */
function ReasonFields({ l, code, note, onCode, onNote }: { l: L; code: MergeReasonCode | ''; note: string; onCode: (code: MergeReasonCode) => void; onNote: (note: string) => void }) {
    return (
        <div className="space-y-2">
            <Select value={code} onValueChange={(value) => onCode(value as MergeReasonCode)}>
                <SelectTrigger aria-label={l('Основание', 'Reason', 'Pamatojums')}>
                    <SelectValue placeholder={l('Основание (обязательно)', 'Reason (required)', 'Pamatojums (obligāts)')} />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="phone_match">{l('Совпадает телефон', 'The phone matches', 'Sakrīt tālrunis')}</SelectItem>
                    <SelectItem value="customer_confirmed">{l('Клиент подтвердил', 'The customer confirmed', 'Klients apstiprināja')}</SelectItem>
                    <SelectItem value="order_history_match">{l('Совпадает история заказов', 'The order history matches', 'Sakrīt pasūtījumu vēsture')}</SelectItem>
                    <SelectItem value="other">{l('Другое (нужно пояснение)', 'Other (note required)', 'Cits (nepieciešama piezīme)')}</SelectItem>
                </SelectContent>
            </Select>
            <Input value={note} maxLength={MERGE_NOTE_MAX_LENGTH} onChange={(e) => onNote(e.target.value)}
                placeholder={l('Короткое пояснение без персональных данных (необязательно)', 'Short note without personal data (optional)', 'Īsa piezīme bez personas datiem (nav obligāta)')} />
        </div>
    );
}

const reasonValid = (code: MergeReasonCode | '', note: string): code is MergeReasonCode =>
    code !== '' && !('problem' in checkMergeNote(code, note));

function AccountCard({ title, account, l, locale, tone }: { title: string; account: MergeAccountSummary; l: L; locale: string; tone: 'remove' | 'keep' }) {
    const none = l('не указано', 'not specified', 'nav norādīts');
    return (
        <div className={`rounded-md border p-3 text-sm ${tone === 'remove' ? 'border-red-300 dark:border-red-800' : 'border-emerald-300 dark:border-emerald-800'}`}>
            <p className="mb-2 font-semibold">{title}</p>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                <dt className="text-muted-foreground">{l('Имя', 'Name', 'Vārds')}</dt><dd>{account.name || none}</dd>
                <dt className="text-muted-foreground">Email</dt><dd className="break-all font-mono text-xs">{account.email}</dd>
                <dt className="text-muted-foreground">{l('Телефон', 'Phone', 'Tālrunis')}</dt><dd>{account.phone || none}</dd>
                <dt className="text-muted-foreground">{l('Карта', 'Card', 'Karte')}</dt><dd className="font-mono">{account.cardNumber ?? '—'}</dd>
                <dt className="text-muted-foreground">{l('Бонусы', 'Bonuses', 'Bonusi')}</dt><dd>{account.bonusPoints}</dd>
                <dt className="text-muted-foreground">{l('Создан', 'Created', 'Izveidots')}</dt><dd>{new Date(account.createdAt).toLocaleDateString(locale)}</dd>
                <dt className="text-muted-foreground">{l('Регистрация', 'Registration', 'Reģistrācija')}</dt>
                <dd>{account.registered ? l('Зарегистрирован', 'Registered', 'Reģistrēts') : l('Не зарегистрирован', 'Not registered', 'Nav reģistrēts')}</dd>
                {account.marketingSuppressed && (<><dt className="text-muted-foreground">{l('Рассылки', 'Mailings', 'Sūtījumi')}</dt><dd>{l('запрещены', 'blocked', 'aizliegti')}</dd></>)}
            </dl>
        </div>
    );
}

function transferRows(l: L, preview: MergePreview): Array<[string, number]> {
    const c = preview.transfer.counts;
    const d = preview.transfer.duplicates;
    return [
        [l('Заказы', 'Orders', 'Pasūtījumi'), c['Order.userId'] ?? 0],
        [l('Сохранённые адреса', 'Saved addresses', 'Saglabātās adreses'), c['SavedAddress.userId'] ?? 0],
        [l('Избранное', 'Wishlist', 'Vēlmju saraksts'), (c['WishlistItem.userId'] ?? 0) - (d['WishlistItem.userId'] ?? 0)],
        [l('Подписки на новости товаров', 'Product news subscriptions', 'Preču jaunumu abonementi'), (c['ProductNewsSubscription.userId'] ?? 0) - (d['ProductNewsSubscription.userId'] ?? 0)],
        [l('Использованные промокоды', 'Used promo codes', 'Izmantotie atlaižu kodi'), c['PromoCodeRedemption.userId'] ?? 0],
        [l('Уведомления', 'Notifications', 'Paziņojumi'), c['UserNotification.userId'] ?? 0],
    ];
}

async function sendJson(method: 'POST' | 'DELETE', body: unknown): Promise<{ ok: boolean; status: number; payload: Record<string, unknown> | null }> {
    const response = await fetch('/api/admin/users/merge', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { ok: response.ok, status: response.status, payload: await response.json().catch(() => null) as Record<string, unknown> | null };
}

export function AccountMergeDialog({ request, l, locale, onClose, onMerged }: {
    request: AccountMergeRequest | null;
    l: L;
    locale: string;
    onClose: () => void;
    onMerged: (result: AccountMergeDone) => void;
}): React.ReactElement {
    const [preview, setPreview] = useState<MergePreview | null>(null);
    const [loadError, setLoadError] = useState('');
    const [confirmed, setConfirmed] = useState(false);
    const [reasonCode, setReasonCode] = useState<MergeReasonCode | ''>('');
    const [note, setNote] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!request) return;
        const controller = new AbortController();
        const params = new URLSearchParams({ sourceId: request.sourceId, targetId: request.targetId });
        fetch(`/api/admin/users/merge?${params}`, { cache: 'no-store', signal: controller.signal })
            .then(async (response) => {
                const payload = await response.json().catch(() => null) as { preview?: MergePreview; error?: string } | null;
                if (!response.ok || !payload?.preview) throw new Error(mergeErrorText(l, payload?.error, response.status));
                setPreview(payload.preview);
            })
            .catch((cause: unknown) => {
                if (controller.signal.aborted) return;
                setLoadError(cause instanceof Error ? cause.message : mergeErrorText(l, undefined, 0));
            });
        return () => controller.abort();
        // The dialog is keyed by the request, so `l` changing mid-load does not need a refetch.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [request]);

    const canSubmit = preview !== null && preview.blockers.length === 0 && confirmed && reasonValid(reasonCode, note) && !busy;

    const submit = async () => {
        if (!preview || !canSubmit || !reasonCode) return;
        setBusy(true);
        setError('');
        try {
            const { ok, status, payload } = await sendJson('POST', {
                sourceId: preview.source.id,
                targetId: preview.target.id,
                sourceUpdatedAt: preview.source.updatedAt,
                targetUpdatedAt: preview.target.updatedAt,
                reasonCode,
                note: note.trim() || null,
                confirmed: true,
            });
            if (!ok) {
                const blockers = payload?.blockers as MergeBlocker[] | undefined;
                if (blockers?.length) setPreview({ ...preview, blockers });
                setError(mergeErrorText(l, payload?.error as string | undefined, status));
                return;
            }
            onMerged({ sourceId: preview.source.id, email: (payload?.email as string | undefined) ?? preview.source.email, alreadyMerged: payload?.alreadyMerged === true });
        } catch {
            setError(l('Нет связи с сервером. Ничего не изменено — повторите.', 'No connection to the server. Nothing was changed — try again.', 'Nav savienojuma ar serveri. Nekas netika mainīts — mēģiniet vēlreiz.'));
        } finally {
            setBusy(false);
        }
    };

    const kept = preview ? Object.values(preview.transfer.kept).reduce((sum, n) => sum + n, 0) : 0;

    return (
        <Dialog open={request !== null} onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
                <DialogHeader>
                    <DialogTitle>{l('Объединить аккаунты', 'Merge accounts', 'Apvienot kontus')}</DialogTitle>
                    <DialogDescription>
                        {l(
                            'История старого аккаунта без карты переносится на аккаунт с картой, старый аккаунт удаляется, его email получает аккаунт с картой. Всё сохраняется для отмены. Объединяйте, только если уверены, что это один и тот же человек.',
                            'The history of the old account without a card moves to the card account, the old account is deleted and the card account gets its email. Everything is kept for an undo. Merge only if you are sure this is the same person.',
                            'Vecā konta bez kartes vēsture tiek pārnesta uz kontu ar karti, vecais konts tiek dzēsts, un konts ar karti saņem tā e-pastu. Viss tiek saglabāts atcelšanai. Apvienojiet tikai tad, ja esat pārliecināts, ka tā ir viena un tā pati persona.',
                        )}
                    </DialogDescription>
                </DialogHeader>

                {!preview && !loadError && <p className="text-sm text-muted-foreground">{l('Загрузка…', 'Loading…', 'Ielāde…')}</p>}
                {loadError && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{loadError}</p>}

                {preview && (
                    <div className="space-y-4">
                        <div className="grid gap-3 sm:grid-cols-2">
                            <AccountCard tone="remove" l={l} locale={locale} account={preview.source}
                                title={l('Старый аккаунт — будет удалён', 'Old account — will be deleted', 'Vecais konts — tiks dzēsts')} />
                            <AccountCard tone="keep" l={l} locale={locale} account={preview.target}
                                title={l('Аккаунт с картой — сохраняется', 'Card account — kept', 'Konts ar karti — tiek saglabāts')} />
                        </div>

                        <div className="text-sm">
                            <p className="mb-1 font-semibold">{l('Переносится на аккаунт с картой', 'Moves to the card account', 'Tiek pārnests uz kontu ar karti')}</p>
                            <ul className="list-disc pl-5">
                                {transferRows(l, preview).map(([label, count]) => <li key={label}>{label}: {count}</li>)}
                            </ul>
                            {Object.values(preview.transfer.duplicates).some((n) => n > 0) && (
                                <p className="mt-1 text-muted-foreground">
                                    {l('Повторы (тот же товар уже есть у аккаунта с картой) не переносятся, но сохраняются для отмены', 'Duplicates (same product already on the card account) are not moved but kept for an undo', 'Dublikāti (tā pati prece jau ir kontam ar karti) netiek pārnesti, bet tiek saglabāti atcelšanai')}: {Object.values(preview.transfer.duplicates).reduce((s, n) => s + n, 0)}
                                </p>
                            )}
                            {kept > 0 && (
                                <p className="mt-1 text-muted-foreground">
                                    {l('Записи журнала аудита о старом аккаунте не меняются', 'Audit log entries about the old account stay unchanged', 'Audita žurnāla ieraksti par veco kontu netiek mainīti')}: {kept}
                                </p>
                            )}
                            {preview.transfer.orders.length > 0 && (
                                <ul className="mt-2 space-y-0.5 font-mono text-xs">
                                    {preview.transfer.orders.map((order) => (
                                        <li key={order.id}>{order.id.slice(0, 8)} · {new Date(order.createdAt).toLocaleDateString(locale)} · {order.total} € · {order.paymentStatus}</li>
                                    ))}
                                </ul>
                            )}
                        </div>

                        <div className="text-sm">
                            <p className="mb-1 font-semibold">{l('Данные профиля', 'Profile data', 'Profila dati')}</p>
                            <table className="w-full text-xs">
                                <thead><tr className="text-left text-muted-foreground">
                                    <th className="pr-2 font-normal">{l('Поле', 'Field', 'Lauks')}</th>
                                    <th className="pr-2 font-normal">{l('Старый аккаунт', 'Old account', 'Vecais konts')}</th>
                                    <th className="pr-2 font-normal">{l('Аккаунт с картой', 'Card account', 'Konts ar karti')}</th>
                                    <th className="font-normal">{l('Что будет', 'Outcome', 'Rezultāts')}</th>
                                </tr></thead>
                                <tbody>
                                    {preview.profile.map((entry) => (
                                        <tr key={entry.item} className={entry.action === 'conflict' ? 'text-red-700 dark:text-red-300' : ''}>
                                            <td className="pr-2">{profileItemText(l, entry.item)}</td>
                                            <td className="break-all pr-2">{entry.item === 'checkoutProfile' ? (entry.source ? l('есть', 'set', 'ir') : '—') : entry.source || '—'}</td>
                                            <td className="break-all pr-2">{entry.item === 'checkoutProfile' ? (entry.target ? l('есть', 'set', 'ir') : '—') : entry.target || '—'}</td>
                                            <td>{profileActionText(l, entry.action)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="rounded-md border p-3 text-sm">
                            <p className="mb-1 font-semibold">{l('Результат', 'Result', 'Rezultāts')}</p>
                            <p>Email: <span className="font-mono text-xs">{preview.result.email}</span></p>
                            <p>{l('Имя', 'Name', 'Vārds')}: {preview.result.name || '—'} · {l('Телефон', 'Phone', 'Tālrunis')}: {preview.result.phone || '—'}</p>
                            <p>{l('Карта', 'Card', 'Karte')}: {preview.result.cardNumber} · {l('Бонусы', 'Bonuses', 'Bonusi')}: {preview.result.bonusPoints}</p>
                            {preview.result.marketingSuppressed && <p>{l('Запрет рассылок сохраняется.', 'The mailing block is kept.', 'Sūtījumu aizliegums tiek saglabāts.')}</p>}
                        </div>

                        {preview.blockers.length > 0 ? (
                            <div role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
                                <p className="mb-1 font-semibold">{l('Объединение недоступно', 'Merge not available', 'Apvienošana nav pieejama')}</p>
                                <ul className="list-disc pl-5">{preview.blockers.map((blocker) => <li key={blocker}>{mergeBlockerText(l, blocker)}</li>)}</ul>
                                <p className="mt-1">{l('Такие случаи решаются вручную.', 'Such cases are resolved by hand.', 'Šādi gadījumi tiek risināti manuāli.')}</p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                <Checkbox checked={confirmed} onCheckedChange={setConfirmed}
                                    label={l('Я проверил(а): это один и тот же клиент', 'I have checked: this is the same customer', 'Esmu pārbaudījis(-usi): tas ir viens un tas pats klients')} />
                                <ReasonFields l={l} code={reasonCode} note={note} onCode={setReasonCode} onNote={setNote} />
                            </div>
                        )}
                        {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
                    </div>
                )}

                <DialogFooter>
                    <Button type="button" variant="outline" disabled={busy} onClick={onClose}>{l('Отмена', 'Cancel', 'Atcelt')}</Button>
                    <Button type="button" variant="destructive" disabled={!canSubmit} onClick={() => void submit()}>
                        {busy ? l('Объединение…', 'Merging…', 'Apvieno…') : l('Объединить', 'Merge', 'Apvienot')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

/** Undo of the merge just made, from its recovery record. */
export function AccountMergeUndoDialog({ sourceId, l, onClose, onRestored }: {
    sourceId: string | null;
    l: L;
    onClose: () => void;
    onRestored: () => void;
}): React.ReactElement {
    const [reasonCode, setReasonCode] = useState<MergeReasonCode | ''>('');
    const [note, setNote] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const submit = async () => {
        if (!sourceId || !reasonValid(reasonCode, note)) return;
        setBusy(true);
        setError('');
        try {
            const { ok, status, payload } = await sendJson('DELETE', { sourceId, reasonCode, note: note.trim() || null, confirmed: true });
            if (!ok) {
                setError(mergeErrorText(l, payload?.error as string | undefined, status));
                return;
            }
            onRestored();
        } catch {
            setError(l('Нет связи с сервером. Ничего не изменено — повторите.', 'No connection to the server. Nothing was changed — try again.', 'Nav savienojuma ar serveri. Nekas netika mainīts — mēģiniet vēlreiz.'));
        } finally {
            setBusy(false);
        }
    };

    return (
        <Dialog open={sourceId !== null} onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{l('Отменить объединение', 'Undo the merge', 'Atcelt apvienošanu')}</DialogTitle>
                    <DialogDescription>
                        {l(
                            'Старый аккаунт, его заказы и данные вернутся, аккаунт с картой получит прежний email и профиль. Пароль старого аккаунта не хранится: клиенту понадобится сброс пароля.',
                            'The old account, its orders and data come back; the card account gets its previous email and profile. The old account\'s password is not stored: the customer will need a password reset.',
                            'Vecais konts, tā pasūtījumi un dati tiks atjaunoti; konts ar karti saņems iepriekšējo e-pastu un profilu. Vecā konta parole netiek glabāta: klientam būs jāatiestata parole.',
                        )}
                    </DialogDescription>
                </DialogHeader>
                <ReasonFields l={l} code={reasonCode} note={note} onCode={setReasonCode} onNote={setNote} />
                {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
                <DialogFooter>
                    <Button type="button" variant="outline" disabled={busy} onClick={onClose}>{l('Закрыть', 'Close', 'Aizvērt')}</Button>
                    <Button type="button" variant="destructive" disabled={busy || !reasonValid(reasonCode, note)} onClick={() => void submit()}>
                        {busy ? l('Отмена…', 'Undoing…', 'Atceļ…') : l('Отменить объединение', 'Undo the merge', 'Atcelt apvienošanu')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
