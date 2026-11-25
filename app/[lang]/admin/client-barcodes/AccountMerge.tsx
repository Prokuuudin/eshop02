'use client';

import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { MergeAccountSummary, MergeBlocker, MergePreview } from '@/lib/admin-account-merge';

type L = (ru: string, en: string, lv: string) => string;

export type AccountMergeRequest = { sourceId: string; targetId: string };

const MIN_REASON = 5;

export function mergeBlockerText(l: L, blocker: MergeBlocker): string {
    switch (blocker) {
        case 'same_account': return l('Это один и тот же аккаунт.', 'This is the same account.', 'Tas ir viens un tas pats konts.');
        case 'staff_account': return l('Один из аккаунтов — аккаунт сотрудника.', 'One of the accounts is a staff account.', 'Viens no kontiem ir darbinieka konts.');
        case 'not_customer': return l('Объединять можно только клиентские аккаунты.', 'Only customer accounts can be merged.', 'Apvienot var tikai klientu kontus.');
        case 'source_has_card': return l('У старого аккаунта есть карта.', 'The old account has a card.', 'Vecajam kontam ir karte.');
        case 'source_no_email': return l('У старого аккаунта нет настоящего email.', 'The old account has no real email.', 'Vecajam kontam nav īstas e-pasta adreses.');
        case 'source_erased': return l('Старый аккаунт анонимизирован (GDPR).', 'The old account was anonymised (GDPR).', 'Vecais konts ir anonimizēts (GDPR).');
        case 'source_revoked_card': return l('У старого аккаунта была отозванная карта.', 'The old account held a revoked card.', 'Vecajam kontam bija atsaukta karte.');
        case 'source_activated': return l('Старый аккаунт уже активирован в новом магазине (вход, пароль или согласие).', 'The old account was already activated in the new shop (login, password or consent).', 'Vecais konts jau aktivizēts jaunajā veikalā (pieteikšanās, parole vai piekrišana).');
        case 'source_company': return l('Старый аккаунт связан с компанией.', 'The old account belongs to a company.', 'Vecais konts ir saistīts ar uzņēmumu.');
        case 'source_bonus_balance': return l('У старого аккаунта есть бонусный баланс.', 'The old account has a bonus balance.', 'Vecajam kontam ir bonusu atlikums.');
        case 'source_bonus_history': return l('У старого аккаунта есть бонусные операции.', 'The old account has bonus transactions.', 'Vecajam kontam ir bonusu darījumi.');
        case 'source_sessions': return l('У старого аккаунта есть сессии входа.', 'The old account has login sessions.', 'Vecajam kontam ir pieteikšanās sesijas.');
        case 'source_invitations': return l('Старому аккаунту отправлялись приглашения.', 'Invitations were sent to the old account.', 'Vecajam kontam tika sūtīti ielūgumi.');
        case 'source_pending_tokens': return l('У старого аккаунта есть незавершённый сброс пароля или вход.', 'The old account has a pending password reset or login.', 'Vecajam kontam ir nepabeigta paroles atiestatīšana vai pieteikšanās.');
        case 'source_linked_records': return l('Старый аккаунт связан со служебными записями.', 'The old account is linked to staff records.', 'Vecais konts ir saistīts ar dienesta ierakstiem.');
        case 'target_no_card': return l('У сохраняемого аккаунта нет карты.', 'The kept account has no card.', 'Saglabājamajam kontam nav kartes.');
        case 'target_card_revoked': return l('Карта сохраняемого аккаунта отозвана.', 'The kept account\'s card is revoked.', 'Saglabājamā konta karte ir atsaukta.');
        case 'target_erased': return l('Сохраняемый аккаунт анонимизирован (GDPR).', 'The kept account was anonymised (GDPR).', 'Saglabājamais konts ir anonimizēts (GDPR).');
    }
}

