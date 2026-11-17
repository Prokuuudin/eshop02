'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { CardHolder } from './client-barcodes-model';

type L = (ru: string, en: string, lv: string) => string;

export type RevokedCard = {
    cardNumber: string;
    userId: string;
    customerName: string | null;
    customerEmail: string | null;
    restorable: boolean;
    revokedAt: string | null;
    revokedByName: string | null;
    reason: string | null;
};

const MIN_REASON = 3;

function revocationErrorText(l: L, code: string | undefined, status: number): string {
    switch (code) {
        case 'already_revoked':
            return l('Эта карта уже отозвана.', 'This card is already revoked.', 'Šī karte jau ir atsaukta.');
        case 'card_changed':
            return l('Карта клиента только что изменилась. Обновите страницу.', 'The client\'s card has just changed. Reload the page.', 'Klienta karte tikko mainījās. Pārlādējiet lapu.');
        case 'card_reassigned':
            return l('Клиенту уже выдана другая карта — эту вернуть нельзя.', 'The client already has another card — this one cannot be restored.', 'Klientam jau ir cita karte — šo nevar atjaunot.');
        case 'staff_account':
            return l('Это аккаунт сотрудника — его карту отозвать нельзя.', 'This is a staff account — its card cannot be revoked.', 'Šis ir darbinieka konts — tā karti nevar atsaukt.');
        case 'card_protected':
            return l('Эту карту нельзя отозвать из админки — обратитесь к разработчику.', 'This card cannot be revoked from the admin panel — contact the developer.', 'Šo karti nevar atsaukt no administrēšanas paneļa — sazinieties ar izstrādātāju.');
        case 'not_restorable':
            return l('Эту карту вернуть нельзя: она отозвана не через админку.', 'This card cannot be restored: it was not revoked from the admin panel.', 'Šo karti nevar atjaunot: tā nav atsaukta no administrēšanas paneļa.');
        case 'card_taken':
            return l('Этот номер уже есть у другого клиента — вернуть карту нельзя.', 'Another client already holds this number — the card cannot be restored.', 'Šis numurs jau ir citam klientam — karti nevar atjaunot.');
        case 'forbidden':
            return l('Только администратор может отзывать и возвращать карты.', 'Only an administrator can revoke and restore cards.', 'Tikai administrators var atsaukt un atjaunot kartes.');
        default:
            return l(`Не удалось выполнить действие (HTTP ${status}).`, `The action failed (HTTP ${status}).`, `Darbība neizdevās (HTTP ${status}).`);
    }
}

