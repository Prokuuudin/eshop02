'use client';

import { useEffect, useState } from 'react';
import { ArrowRight, MessageSquareText } from 'lucide-react';
import Link from 'next/link';
import { reportAdminPartial } from '@/lib/admin-ui-errors';
import { useAdminLocale } from '@/lib/use-admin-locale';

type ContactRequest = {
    id: string;
    email: string;
    subject: string;
    createdAt: string;
};

export default function UnansweredCustomerRequests(): React.ReactElement {
    const { l } = useAdminLocale();
    const [requests, setRequests] = useState<ContactRequest[] | null>(null);
    const [total, setTotal] = useState(0);
    const [loadedAt] = useState(Date.now);
    useEffect(() => {
        const controller = new AbortController();
        fetch('/api/admin/contact-messages?limit=1', {
            cache: 'no-store',
            signal: controller.signal,
        })
            .then(async (response) => {
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                return response.json() as Promise<{ messages?: ContactRequest[]; total?: number }>;
            })
            .then((data) => {
                setRequests(data.messages ?? []);
                setTotal(data.total ?? 0);
            })
            .catch((error: unknown) => {
                if (error instanceof DOMException && error.name === 'AbortError') return;
                setRequests([]);
                reportAdminPartial(
                    l(
                        'Не удалось загрузить обращения покупателей.',
                        'Could not load customer requests.',
                        'Neizdevās ielādēt klientu pieprasījumus.'
                    ),
                    'Dashboard'
                );
            });
        return () => controller.abort();
    }, [l]);

    const oldest = requests?.[0];
    const waitingDays = oldest
        ? Math.max(0, Math.floor((loadedAt - new Date(oldest.createdAt).getTime()) / 86_400_000))
        : 0;
    const subtitle =
        requests === null
            ? l('Загрузка…', 'Loading…', 'Ielāde…')
            : total === 0
            ? l('Все запросы обработаны', 'All requests answered', 'Visi pieprasījumi apstrādāti')
            : waitingDays > 0
            ? l(
                  `Самый старый: ${waitingDays} дн.`,
                  `Oldest: ${waitingDays}d`,
                  `Vecākais: ${waitingDays} d.`
              )
            : l('Самый старый: сегодня', 'Oldest: today', 'Vecākais: šodien');

    const content = (
        <>
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-600 dark:bg-rose-900/20 dark:text-rose-400">
                <MessageSquareText className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">
                    {l('Запросы без ответа', 'Unanswered requests', 'Neatbildēti pieprasījumi')}
                </p>
                <p className="mt-0.5 text-xl font-bold text-foreground">
                    {requests === null ? '…' : total}
                </p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">{subtitle}</p>
            </div>
            <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-gray-500" />
        </>
    );

    const className =
        'group flex items-center gap-4 rounded-2xl border border-border bg-card p-5 transition-all hover:border-gray-300 hover:shadow-sm dark:hover:border-gray-600';

    return (
        <Link href="/admin/contact-messages" className={className}>
            {content}
        </Link>
    );
}
