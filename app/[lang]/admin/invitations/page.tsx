'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import AdminGate from '@/components/admin/AdminGate';
import { useTranslation } from '@/lib/use-translation';

type Holder = {
    userId: string;
    name: string | null;
    email: string;
    cardNumber: string;
    status: 'none' | 'sent' | 'accepted' | 'expired' | 'error';
    sentAt: string | null;
    inviteUrl: string | null;
};

type CampaignState = {
    sentCount: number;
    errorCount: number;
    cursor: string | null;
    lastRunAt: string | null;
    finished: boolean;
    runningSince: string | null;
};

export default function AdminInvitationsPage() {
    const { language } = useTranslation();
    const l = (ru: string, en: string, lv: string) =>
        language === 'ru' ? ru : language === 'lv' ? lv : en;

    const [holders, setHolders] = useState<Holder[]>([]);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState('');
    const [formError, setFormError] = useState('');
    const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
    const [bulkBusy, setBulkBusy] = useState(false);
    const bulkStopRequested = useRef(false);

    // Форма назначения карты
    const [cardEmail, setCardEmail] = useState('');
    const [cardNumber, setCardNumber] = useState('');
    const [cardBusy, setCardBusy] = useState(false);

    // Кампания сегмента B
    const [campaign, setCampaign] = useState<CampaignState | null>(null);
    const [totalEligible, setTotalEligible] = useState(0);
    const [campaignRunning, setCampaignRunning] = useState(false);
    const stopRequested = useRef(false);

    const loadHolders = useCallback(async () => {
        try {
            const res = await fetch('/api/admin/invitations');
            const json = await res.json();
            if (res.ok) setHolders(json.holders ?? []);
        } finally {
            setLoading(false);
        }
    }, []);

    const loadCampaign = useCallback(async () => {
        const res = await fetch('/api/admin/card-rules-campaign');
        if (res.ok) {
            const json = await res.json();
            setCampaign(json.state);
            setTotalEligible(json.totalEligible ?? 0);
        }
    }, []);

    useEffect(() => {
        void loadHolders();
        void loadCampaign();
    }, [loadHolders, loadCampaign]);

    const sendInvites = async (userIds: string[]) => {
        setFormError('');
        setMessage('');
        // Письмо трёхъязычное (LV+RU+EN) — язык не передаём
        const res = await fetch('/api/admin/invitations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userIds }),
        });
        const json = await res.json();
        if (!res.ok) {
            setFormError(l('Не удалось отправить приглашения', 'Failed to send invitations', 'Neizdevās nosūtīt ielūgumus'));
            return;
        }
        const sent = (json.results ?? []).filter((r: { status: string }) => r.status === 'sent').length;
        const failed = (json.results ?? []).length - sent;
        setMessage(
            l(`Отправлено: ${sent}${failed ? `, ошибок: ${failed}` : ''}`,
              `Sent: ${sent}${failed ? `, errors: ${failed}` : ''}`,
              `Nosūtīts: ${sent}${failed ? `, kļūdas: ${failed}` : ''}`)
        );
        await loadHolders();
    };

    const handleInviteOne = async (userId: string) => {
        setBusyIds((prev) => new Set(prev).add(userId));
        try {
            await sendInvites([userId]);
        } finally {
            setBusyIds((prev) => { const next = new Set(prev); next.delete(userId); return next; });
        }
    };

    // Сервер принимает максимум INVITE_BATCH_SIZE id за запрос (lib/invitations.ts)
    const INVITE_BATCH = 20;

    const handleInviteAll = async () => {
        const ids = holders.filter((h) => h.status === 'none' || h.status === 'expired' || h.status === 'error').map((h) => h.userId);
        if (ids.length === 0) return;
        setBulkBusy(true);
        bulkStopRequested.current = false;
        setFormError('');
        let sent = 0;
        let failed = 0;
        try {
            for (let i = 0; i < ids.length; i += INVITE_BATCH) {
                if (bulkStopRequested.current) break;
                const res = await fetch('/api/admin/invitations', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userIds: ids.slice(i, i + INVITE_BATCH) }),
                });
                if (!res.ok) {
                    setFormError(l('Не удалось отправить приглашения', 'Failed to send invitations', 'Neizdevās nosūtīt ielūgumus'));
                    break;
                }
                const json = await res.json();
                const batchSent = (json.results ?? []).filter((r: { status: string }) => r.status === 'sent').length;
                sent += batchSent;
                failed += (json.results ?? []).length - batchSent;
                setMessage(
                    l(`Отправлено ${sent} из ${ids.length}${failed ? `, ошибок: ${failed}` : ''}…`,
                      `Sent ${sent} of ${ids.length}${failed ? `, errors: ${failed}` : ''}…`,
                      `Nosūtīts ${sent} no ${ids.length}${failed ? `, kļūdas: ${failed}` : ''}…`)
                );
            }
            setMessage(
                l(`Готово. Отправлено: ${sent}${failed ? `, ошибок: ${failed}` : ''}`,
                  `Done. Sent: ${sent}${failed ? `, errors: ${failed}` : ''}`,
                  `Gatavs. Nosūtīts: ${sent}${failed ? `, kļūdas: ${failed}` : ''}`)
            );
        } finally {
            setBulkBusy(false);
            await loadHolders();
        }
    };

    const handleAssignCard = async (e: React.FormEvent) => {
        e.preventDefault();
        setFormError('');
        setMessage('');
        setCardBusy(true);
        try {
            const res = await fetch('/api/admin/invitations/card', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: cardEmail, cardNumber }),
            });
            const json = await res.json();
            if (!res.ok) {
                const msg =
                    json.error === 'user_not_found'
                        ? l('Клиент с таким email не найден', 'No client with this email', 'Klients ar šādu e-pastu nav atrasts')
                        : json.error === 'card_taken'
                        ? l('Этот номер карты уже занят', 'This card number is already taken', 'Šis kartes numurs jau ir aizņemts')
                        : json.error === 'invalid_card'
                        ? l('Номер карты: 4–10 цифр', 'Card number: 4–10 digits', 'Kartes numurs: 4–10 cipari')
                        : l('Ошибка', 'Error', 'Kļūda');
                setFormError(msg);
                return;
            }
            setMessage(l(`Карта ${cardNumber} назначена ${cardEmail}`, `Card ${cardNumber} assigned to ${cardEmail}`, `Karte ${cardNumber} piešķirta ${cardEmail}`));
            setCardEmail('');
            setCardNumber('');
            await loadHolders();
        } finally {
            setCardBusy(false);
        }
    };

    const runCampaign = async () => {
        setCampaignRunning(true);
        stopRequested.current = false;
        try {
            // Цикл батчей до finished или остановки админом
            for (;;) {
                if (stopRequested.current) break;
                const res = await fetch('/api/admin/card-rules-campaign', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({}),
                });
                const json = await res.json();
                if (json.state) setCampaign(json.state);
                if (!res.ok || json.state?.finished) break;
            }
        } finally {
            setCampaignRunning(false);
        }
    };

    const resetCampaign = async () => {
        const res = await fetch('/api/admin/card-rules-campaign', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reset: true }),
        });
        const json = await res.json();
        if (json.state) setCampaign(json.state);
    };

    const STATUS_LABEL: Record<Holder['status'], string> = {
        none: l('не приглашён', 'not invited', 'nav ielūgts'),
        sent: l('отправлено', 'sent', 'nosūtīts'),
        accepted: l('зарегистрировался', 'registered', 'reģistrējies'),
        expired: l('просрочено', 'expired', 'beidzies termiņš'),
        error: l('ошибка отправки', 'send error', 'sūtīšanas kļūda'),
    };
    const STATUS_CLASS: Record<Holder['status'], string> = {
        none: 'bg-muted text-muted-foreground',
        sent: 'bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300',
        accepted: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300',
        expired: 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300',
        error: 'bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300',
    };

    const uninvitedCount = holders.filter((h) => h.status === 'none' || h.status === 'expired' || h.status === 'error').length;

    return (
        <AdminGate>
            <main className="w-full py-4 space-y-6">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-bold text-foreground">
                            {l('Приглашения клиентов', 'Client invitations', 'Klientu ielūgumi')}
                        </h1>
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

                {/* ── Сегмент A: держатели карт ── */}
                <section className="rounded-lg border border-border bg-card p-6 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <h2 className="text-xl font-semibold text-foreground">
                            {l('Клиенты с картой', 'Clients with a card', 'Klienti ar karti')}{' '}
                            <span className="text-gray-400 dark:text-gray-500 font-normal text-base">{holders.length}</span>
                        </h2>
                        <div className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground">LV+RU+EN</span>
                            {bulkBusy ? (
                                <Button variant="outline" onClick={() => { bulkStopRequested.current = true; }}>
                                    {l('Остановить после порции', 'Stop after batch', 'Apturēt pēc partijas')}
                                </Button>
                            ) : (
                                <Button onClick={handleInviteAll} disabled={uninvitedCount === 0}>
                                    {l(`Пригласить всех (${uninvitedCount})`, `Invite all (${uninvitedCount})`, `Ielūgt visus (${uninvitedCount})`)}
                                </Button>
                            )}
                        </div>
                    </div>

                    {loading ? (
                        <p className="text-sm text-muted-foreground animate-pulse py-4">{l('Загрузка…', 'Loading…', 'Ielādē…')}</p>
                    ) : holders.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                            {l(
                                'Пока нет клиентов с картой. Назначьте карту через форму ниже или дождитесь импорта из ERP.',
                                'No clients with a card yet. Assign a card below or wait for the ERP import.',
                                'Pagaidām nav klientu ar karti. Piešķiriet karti zemāk vai gaidiet ERP importu.'
                            )}
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-border text-left text-muted-foreground">
                                        <th className="py-2 pr-4 font-medium">{l('Имя', 'Name', 'Vārds')}</th>
                                        <th className="py-2 pr-4 font-medium">Email</th>
                                        <th className="py-2 pr-4 font-medium">{l('Карта', 'Card', 'Karte')}</th>
                                        <th className="py-2 pr-4 font-medium">{l('Статус', 'Status', 'Statuss')}</th>
                                        <th className="py-2 pr-4 font-medium">{l('Отправлено', 'Sent', 'Nosūtīts')}</th>
                                        <th className="py-2 font-medium"></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {holders.map((h) => (
                                        <tr key={h.userId} className="border-b border-border/50">
                                            <td className="py-2 pr-4 text-foreground">{h.name || '—'}</td>
                                            <td className="py-2 pr-4 text-foreground">{h.email}</td>
                                            <td className="py-2 pr-4 font-mono text-foreground">{h.cardNumber}</td>
                                            <td className="py-2 pr-4">
                                                <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[h.status]}`}>
                                                    {STATUS_LABEL[h.status]}
                                                </span>
                                            </td>
                                            <td className="py-2 pr-4 text-muted-foreground">
                                                {h.sentAt ? new Date(h.sentAt).toLocaleDateString('ru-RU') : '—'}
                                            </td>
                                            <td className="py-2 text-right whitespace-nowrap">
                                                {h.status !== 'accepted' && (
                                                    <Button
                                                        size="sm"
                                                        variant={h.status === 'none' ? 'default' : 'outline'}
                                                        disabled={busyIds.has(h.userId)}
                                                        onClick={() => handleInviteOne(h.userId)}
                                                    >
                                                        {busyIds.has(h.userId)
                                                            ? l('Отправка…', 'Sending…', 'Sūta…')
                                                            : h.status === 'none'
                                                            ? l('Пригласить', 'Invite', 'Ielūgt')
                                                            : l('Повторно', 'Resend', 'Atkārtoti')}
                                                    </Button>
                                                )}
                                                {h.inviteUrl && (
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        className="ml-1"
                                                        onClick={() => { void navigator.clipboard.writeText(h.inviteUrl!); }}
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

                    {/* Ручное назначение карты (до ERP-импорта) */}
                    <form onSubmit={handleAssignCard} className="rounded-md border border-border p-4 grid grid-cols-1 sm:grid-cols-[1.5fr_1fr_auto] gap-3 items-end">
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

                {/* ── Сегмент B: остальные клиенты ── */}
                <section className="rounded-lg border border-border bg-card p-6 space-y-4">
                    <h2 className="text-xl font-semibold text-foreground">
                        {l('Остальные клиенты — правила получения карты', 'Other clients — how to get a card', 'Pārējie klienti — kā saņemt karti')}
                    </h2>
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
                                <p className="text-lg font-semibold text-foreground">{totalEligible.toLocaleString('ru-RU')}</p>
                            </div>
                            <div className="rounded-md border border-border p-3">
                                <p className="text-muted-foreground">{l('Отправлено', 'Sent', 'Nosūtīts')}</p>
                                <p className="text-lg font-semibold text-foreground">{campaign.sentCount.toLocaleString('ru-RU')}</p>
                            </div>
                            <div className="rounded-md border border-border p-3">
                                <p className="text-muted-foreground">{l('Ошибок', 'Errors', 'Kļūdas')}</p>
                                <p className="text-lg font-semibold text-foreground">{campaign.errorCount}</p>
                            </div>
                            <div className="rounded-md border border-border p-3">
                                <p className="text-muted-foreground">{l('Статус', 'Status', 'Statuss')}</p>
                                <p className="text-lg font-semibold text-foreground">
                                    {campaign.finished
                                        ? l('Завершена', 'Finished', 'Pabeigta')
                                        : campaign.sentCount + campaign.errorCount > 0
                                        ? l('В процессе', 'In progress', 'Procesā')
                                        : l('Не начата', 'Not started', 'Nav sākta')}
                                </p>
                            </div>
                        </div>
                    )}

                    <div className="flex flex-wrap gap-2">
                        {campaignRunning ? (
                            <Button variant="outline" onClick={() => { stopRequested.current = true; }}>
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
                </section>
            </main>
        </AdminGate>
    );
}