async function sendRevocation(method: 'POST' | 'DELETE', body: Record<string, string>): Promise<{ ok: true } | { ok: false; code?: string; status: number }> {
    try {
        const response = await fetch('/api/admin/revoked-cards', {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (response.ok) return { ok: true };
        const payload = await response.json().catch(() => null) as { error?: string } | null;
        return { ok: false, code: payload?.error, status: response.status };
    } catch {
        return { ok: false, status: 0 };
    }
}

/** Confirmation dialog: revoking ends card login, hides the client from card lists and signs them out. Render it with
 * `key={holder?.id}` so the reason field starts empty for every client. */
export function RevokeCardDialog({ holder, l, onClose, onRevoked }: {
    holder: CardHolder | null;
    l: L;
    onClose: () => void;
    onRevoked: (holder: CardHolder) => void;
}): React.ReactElement {
    const [reason, setReason] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const submit = async () => {
        if (!holder?.cardNumber || reason.trim().length < MIN_REASON) return;
        setBusy(true);
        setError('');
        const result = await sendRevocation('POST', { userId: holder.id, cardNumber: holder.cardNumber, reason: reason.trim() });
        setBusy(false);
        if (result.ok) {
            onRevoked(holder);
            return;
        }
        setError(revocationErrorText(l, result.code, result.status));
    };

    const name = holder?.name || holder?.email || '';
    return (
        <Dialog open={holder !== null} onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{l(`Отозвать карту ${holder?.cardNumber ?? ''}?`, `Revoke card ${holder?.cardNumber ?? ''}?`, `Atsaukt karti ${holder?.cardNumber ?? ''}?`)}</DialogTitle>
                    <DialogDescription>
                        {l(
                            `Клиент: ${name}. По этой карте больше нельзя будет войти, её нельзя будет выдать другому, клиент пропадёт из списка держателей карт и выйдет со всех устройств. Заказы, бонусы и аккаунт сохраняются; позже клиенту можно выдать новую карту. Пока новая карта не выдана, отзыв можно отменить.`,
                            `Client: ${name}. The card can no longer be used to sign in or be issued to anyone else; the client leaves the card holder list and is signed out on all devices. Orders, bonus points and the account are kept; a new card can be issued later. Until then the revocation can be undone.`,
                            `Klients: ${name}. Ar šo karti vairs nevarēs pieteikties, to nevarēs izsniegt citam, klients pazudīs no karšu īpašnieku saraksta un tiks izrakstīts no visām ierīcēm. Pasūtījumi, bonusi un konts saglabājas; vēlāk klientam var izsniegt jaunu karti. Līdz tam atsaukšanu var atcelt.`
                        )}
                    </DialogDescription>
                </DialogHeader>
                <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
                    <Textarea
                        value={reason}
                        maxLength={500}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder={l('Причина (например, карта потеряна)', 'Reason (e.g. card lost)', 'Iemesls (piem., karte pazaudēta)')}
                    />
                    {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
                    <DialogFooter>
                        <Button type="button" variant="outline" disabled={busy} onClick={onClose}>{l('Отмена', 'Cancel', 'Atcelt')}</Button>
                        <Button type="submit" variant="destructive" disabled={busy || reason.trim().length < MIN_REASON}>
                            {busy ? l('Отзываем…', 'Revoking…', 'Atsauc…') : l('Отозвать карту', 'Revoke card', 'Atsaukt karti')}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

/** Cards revoked from the admin panel, with «Restore» while the client still holds that card. */
export function RevokedCardsPanel({ l, locale, refreshKey, onChanged }: {
    l: L;
    locale: string;
    refreshKey: number;
    onChanged: () => void;
}): React.ReactElement {
    const [open, setOpen] = useState(false);
    const [cards, setCards] = useState<RevokedCard[]>([]);
    const [batchCount, setBatchCount] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [restoring, setRestoring] = useState<{ cardNumber: string; reason: string } | null>(null);
    const [busy, setBusy] = useState(false);
    // The page rebuilds `l` on every render; reading it through a ref keeps `load` stable.
    const lRef = useRef(l);
    useEffect(() => {
        lRef.current = l;
    });

    const load = useCallback(async () => {
        const l = lRef.current;
        setLoading(true);
        setError('');
        try {
            const response = await fetch('/api/admin/revoked-cards', { cache: 'no-store' });
            const payload = await response.json().catch(() => null) as { cards?: RevokedCard[]; batchCount?: number; error?: string } | null;
            if (!response.ok || !payload?.cards) {
                setError(revocationErrorText(l, payload?.error, response.status));
                return;
            }
            setCards(payload.cards);
            setBatchCount(payload.batchCount ?? 0);
        } catch {
            setError(l('Нет связи с сервером.', 'No connection to the server.', 'Nav savienojuma ar serveri.'));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (open) queueMicrotask(() => void load());
    }, [open, refreshKey, load]);

    const restore = async () => {
        if (!restoring || restoring.reason.trim().length < MIN_REASON) return;
        setBusy(true);
        setError('');
        const result = await sendRevocation('DELETE', { cardNumber: restoring.cardNumber, reason: restoring.reason.trim() });
        setBusy(false);
        if (!result.ok) {
            setError(revocationErrorText(l, result.code, result.status));
            return;
        }
        setRestoring(null);
        await load();
        onChanged();
    };

    const formatDate = (iso: string | null) => (iso ? new Date(iso).toLocaleString(locale) : '—');

    return (
        <section className="rounded-lg border border-border bg-card p-6">
            <div className="flex items-center justify-between gap-4">
                <h2 className="text-xl font-semibold">{l('Отозванные карты', 'Revoked cards', 'Atsauktās kartes')}</h2>
                <Button size="sm" variant="outline" onClick={() => setOpen((value) => !value)}>
                    {open ? l('Свернуть', 'Collapse', 'Sakļaut') : l('Показать', 'Show', 'Rādīt')}
                </Button>
            </div>
            {open && (
                <div className="mt-4 space-y-3 text-sm">
                    <p className="text-muted-foreground">
                        {l(
                            `Здесь карты, отозванные через админку. Ещё ${batchCount} карт отозваны массово 16.11.2026 — они здесь не показаны и возвращаются только через разработчика.`,
                            `Cards revoked from the admin panel. Another ${batchCount} cards were revoked in bulk on 16.11.2026 — they are not listed here and can only be restored by the developer.`,
                            `Šeit ir no administrēšanas paneļa atsauktās kartes. Vēl ${batchCount} kartes tika atsauktas masveidā 16.11.2026 — tās šeit nav redzamas un tās var atjaunot tikai izstrādātājs.`
                        )}
                    </p>
                    {error && <p role="alert" className="text-red-600 dark:text-red-400">{error}</p>}
                    {loading ? (
                        <p className="text-muted-foreground">{l('Загрузка…', 'Loading…', 'Ielādē…')}</p>
                    ) : cards.length === 0 ? (
                        <p className="text-muted-foreground">{l('Отозванных через админку карт нет.', 'No cards revoked from the admin panel.', 'Nav no administrēšanas paneļa atsauktu karšu.')}</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead>
                                    <tr className="border-b border-border text-muted-foreground">
                                        <th className="pb-2 pr-4 font-medium">{l('Карта', 'Card', 'Karte')}</th>
                                        <th className="pb-2 pr-4 font-medium">{l('Клиент', 'Client', 'Klients')}</th>
                                        <th className="pb-2 pr-4 font-medium">{l('Отозвана', 'Revoked', 'Atsaukta')}</th>
                                        <th className="pb-2 pr-4 font-medium">{l('Кем', 'By', 'Kas')}</th>
                                        <th className="pb-2 pr-4 font-medium">{l('Причина', 'Reason', 'Iemesls')}</th>
                                        <th className="pb-2 font-medium">{l('Действие', 'Action', 'Darbība')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {cards.map((card) => (
                                        <tr key={card.cardNumber} className="border-b border-border align-top">
                                            <td className="py-2 pr-4 font-mono">{card.cardNumber}</td>
                                            <td className="py-2 pr-4">
                                                <div>{card.customerName || '—'}</div>
                                                <div className="text-xs text-muted-foreground">{card.customerEmail || ''}</div>
                                            </td>
                                            <td className="py-2 pr-4 whitespace-nowrap">{formatDate(card.revokedAt)}</td>
                                            <td className="py-2 pr-4">{card.revokedByName || '—'}</td>
                                            <td className="py-2 pr-4 max-w-xs whitespace-normal">{card.reason || '—'}</td>
                                            <td className="py-2">
                                                {!card.restorable ? (
                                                    <span className="text-xs text-muted-foreground">{l('Клиенту выдана другая карта', 'Client has another card', 'Klientam ir cita karte')}</span>
                                                ) : restoring?.cardNumber === card.cardNumber ? (
                                                    <form className="flex w-64 flex-col gap-2" onSubmit={(e) => { e.preventDefault(); void restore(); }}>
                                                        <Input
                                                            value={restoring.reason}
                                                            maxLength={500}
                                                            onChange={(e) => setRestoring({ cardNumber: card.cardNumber, reason: e.target.value })}
                                                            placeholder={l('Причина возврата', 'Reason for restoring', 'Atjaunošanas iemesls')}
                                                        />
                                                        <div className="flex gap-2">
                                                            <Button type="submit" size="sm" disabled={busy || restoring.reason.trim().length < MIN_REASON}>
                                                                {busy ? l('Возвращаем…', 'Restoring…', 'Atjauno…') : l('Вернуть', 'Restore', 'Atjaunot')}
                                                            </Button>
                                                            <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => setRestoring(null)}>
                                                                {l('Отмена', 'Cancel', 'Atcelt')}
                                                            </Button>
                                                        </div>
                                                    </form>
                                                ) : (
                                                    <Button size="sm" variant="outline" onClick={() => setRestoring({ cardNumber: card.cardNumber, reason: '' })}>
                                                        {l('Вернуть карту', 'Restore card', 'Atjaunot karti')}
                                                    </Button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}
        </section>
    );
}
