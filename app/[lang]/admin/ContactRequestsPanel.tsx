'use client';

import { Button } from '@/components/ui/button';

export type UnansweredContactMessage = {
    id: string;
    name: string;
    email: string;
    subject: string;
    message: string;
    createdAt: string;
};

type Localize = (ru: string, en: string, lv: string) => string;
type Props = {
    requests: UnansweredContactMessage[] | null;
    total: number;
    answeringId: string | null;
    timestamp: number;
    locale: string;
    l: Localize;
    onMarkAnswered: (id: string) => Promise<void>;
};

export default function ContactRequestsPanel({ requests: contactRequests, total: contactRequestTotal, answeringId: answeringRequestId, timestamp: dashboardTimestamp, locale, l, onMarkAnswered: markContactRequestAnswered }: Props): React.ReactElement {
    return (
        <>
            {contactRequests !== null && contactRequestTotal > 0 && (
                <section className="mt-4 mb-8 overflow-hidden rounded-xl border border-rose-200 bg-card shadow-sm dark:border-rose-900/70">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-rose-50 px-5 py-4 dark:bg-rose-950/20">
                        <div>
                            <div className="flex items-center gap-2">
                                <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-rose-600 px-2 text-sm font-bold text-white">{contactRequestTotal}</span>
                                <h2 className="font-semibold text-foreground">{l('Запросы покупателей без ответа', 'Unanswered customer requests', 'Neatbildēti klientu pieprasījumi')}</h2>
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">{l('Сначала показаны самые старые', 'Oldest requests are shown first', 'Vispirms tiek rādīti vecākie pieprasījumi')}</p>
                        </div>
                    </div>
                    <div className="divide-y divide-border">
                        {contactRequests.map((request) => {
                            const createdAt = new Date(request.createdAt);
                            const ageHours = Math.max(0, Math.floor((dashboardTimestamp - createdAt.getTime()) / 3_600_000));
                            const waitingLabel =
                                ageHours < 1
                                    ? l('меньше часа', 'less than an hour', 'mazak par stundu')
                                    : ageHours < 24
                                    ? l(`${ageHours} ч`, `${ageHours}h`, `${ageHours} st.`)
                                    : l(`${Math.floor(ageHours / 24)} дн.`, `${Math.floor(ageHours / 24)}d`, `${Math.floor(ageHours / 24)} d.`);
                            const mailto = `mailto:${request.email}?subject=${encodeURIComponent(`Re: ${request.subject}`)}`;
                            return (
                                <article key={request.id} className="grid gap-3 px-5 py-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                                    <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                            <p className="font-medium text-foreground">{request.subject}</p>
                                            <span className={`text-xs ${ageHours >= 24 ? 'font-semibold text-rose-600 dark:text-rose-400' : 'text-muted-foreground'}`}>
                                                {l('ожидает', 'waiting', 'gaida')} {waitingLabel}
                                            </span>
                                        </div>
                                        <p className="mt-1 text-sm text-muted-foreground">
                                            {request.name} · {request.email} ·{' '}
                                            {createdAt.toLocaleString(locale, {
                                                dateStyle: 'short',
                                                timeStyle: 'short',
                                            })}
                                        </p>
                                        <p className="mt-2 line-clamp-2 text-sm text-foreground/80">{request.message}</p>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        <Button asChild size="sm">
                                            <a href={mailto}>{l('Ответить', 'Reply', 'Atbildet')}</a>
                                        </Button>
                                        <Button type="button" variant="outline" size="sm" disabled={answeringRequestId === request.id} onClick={() => void markContactRequestAnswered(request.id)}>
                                            {answeringRequestId === request.id ? l('Сохраняю…', 'Saving…', 'Saglabaju…') : l('Отметить отвеченным', 'Mark answered', 'Atzīmēt kā atbildētu')}
                                        </Button>
                                    </div>
                                </article>
                            );
                        })}
                    </div>
                </section>
            )}
            
        </>
    );
}

