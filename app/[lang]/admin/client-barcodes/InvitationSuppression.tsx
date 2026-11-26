'use client';

import React, { useId, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { CardHolder } from './client-barcodes-model';

type L = (ru: string, en: string, lv: string) => string;
const REASON_MIN = 3;
const REASON_MAX = 500;

export function InvitationSuppressedBadge({ l, title }: { l: L; title?: string }): React.ReactElement {
    return (
        <Badge className="mt-1 whitespace-nowrap bg-amber-600 text-white hover:bg-amber-600" title={title}>
            {l('Отказался от приглашений', 'Opted out of invitations', 'Atteicās no uzaicinājumiem')}
        </Badge>
    );
}

function errorText(l: L, code: string | undefined, status: number): string {
    switch (code) {
        case 'already_suppressed':
            return l('Запрет уже установлен.', 'The block is already set.', 'Aizliegums jau ir iestatīts.');
        case 'not_suppressed':
            return l('Запрет уже снят.', 'The block has already been lifted.', 'Aizliegums jau ir atcelts.');
        case 'reason_required':
            return l('Укажите причину (не короче 3 символов).', 'Enter a reason (at least 3 characters).', 'Norādiet iemeslu (vismaz 3 rakstzīmes).');
        case 'forbidden':
            return l('Недостаточно прав для этого действия.', 'Insufficient permission for this action.', 'Nepietiek tiesību šai darbībai.');
        case 'not_found':
            return l('Клиент не найден. Обновите страницу.', 'Client not found. Reload the page.', 'Klients nav atrasts. Pārlādējiet lapu.');
        default:
            return l(`Не удалось выполнить действие (HTTP ${status}).`, `The action failed (HTTP ${status}).`, `Darbība neizdevās (HTTP ${status}).`);
    }
}

async function sendRequest(method: 'POST' | 'DELETE', userId: string, reason: string): Promise<{ ok: true } | { ok: false; code?: string; status: number }> {
    try {
        const response = await fetch('/api/admin/invitation-suppression', {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, reason }),
        });
        if (response.ok) return { ok: true };
        const payload = await response.json().catch(() => null) as { error?: string } | null;
        return { ok: false, code: payload?.error, status: response.status };
    } catch {
        return { ok: false, status: 0 };
    }
}

export function InvitationSuppressionSwitch({ holder, l, locale, canLift, onRequest }: {
    holder: CardHolder;
    l: L;
    locale: string;
    canLift: boolean;
    onRequest: (holder: CardHolder, mode: 'set' | 'lift') => void;
}): React.ReactElement {
    const id = useId();
    const suppression = holder.invitationSuppression ?? null;
    const details = suppression
        ? [
              `${l('С', 'Since', 'Kopš')} ${new Date(suppression.since).toLocaleDateString(locale)}`,
              suppression.setByName
                  ? `${l('установил', 'set by', 'iestatīja')} ${suppression.setByName}`
                  : l('клиент подтвердил отказ по ссылке', 'confirmed by the client using the link', 'klients apstiprināja atteikumu saitē'),
              suppression.reason ? `${l('причина', 'reason', 'iemesls')}: ${suppression.reason}` : null,
          ].filter(Boolean).join(' · ')
        : '';
    return (
        <div className="mt-2 flex flex-col items-start gap-1">
            <label htmlFor={id} className="inline-flex items-center gap-2 text-xs text-foreground">
                <Switch
                    id={id}
                    checked={suppression !== null}
                    disabled={suppression !== null && !canLift}
                    onCheckedChange={(checked) => onRequest(holder, checked ? 'set' : 'lift')}
                    aria-label={l('Не приглашать повторно', 'Do not send further invitations', 'Turpmāk nesūtīt uzaicinājumus')}
                />
                <span className="whitespace-nowrap">{l('Не приглашать повторно', 'Do not send further invitations', 'Turpmāk nesūtīt uzaicinājumus')}</span>
            </label>
            {details && <p className="w-56 whitespace-normal text-[11px] text-muted-foreground">{details}</p>}
            {suppression && !canLift && (
                <p className="w-56 whitespace-normal text-[11px] text-muted-foreground">
                    {l('Снять запрет может только администратор.', 'Only an administrator can lift the block.', 'Aizliegumu var atcelt tikai administrators.')}
                </p>
            )}
        </div>
    );
}

export function InvitationSuppressionDialog({ request, l, onClose, onDone }: {
    request: { holder: CardHolder; mode: 'set' | 'lift' } | null;
    l: L;
    onClose: () => void;
    onDone: (holder: CardHolder, mode: 'set' | 'lift') => void;
}): React.ReactElement {
    const [reason, setReason] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const holder = request?.holder ?? null;
    const mode = request?.mode ?? 'set';
    const canSubmit = reason.trim().length >= REASON_MIN;

    const submit = async () => {
        if (!holder || !canSubmit) return;
        setBusy(true);
        setError('');
        const result = await sendRequest(mode === 'set' ? 'POST' : 'DELETE', holder.id, reason.trim());
        setBusy(false);
        if (result.ok) return onDone(holder, mode);
        setError(errorText(l, result.code, result.status));
    };

    const name = holder?.name || holder?.email || '';
    return (
        <Dialog open={request !== null} onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>
                        {mode === 'set'
                            ? l('Не приглашать клиента повторно?', 'Stop further invitations?', 'Turpmāk nesūtīt klientam uzaicinājumus?')
                            : l('Снять запрет повторных приглашений?', 'Lift the repeat-invitation block?', 'Atcelt atkārtotu uzaicinājumu aizliegumu?')}
                    </DialogTitle>
                    <DialogDescription>
                        {mode === 'set'
                            ? l(
                                  `Клиент: ${name}. Будут заблокированы только индивидуальные, массовые и уже подготовленные повторные приглашения. Самостоятельная активация, карта, бонусы, заказы и другие рассылки не изменятся.`,
                                  `Client: ${name}. Only individual, bulk, and already prepared repeat invitations will be blocked. Self-service activation, the card, bonuses, orders, and other mailings are unchanged.`,
                                  `Klients: ${name}. Tiks bloķēti tikai individuāli, masveida un jau sagatavoti atkārtoti uzaicinājumi. Patstāvīga aktivizācija, karte, bonusi, pasūtījumi un citi sūtījumi nemainīsies.`
                              )
                            : l(
                                  `Клиент: ${name}. Снятие этого ограничения не отменяет полный запрет рассылок, если он установлен.`,
                                  `Client: ${name}. Lifting this restriction does not remove a full mailing block if one is set.`,
                                  `Klients: ${name}. Šī ierobežojuma atcelšana neatceļ pilnu sūtījumu aizliegumu, ja tāds ir iestatīts.`
                              )}
                    </DialogDescription>
                </DialogHeader>
                <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
                    <Textarea
                        value={reason}
                        maxLength={REASON_MAX}
                        onChange={(event) => setReason(event.target.value)}
                        placeholder={l('Причина (обязательно)', 'Reason (required)', 'Iemesls (obligāts)')}
                    />
                    {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
                    <DialogFooter>
                        <Button type="button" variant="outline" disabled={busy} onClick={onClose}>{l('Отмена', 'Cancel', 'Atcelt')}</Button>
                        <Button type="submit" variant={mode === 'set' ? 'destructive' : 'default'} disabled={busy || !canSubmit}>
                            {busy
                                ? l('Сохранение…', 'Saving…', 'Saglabā…')
                                : mode === 'set'
                                  ? l('Запретить', 'Block', 'Aizliegt')
                                  : l('Снять запрет', 'Lift the block', 'Atcelt aizliegumu')}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
