'use client';
import React, { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { IconGrid, IconList } from '@/components/ui/icon-view';
import AdminGate from '@/components/admin/AdminGate';
import { useAdminLocale } from '@/lib/use-admin-locale';
import { getKnowledgeArticles } from './knowledge-articles';

const STORAGE_KEY = 'admin-knowledge-view';

export default function AdminKnowledgePage(): React.ReactElement {
    const { language, l } = useAdminLocale();
    const localizedArticles = getKnowledgeArticles(language);
    const [view, setView] = useState<'grid' | 'list'>(() => {
        if (typeof window === 'undefined') return 'grid';
        return (localStorage.getItem(STORAGE_KEY) as 'grid' | 'list') ?? 'grid';
    });

    const switchView = (v: 'grid' | 'list') => {
        setView(v);
        try {
            localStorage.setItem(STORAGE_KEY, v);
        } catch {}
    };

    return (
        <AdminGate>
            <main className="w-full py-4 space-y-6">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-bold text-foreground">
                            {l('База знаний', 'Knowledge base', 'Zināšanu bāze')}
                        </h1>
                        <p className="mt-1 text-sm text-muted-foreground">
                            {l(
                                'Руководство по работе с административной панелью',
                                'Guide to using the administration panel',
                                'Administrēšanas paneļa lietošanas rokasgrāmata'
                            )}
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-sm text-foreground font-medium">
                            {l('Выбор вида:', 'View:', 'Skats:')}
                        </span>
                        <Button
                            size="sm"
                            variant={view === 'grid' ? 'default' : 'outline'}
                            onClick={() => switchView('grid')}
                        >
                            <IconGrid className="mr-2" />
                            {l('Карточки', 'Cards', 'Kartītes')}
                        </Button>
                        <Button
                            size="sm"
                            variant={view === 'list' ? 'default' : 'outline'}
                            onClick={() => switchView('list')}
                        >
                            <IconList className="mr-2" />
                            {l('Список', 'List', 'Saraksts')}
                        </Button>
                        <Link href="/admin">
                            <Button variant="outline">
                                {l('Назад в админку', 'Back to admin', 'Atpakaļ uz administrēšanu')}
                            </Button>
                        </Link>
                    </div>
                </div>

                {view === 'grid' ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {localizedArticles.map((article) => (
                            <div
                                key={article.href + article.title}
                                className="group flex flex-col bg-card rounded-xl border border-border p-5 shadow-sm hover:shadow-md hover:border-gray-300 dark:hover:border-gray-600 transition-all"
                            >
                                <div className="flex items-center gap-3 mb-3">
                                    <span className="text-2xl leading-none">{article.icon}</span>
                                    <h2 className="text-base font-semibold text-foreground">
                                        {article.title}
                                    </h2>
                                </div>
                                <p className="text-sm text-muted-foreground leading-relaxed mb-4 flex-1">
                                    {article.description}
                                </p>
                                <Link href={article.href} className="mt-auto">
                                    <span className="text-sm font-medium text-primary group-hover:underline">
                                        {article.linkLabel} →
                                    </span>
                                </Link>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="flex flex-col gap-2">
                        {localizedArticles.map((article) => (
                            <Link
                                key={article.href + article.title}
                                href={article.href}
                                className="group flex items-center gap-4 px-5 py-4 bg-muted rounded-xl border border-border shadow-sm hover:shadow-md hover:border-gray-300 dark:hover:border-gray-600 transition-all"
                            >
                                <span className="text-xl leading-none flex-shrink-0">
                                    {article.icon}
                                </span>
                                <div className="flex-1 min-w-0">
                                    <h2 className="text-sm font-semibold text-foreground mb-0.5 group-hover:text-primary dark:group-hover:text-primary/80 transition-colors">
                                        {article.title}
                                    </h2>
                                    <p className="text-sm text-muted-foreground leading-relaxed">
                                        {article.description}
                                    </p>
                                </div>
                                <svg
                                    className="flex-shrink-0 w-4 h-4 text-muted-foreground group-hover:text-primary/80 transition-colors"
                                    viewBox="0 0 16 16"
                                    fill="none"
                                >
                                    <path
                                        d="M6 3l5 5-5 5"
                                        stroke="currentColor"
                                        strokeWidth="1.5"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                    />
                                </svg>
                            </Link>
                        ))}
                    </div>
                )}
            </main>
        </AdminGate>
    );
}
