'use client';

import React from 'react';
import Link from 'next/link';
import AdminGate from '@/components/admin/AdminGate';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useBannerContentManager } from './useBannerContentManager';
import BannersTab from './BannersTab';

// ─── Component ────────────────────────────────────────────────────────────────

export default function AdminBannersPage(): React.ReactElement {
    const state = useBannerContentManager();
    const { banners, loading, message } = state;

    // ─── Render ──────────────────────────────────────────────────────────────────

    return (
        <AdminGate>
            <main className="w-full py-4 space-y-6">
                {/* Header */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h1 className="text-2xl md:text-3xl font-bold text-foreground">
                            Баннеры
                        </h1>
                        <p className="text-sm text-muted-foreground mt-1">
                            Управление промо-баннерами главной страницы.
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <Link href="/admin/content">
                            <Button variant="outline">← Контент</Button>
                        </Link>
                        <Link href="/admin">
                            <Button variant="outline">Назад в админку</Button>
                        </Link>
                    </div>
                </div>

                {/* Message */}
                {message && (
                    <div
                        className={`rounded-md border px-3 py-2 text-sm ${
                            message.error
                                ? 'border-red-300 bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300'
                                : 'border-green-300 bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300'
                        }`}
                    >
                        {message.text}
                    </div>
                )}

                {loading ? (
                    <div className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">
                        Загрузка...
                    </div>
                ) : (
                    <Tabs defaultValue="banners">
                        <TabsList>
                            <TabsTrigger value="banners">Баннеры ({banners.length})</TabsTrigger>
                        </TabsList>

                        {/* ══════════════════════ BANNERS TAB ══════════════════════ */}
                        <BannersTab state={state} />
                    </Tabs>
                )}
            </main>
        </AdminGate>
    );
}
