'use client';

import React from 'react';
import Link from 'next/link';
import AdminGate from '@/components/admin/AdminGate';
import { Button } from '@/components/ui/button';
import type { RowAction } from '@/app/api/admin/import/preview/route';
import { useAdminLocale } from '@/lib/use-admin-locale';

import { useAdminImportPage } from './useAdminImportPage';
import { type ImportMode } from './import-config';
import { ImportExportSection } from './ImportExportSection';
import { ImportWorkflowSection } from './ImportWorkflowSection';
import { ImportHints } from './ImportHints';

export default function AdminImportPage(): React.ReactElement {
    const { l } = useAdminLocale();
    const pageState = useAdminImportPage();
    const modeLabels: Record<ImportMode, string> = {
        create: l(
            'Только создание — новые товары, существующие пропускаются',
            'Create only — add new products and skip existing ones',
            'Tikai izveide — pievienot jaunus produktus un izlaist esošos'
        ),
        update: l(
            'Только обновление — существующие товары, новые пропускаются',
            'Update only — update existing products and skip new ones',
            'Tikai atjaunināšana — atjaunināt esošos produktus un izlaist jaunos'
        ),
        upsert: l(
            'Создание + обновление — новые создаются, существующие обновляются',
            'Create + update — add new products and update existing ones',
            'Izveide + atjaunināšana — pievienot jaunus un atjaunināt esošos produktus'
        ),
    };
    const actionLabels: Record<RowAction, string> = {
        create: l('Создать', 'Create', 'Izveidot'),
        update: l('Обновить', 'Update', 'Atjaunināt'),
        skip: l('Пропустить', 'Skip', 'Izlaist'),
        error: l('Ошибка', 'Error', 'Kļūda'),
    };
    return (
        <AdminGate>
            <main className="w-full py-4 space-y-6">
                {/* Header */}
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <h1 className="text-2xl md:text-3xl font-bold text-foreground">
                            {l(
                                'Импорт и обновление каталога',
                                'Catalog import and update',
                                'Kataloga imports un atjaunināšana'
                            )}
                        </h1>
                        <p className="text-sm text-muted-foreground mt-1">
                            {l(
                                'Загрузка товаров из CSV, массовое обновление цен и остатков, экспорт каталога.',
                                'Upload products from CSV, update prices and inventory in bulk, and export the catalog.',
                                'Augšupielādējiet produktus no CSV, masveidā atjauniniet cenas un krājumus un eksportējiet katalogu.'
                            )}
                        </p>
                    </div>
                    <Link href="/admin">
                        <Button variant="outline">
                            {l('Назад в админку', 'Back to admin', 'Atpakaļ uz administrēšanu')}
                        </Button>
                    </Link>
                </div>

                <ImportExportSection l={l} />
                <ImportWorkflowSection state={pageState} l={l} modeLabels={modeLabels} actionLabels={actionLabels} />
                <ImportHints l={l} />

            </main>
        </AdminGate>
    );
}

