'use client';

import React, { useId, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { CardHolder } from './client-barcodes-model';

type L = (ru: string, en: string, lv: string) => string;

const REASON_MAX = 500;
const CONSENT_NOTE_MIN = 3;

export function marketingSuppressedLabel(l: L): string {
    return l('Рассылки запрещены', 'Mailings blocked', 'Sūtījumi aizliegti');
}

/** Prominent red mark shown wherever a client with «Рассылки запрещены» is listed. */
export function MarketingSuppressedBadge({ l, title }: { l: L; title?: string }): React.ReactElement {
    return (
        <Badge variant="destructive" className="mt-1 whitespace-nowrap" title={title}>
            {marketingSuppressedLabel(l)}
        </Badge>
    );
}

function errorText(l: L, code: string | undefined, status: number): string {
    switch (code) {
        case 'already_suppressed':
            return l('Запрет уже установлен.', 'The block is already set.', 'Aizliegums jau ir iestatīts.');
        case 'not_suppressed':
            return l('Запрет уже снят.', 'The block has already been lifted.', 'Aizliegums jau ir atcelts.');
        case 'consent_confirmation_required':
            return l('Подтвердите новое согласие клиента и опишите, как оно получено.', 'Confirm the client\'s new consent and describe how it was obtained.', 'Apstipriniet klienta jauno piekrišanu un aprakstiet, kā tā iegūta.');
        case 'forbidden':
            return l('Недостаточно прав для этого действия.', 'Insufficient permission for this action.', 'Nepietiek tiesību šai darbībai.');
        case 'not_found':
            return l('Клиент не найден. Обновите страницу.', 'Client not found. Reload the page.', 'Klients nav atrasts. Pārlādējiet lapu.');
        default:
            return l(`Не удалось выполнить действие (HTTP ${status}).`, `The action failed (HTTP ${status}).`, `Darbība neizdevās (HTTP ${status}).`);
    }
}

async function sendSuppression(method: 'POST' | 'DELETE', body: Record<string, unknown>): Promise<{ ok: true } | { ok: false; code?: string; status: number }> {
    try {
        const response = await fetch('/api/admin/marketing-suppression', {
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

/**
 * The «Запретить рассылки и приглашения» switch on a client row. Turning it on asks for an
 * optional reason; turning it off is admin-only and requires confirming a new consent.
 */
export function MarketingSuppressionSwitch({ holder, l, locale, canLift, onRequest }: {
    holder: CardHolder;
    l: L;
    locale: string;
    canLift: boolean;
    onRequest: (holder: CardHolder, mode: 'set' | 'lift') => void;
}): React.ReactElement {
    const id = useId();
    const suppression = holder.marketingSuppression ?? null;
    const suppressed = suppression !== null;
    const details = suppression
        ? [
              `${l('С', 'Since', 'Kopš')} ${new Date(suppression.since).toLocaleDateString(locale)}`,
              suppression.setByName
                  ? `${l('установил', 'set by', 'iestatīja')} ${suppression.setByName}`
                  : suppression.source === 'self_service'
                    ? l('клиент отписался сам', 'unsubscribed by the client', 'klients atteicās pats')
                    : null,
              suppression.reason ? `${l('причина', 'reason', 'iemesls')}: ${suppression.reason}` : null,
          ].filter(Boolean).join(' · ')
        : '';
    return (
        <div className="mt-2 flex flex-col items-start gap-1">
            <label htmlFor={id} className="inline-flex items-center gap-2 text-xs text-foreground">
                <Switch
                    id={id}
                    checked={suppressed}
                    disabled={suppressed && !canLift}
                    onCheckedChange={(checked) => onRequest(holder, checked ? 'set' : 'lift')}
                    aria-label={l('Запретить рассылки и приглашения', 'Block mailings and invitations', 'Aizliegt sūtījumus un ielūgumus')}
                />
                <span className="whitespace-nowrap">{l('Запретить рассылки и приглашения', 'Block mailings and invitations', 'Aizliegt sūtījumus un ielūgumus')}</span>
            </label>
            {suppressed && details && <p className="w-56 whitespace-normal text-[11px] text-muted-foreground">{details}</p>}
            {suppressed && !canLift && (
                <p className="w-56 whitespace-normal text-[11px] text-muted-foreground">
                    {l('Снять запрет может только администратор.', 'Only an administrator can lift the block.', 'Aizliegumu var atcelt tikai administrators.')}
                </p>
            )}
        </div>
    );
}

/** Confirmation dialog for setting or lifting the block. Render with `key` so fields reset per client. */
export function MarketingSuppressionDialog({ request, l, onClose, onDone }: {
    request: { holder: CardHolder; mode: 'set' | 'lift' } | null;
    l: L;
    onClose: () => void;
    onDone: (holder: CardHolder, mode: 'set' | 'lift') => void;
}): React.ReactElement {
    const [reason, setReason] = useState('');
    const [consentConfirmed, setConsentConfirmed] = useState(false);
    const [consentNote, setConsentNote] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const mode = request?.mode ?? 'set';
    const holder = request?.holder ?? null;
    const canSubmit = mode === 'set' || (consentConfirmed && consentNote.trim().length >= CONSENT_NOTE_MIN);

    const submit = async () => {
        if (!holder || !canSubmit) return;
        setBusy(true);
        setError('');
        const result = mode === 'set'
            ? await sendSuppression('POST', { userId: holder.id, ...(reason.trim() ? { reason: reason.trim() } : {}) })
            : await sendSuppression('DELETE', { userId: holder.id, consentConfirmed: true, consentNote: consentNote.trim() });
        setBusy(false);
        if (result.ok) {
            onDone(holder, mode);
            return;
        }
        setError(errorText(l, result.code, result.status));
    };

    const name = holder?.name || holder?.email || '';
    return (
        <Dialog open={request !== null} onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>
                        {mode === 'set'
                            ? l('Запретить рассылки и приглашения?', 'Block mailings and invitations?', 'Aizliegt sūtījumus un ielūgumus?')
                            : l('Снять запрет рассылок?', 'Lift the mailing block?', 'Atcelt sūtījumu aizliegumu?')}
                    </DialogTitle>
                    <DialogDescription>
                        {mode === 'set'
                            ? l(
                                  `Клиент: ${name}. Клиент перестанет получать приглашения, рассылки и рекламные письма, в том числе уже запланированные и повторные. Письма о заказах, оплате, доставке, восстановлении пароля и безопасности продолжат приходить. Вход, карта, бонусы и заказы не меняются. Запрет действует для этого email во всех аккаунтах.`,
                                  `Client: ${name}. The client will stop receiving invitations, mailings and promotional emails, including scheduled and repeated ones. Emails about orders, payment, delivery, password recovery and security still arrive. Sign-in, card, bonuses and orders are not affected. The block applies to this email in every account.`,
                                  `Klients: ${name}. Klients vairs nesaņems ielūgumus, sūtījumus un reklāmas e-pastus, arī jau ieplānotos un atkārtotos. E-pasti par pasūtījumiem, apmaksu, piegādi, paroles atjaunošanu un drošību turpinās pienākt. Pieteikšanās, karte, bonusi un pasūtījumi nemainās. Aizliegums attiecas uz šo e-pastu visos kontos.`
                              )
                            : l(
                                  `Клиент: ${name}. Снимайте запрет только если клиент заново дал согласие на получение рассылок. Подтверждение и его описание сохранятся в журнале аудита.`,
                                  `Client: ${name}. Lift the block only if the client has given new consent to receive mailings. The confirmation and its description are kept in the audit log.`,
                                  `Klients: ${name}. Atceliet aizliegumu tikai tad, ja klients ir no jauna devis piekrišanu saņemt sūtījumus. Apstiprinājums un tā apraksts tiks saglabāts audita žurnālā.`
                              )}
                    </DialogDescription>
                </DialogHeader>
                <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
                    {mode === 'set' ? (
                        <Textarea
                            value={reason}
                            maxLength={REASON_MAX}
                            onChange={(e) => setReason(e.target.value)}
                            placeholder={l('Причина (необязательно), например: попросил по телефону', 'Reason (optional), e.g. asked by phone', 'Iemesls (nav obligāts), piem.: lūdza pa tālruni')}
                        />
                    ) : (
                        <>
                            <Checkbox
                                checked={consentConfirmed}
                                onCheckedChange={setConsentConfirmed}
                                label={l('Подтверждаю: клиент дал новое согласие на рассылки', 'I confirm: the client gave new consent to mailings', 'Apstiprinu: klients ir devis jaunu piekrišanu sūtījumiem')}
                            />
                            <Textarea
                                value={consentNote}
                                maxLength={REASON_MAX}
                                onChange={(e) => setConsentNote(e.target.value)}
                                placeholder={l('Как и когда получено согласие (обязательно)', 'How and when consent was obtained (required)', 'Kā un kad piekrišana iegūta (obligāti)')}
                            />
                        </>
                    )}
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