function mergeErrorText(l: L, code: string | undefined, status: number): string {
    switch (code) {
        case 'blocked': return l('Объединение невозможно — см. причины выше.', 'The merge is not possible — see the reasons above.', 'Apvienošana nav iespējama — skatiet iemeslus augstāk.');
        case 'optimistic_conflict':
        case 'concurrent_update':
            return l('Один из аккаунтов только что изменился. Ничего не изменено — откройте объединение заново.', 'One of the accounts has just changed. Nothing was changed — open the merge again.', 'Viens no kontiem tikko mainījās. Nekas netika mainīts — atveriet apvienošanu vēlreiz.');
        case 'already_merged': return l('Этот аккаунт уже объединён с другим клиентом.', 'This account was already merged into another customer.', 'Šis konts jau ir apvienots ar citu klientu.');
        case 'not_found': return l('Аккаунт не найден. Обновите страницу.', 'Account not found. Reload the page.', 'Konts nav atrasts. Pārlādējiet lapu.');
        case 'forbidden': return l('Объединять аккаунты может только администратор.', 'Only an administrator can merge accounts.', 'Kontus var apvienot tikai administrators.');
        case 'card_policy_unavailable': return l('Реестр отозванных карт недоступен. Повторите позже.', 'The revoked card registry is unavailable. Try again later.', 'Atsaukto karšu reģistrs nav pieejams. Mēģiniet vēlāk.');
        default: return l(`Не удалось выполнить (HTTP ${status}).`, `The action failed (HTTP ${status}).`, `Darbība neizdevās (HTTP ${status}).`);
    }
}

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
    return [
        [l('Заказы', 'Orders', 'Pasūtījumi'), c['Order.userId'] ?? 0],
        [l('Сохранённые адреса', 'Saved addresses', 'Saglabātās adreses'), c['SavedAddress.userId'] ?? 0],
        [l('Избранное', 'Wishlist', 'Vēlmju saraksts'), (c['WishlistItem.userId'] ?? 0) - preview.transfer.wishlistDuplicates],
        [l('Подписки на новости товаров', 'Product news subscriptions', 'Preču jaunumu abonementi'), (c['ProductNewsSubscription.userId'] ?? 0) - preview.transfer.productNewsDuplicates],
        [l('Использованные промокоды', 'Used promo codes', 'Izmantotie atlaižu kodi'), c['PromoCodeRedemption.userId'] ?? 0],
        [l('Уведомления', 'Notifications', 'Paziņojumi'), c['UserNotification.userId'] ?? 0],
    ];
}

export function AccountMergeDialog({ request, l, locale, onClose, onMerged }: {
    request: AccountMergeRequest | null;
    l: L;
    locale: string;
    onClose: () => void;
    onMerged: (result: { email: string; alreadyMerged: boolean }) => void;
}): React.ReactElement {
    const [preview, setPreview] = useState<MergePreview | null>(null);
    const [loadError, setLoadError] = useState('');
    const [confirmed, setConfirmed] = useState(false);
    const [reason, setReason] = useState('');
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

    const canSubmit = preview !== null && preview.blockers.length === 0 && confirmed && reason.trim().length >= MIN_REASON && !busy;

    const submit = async () => {
        if (!preview || !canSubmit) return;
        setBusy(true);
        setError('');
        try {
            const response = await fetch('/api/admin/users/merge', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sourceId: preview.source.id,
                    targetId: preview.target.id,
                    sourceUpdatedAt: preview.source.updatedAt,
                    targetUpdatedAt: preview.target.updatedAt,
                    reason: reason.trim(),
                    confirmed: true,
                }),
            });
            const payload = await response.json().catch(() => null) as { error?: string; blockers?: MergeBlocker[]; email?: string; alreadyMerged?: boolean } | null;
            if (!response.ok) {
                if (payload?.blockers?.length) setPreview({ ...preview, blockers: payload.blockers });
                setError(mergeErrorText(l, payload?.error, response.status));
                return;
            }
            onMerged({ email: payload?.email ?? preview.source.email, alreadyMerged: payload?.alreadyMerged === true });
        } catch {
            setError(l('Нет связи с сервером. Ничего не изменено — повторите.', 'No connection to the server. Nothing was changed — try again.', 'Nav savienojuma ar serveri. Nekas netika mainīts — mēģiniet vēlreiz.'));
        } finally {
            setBusy(false);
        }
    };

    return (
        <Dialog open={request !== null} onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
                <DialogHeader>
                    <DialogTitle>{l('Объединить аккаунты', 'Merge accounts', 'Apvienot kontus')}</DialogTitle>
                    <DialogDescription>
                        {l(
                            'История старого аккаунта без карты переносится на аккаунт с картой, старый аккаунт удаляется, его email получает аккаунт с картой. Объединяйте, только если уверены, что это один и тот же человек.',
                            'The history of the old account without a card moves to the card account, the old account is deleted and the card account gets its email. Merge only if you are sure this is the same person.',
                            'Vecā konta bez kartes vēsture tiek pārnesta uz konta ar karti, vecais konts tiek dzēsts, un konts ar karti saņem tā e-pastu. Apvienojiet tikai tad, ja esat pārliecināts, ka tā ir viena un tā pati persona.',
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
                            {(preview.transfer.wishlistDuplicates > 0 || preview.transfer.productNewsDuplicates > 0) && (
                                <p className="mt-1 text-muted-foreground">
                                    {l('Повторы (тот же товар уже есть у аккаунта с картой) не переносятся', 'Duplicates (same product already on the card account) are not moved', 'Dublikāti (tā pati prece jau ir kontam ar karti) netiek pārnesti')}: {preview.transfer.wishlistDuplicates + preview.transfer.productNewsDuplicates}
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
                                <Textarea value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)}
                                    placeholder={l('Причина и как проверено (минимум 5 символов) — попадёт в журнал аудита', 'Reason and how it was checked (at least 5 characters) — recorded in the audit log', 'Iemesls un kā pārbaudīts (vismaz 5 rakstzīmes) — tiks ierakstīts audita žurnālā')} />
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
