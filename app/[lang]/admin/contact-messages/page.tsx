'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Check, CircleAlert, ExternalLink, Mail, MessageSquareText, RotateCcw, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAdminLocale } from '@/lib/use-admin-locale';
import { reportAdminPartial } from '@/lib/admin-ui-errors';

type Filter = 'unanswered' | 'answered' | 'all';
type ContactMessage = {
    id: string;
    name: string;
    email: string;
    subject: string;
    message: string;
    createdAt: string;
    answeredAt: string | null;
};
type ContactSummary = {
    all: number;
    unanswered: number;
    answered: number;
    notificationConfigured: boolean;
    lastDelivery: { emailStatus: string; createdAt: string } | null;
};

export default function ContactMessagesPage(): React.ReactElement {
    const { l, locale } = useAdminLocale();
    const [filter, setFilter] = useState<Filter>('unanswered');
    const [messages, setMessages] = useState<ContactMessage[] | null>(null);
    const [total, setTotal] = useState(0);
    const [summary, setSummary] = useState<ContactSummary | null>(null);
    const [updatingId, setUpdatingId] = useState<string | null>(null);
    const loadMessages = useCallback(async () => {
        try {
            const response = await fetch(`/api/admin/contact-messages?status=${filter}&limit=100`, {
                cache: 'no-store',
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = (await response.json()) as { messages?: ContactMessage[]; total?: number; summary?: ContactSummary };
            setMessages(data.messages ?? []);
            setTotal(data.total ?? 0);
            setSummary(data.summary ?? null);
        } catch {
            setMessages([]);
            reportAdminPartial(
                l(
                    'Не удалось загрузить обращения.',
                    'Could not load requests.',
                    'Neizdevās ielādēt pieprasījumus.'
                ),
                'Contact messages'
            );
        }
    }, [filter, l]);

    useEffect(() => {
        // The state updates happen only after the asynchronous request resolves.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        void loadMessages();
    }, [loadMessages]);

    const setAnswered = async (id: string, answered: boolean) => {
        setUpdatingId(id);
        try {
            const response = await fetch('/api/admin/contact-messages', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, answered }),
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            await loadMessages();
        } catch {
            reportAdminPartial(
                l(
                    'Не удалось изменить статус.',
                    'Could not update status.',
                    'Neizdevās mainīt statusu.'
                ),
                'Contact messages'
            );
        } finally {
            setUpdatingId(null);
        }
    };

    const labels: Record<Filter, string> = {
        unanswered: l('Без ответа', 'Unanswered', 'Neatbildēti'),
        answered: l('Отвеченные', 'Answered', 'Atbildēti'),
        all: l('Все', 'All', 'Visi'),
    };
    const deliveryLabel = (status: string): string => ({
        sent: l('доставлено', 'delivered', 'piegādāts'),
        failed: l('ошибка доставки', 'delivery failed', 'piegādes kļūda'),
        not_configured: l('канал не настроен', 'channel not configured', 'kanāls nav konfigurēts'),
        pending: l('отправляется', 'sending', 'tiek sūtīts'),
    }[status] ?? status);

    return (
        <main className="py-4 text-foreground">
            <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
                <div>
                    <h1 className="flex items-center gap-2 text-3xl font-bold">
                        <MessageSquareText className="h-7 w-7 text-rose-600" />
                        {l('Контакты и обращения клиентов', 'Client contacts and requests', 'Klientu kontakti un pieprasījumi')}
                    </h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                        {l(
                            'Рабочая очередь сообщений, отправленных клиентами через сайт',
                            'Work queue for messages submitted by clients through the website',
                            'Darba rinda klientu ziņojumiem, kas nosūtīti vietnē'
                        )}
                    </p>
                </div>
                <span className="text-sm text-muted-foreground">
                    {l('Найдено', 'Found', 'Atrasti')}: {total}
                </span>
            </div>

            <section className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label={l('Сводка обращений', 'Request summary', 'Pieprasījumu kopsavilkums')}>
                {[
                    { label: l('Все обращения', 'All requests', 'Visi pieprasījumi'), value: summary?.all ?? '—', icon: Users },
                    { label: l('Ждут ответа', 'Awaiting reply', 'Gaida atbildi'), value: summary?.unanswered ?? '—', icon: CircleAlert },
                    { label: l('Обработано', 'Handled', 'Apstrādāti'), value: summary?.answered ?? '—', icon: Check },
                ].map(({ label, value, icon: Icon }) => (
                    <div key={label} className="rounded-xl border border-border bg-card p-4 shadow-sm">
                        <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground"><span>{label}</span><Icon className="h-4 w-4" /></div>
                        <p className="mt-2 text-2xl font-bold">{value}</p>
                    </div>
                ))}
                <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
                    <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground"><span>{l('Email-уведомления', 'Email notifications', 'E-pasta paziņojumi')}</span><Mail className="h-4 w-4" /></div>
                    <p className={`mt-2 font-semibold ${summary?.notificationConfigured ? 'text-emerald-600' : 'text-amber-600'}`}>
                        {summary === null ? '—' : summary.notificationConfigured
                            ? l('Настроены', 'Configured', 'Konfigurēti')
                            : l('Не настроены', 'Not configured', 'Nav konfigurēti')}
                    </p>
                    {summary?.lastDelivery && (
                        <p className="mt-1 text-xs text-muted-foreground">
                            {l('Последнее уведомление', 'Latest notification', 'Jaunākais paziņojums')}: {deliveryLabel(summary.lastDelivery.emailStatus)}
                        </p>
                    )}
                </div>
            </section>

            <div className="mb-6 flex flex-wrap gap-2">
                <Button asChild size="sm">
                    <Link href="/admin/content?section=contact">
                        {l('Редактировать форму', 'Edit form', 'Rediģēt formu')}
                    </Link>
                </Button>
                <Button asChild variant="outline" size="sm">
                    <Link href="/contact" target="_blank">
                        <ExternalLink className="mr-1.5 h-4 w-4" />
                        {l('Открыть форму клиента', 'Open client form', 'Atvērt klienta formu')}
                    </Link>
                </Button>
            </div>

            <div className="mb-5 flex flex-wrap gap-2">
                {(Object.keys(labels) as Filter[]).map((value) => (
                    <Button
                        key={value}
                        type="button"
                        size="sm"
                        variant={filter === value ? 'default' : 'outline'}
                        onClick={() => {
                            setMessages(null);
                            setFilter(value);
                        }}
                    >
                        {labels[value]}
                    </Button>
                ))}
            </div>

            {messages === null ? (
                <div className="rounded-xl border border-border bg-card py-16 text-center text-muted-foreground">
                    {l('Загрузка…', 'Loading…', 'Ielāde…')}
                </div>
            ) : messages.length === 0 ? (
                <div className="rounded-xl border border-border bg-card py-16 text-center text-muted-foreground">
                    {l(
                        'Обращений в этой категории нет',
                        'No requests in this category',
                        'Šajā kategorijā nav pieprasījumu'
                    )}
                </div>
            ) : (
                <div className="space-y-3">
                    {messages.map((item) => (
                        <article
                            key={item.id}
                            className="rounded-xl border border-border bg-card p-5 shadow-sm"
                        >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <h2 className="font-semibold">{item.subject}</h2>
                                        <span
                                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                                                item.answeredAt
                                                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                                                    : 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'
                                            }`}
                                        >
                                            {item.answeredAt ? labels.answered : labels.unanswered}
                                        </span>
                                    </div>
                                    <p className="mt-1 text-sm text-muted-foreground">
                                        {item.name} ·{' '}
                                        <a
                                            className="hover:underline"
                                            href={`mailto:${item.email}`}
                                        >
                                            {item.email}
                                        </a>{' '}
                                        ·{' '}
                                        {new Date(item.createdAt).toLocaleString(locale, {
                                            dateStyle: 'medium',
                                            timeStyle: 'short',
                                        })}
                                    </p>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    <Button asChild size="sm">
                                        <a
                                            href={`mailto:${
                                                item.email
                                            }?subject=${encodeURIComponent(`Re: ${item.subject}`)}`}
                                        >
                                            <Mail className="mr-1.5 h-4 w-4" />
                                            {l('Ответить', 'Reply', 'Atbildēt')}
                                        </a>
                                    </Button>
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        disabled={updatingId === item.id}
                                        onClick={() => void setAnswered(item.id, !item.answeredAt)}
                                    >
                                        {item.answeredAt ? (
                                            <RotateCcw className="mr-1.5 h-4 w-4" />
                                        ) : (
                                            <Check className="mr-1.5 h-4 w-4" />
                                        )}
                                        {item.answeredAt
                                            ? l(
                                                  'Вернуть без ответа',
                                                  'Mark unanswered',
                                                  'Atzīmēt kā neatbildētu'
                                              )
                                            : l(
                                                  'Отметить отвеченным',
                                                  'Mark answered',
                                                  'Atzīmēt kā atbildētu'
                                              )}
                                    </Button>
                                </div>
                            </div>
                            <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-foreground/85">
                                {item.message}
                            </p>
                        </article>
                    ))}
                </div>
            )}
        </main>
    );
}
