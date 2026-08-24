'use client';

import React from 'react';
import Link from 'next/link';
import AdminGate from '@/components/admin/AdminGate';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useBannerContentManager } from './useBannerContentManager';
import BannersTab from './BannersTab';
import { useAdminLocale } from '@/lib/use-admin-locale';

// ─── Component ────────────────────────────────────────────────────────────────

export default function AdminBannersPage(): React.ReactElement {
    const { l } = useAdminLocale();
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
                            {l('Баннеры', 'Banners', 'Baneri')}
                        </h1>
                        <p className="text-sm text-muted-foreground mt-1">
                            {l('Управление промо-баннерами главной страницы.', 'Manage homepage promotional banners.', 'Sākumlapas reklāmas baneru pārvaldība.')}
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <Link href="/admin/content">
                            <Button variant="outline">← {l('Контент', 'Content', 'Saturs')}</Button>
                        </Link>
                        <Link href="/admin">
                            <Button variant="outline">{l('Назад в админку', 'Back to admin', 'Atpakaļ uz administrāciju')}</Button>
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
                        {l('Загрузка...', 'Loading...', 'Ielāde...')}
                    </div>
                ) : (
                    <Tabs defaultValue="banners">
                        <TabsList>
                            <TabsTrigger value="banners">{l('Баннеры', 'Banners', 'Baneri')} ({banners.length})</TabsTrigger>
                        </TabsList>

                        {/* ══════════════════════ BANNERS TAB ══════════════════════ */}
                        <BannersTab state={state} />
                    </Tabs>
                )}
            </main>
        </AdminGate>
    );
}
