'use client';

import AbcSection from './AbcSection';
import CohortSection from './CohortSection';
import SeoSection from './SeoSection';

import { useState } from 'react';
import Link from 'next/link';
import AdminGate from '@/components/admin/AdminGate';
import { useAdminLocale } from '@/lib/use-admin-locale';

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = 'abc' | 'cohort' | 'seo';

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminAnalyticsPage(): React.ReactElement {
    const { l } = useAdminLocale();
    const tabs: { value: Tab; label: string; desc: string }[] = [
        { value: 'abc', label: l('ABC-анализ', 'ABC analysis', 'ABC analīze'), desc: l('Топ товаров по доле в выручке', 'Top products by share of revenue', 'Populārākie produkti pēc ieņēmumu daļas') },
        { value: 'cohort', label: l('Когортный анализ', 'Cohort analysis', 'Kohortu analīze'), desc: l('Удержание клиентов по месяцам', 'Monthly customer retention', 'Klientu noturēšana pa mēnešiem') },
        { value: 'seo', label: l('SEO-отчёт', 'SEO report', 'SEO pārskats'), desc: l('Товары с пробелами в метаданных', 'Products with missing metadata', 'Produkti ar trūkstošiem metadatiem') },
    ];
    const [tab, setTab] = useState<Tab>('abc');
    const active = tabs.find((item) => item.value === tab)!;

    return (
        <AdminGate access="full">
            <div className="space-y-6">
                {/* Header */}
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-foreground">{l('Аналитика каталога', 'Catalog analytics', 'Kataloga analītika')}</h1>
                        <p className="mt-1 text-sm text-muted-foreground">{active.desc}</p>
                    </div>
                    <Link
                        href="/admin"
                        className="text-sm text-primary hover:underline dark:text-primary"
                    >
                        ← {l('Назад в админку', 'Back to admin', 'Atpakaļ uz administrāciju')}
                    </Link>
                </div>

                {/* Tabs */}
                <div className="flex flex-wrap gap-2 border-b border-border pb-0">
                    {tabs.map((t) => (
                        <button
                            key={t.value}
                            type="button"
                            onClick={() => setTab(t.value)}
                            className={[
                                'px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
                                tab === t.value
                                    ? 'border-primary text-primary dark:border-primary/70'
                                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200',
                            ].join(' ')}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>

                {/* Content */}
                {tab === 'abc' && <AbcSection />}
                {tab === 'cohort' && <CohortSection />}
                {tab === 'seo' && <SeoSection />}
            </div>
        </AdminGate>
    );
}
