'use client';

import React from 'react';
import Link from 'next/link';
import AdminGate from '@/components/admin/AdminGate';
import { Button } from '@/components/ui/button';
import type { RowAction } from '@/app/api/admin/import/preview/route';
import { useAdminLocale } from '@/lib/use-admin-locale';

// ─── CSV parser (no external deps) ───────────────────────────────────────────

// ─── Types ────────────────────────────────────────────────────────────────────

type ImportMode = 'create' | 'update' | 'upsert';

// ─── Constants ────────────────────────────────────────────────────────────────

const REQUIRED_COLS = ['id', 'title', 'brand', 'price', 'stock', 'category'];
const ALL_COLS = [
    ...REQUIRED_COLS,
    'titleEn',
    'titleLv',
    'sku',
    'oldPrice',
    'rating',
    'ratingCount',
    'image',
    'badges',
    'description',
    'specVolume',
    'specType',
    'specCountry',
    'feature1',
    'feature1En',
    'feature1Lv',
    'feature2',
    'feature2En',
    'feature2Lv',
    'feature3',
    'feature3En',
    'feature3Lv',
    'feature4',
    'feature4En',
    'feature4Lv',
    'unitOfMeasure',
    'packagingSize',
    'bonusRate',
    'manufacturerName',
    'manufacturerAddress',
    'manufacturerEmail',
    'metaTitle',
    'metaDescription',
];

const ACTION_CHIPS: Record<RowAction, string> = {
    create: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
    update: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
    skip: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
    error: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
};

// ─── Component ────────────────────────────────────────────────────────────────

import { useAdminImportPage } from './useAdminImportPage';

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
    const {
        rows,
        fileName,
        mode,
        importing,
        previewing,
        result,
        previewResult,
        parseError,
        missingCols,
        fileRef,
        onFileChange,
        onReset,
        onModeChange,
        onPreview,
        onImport,
        detectedCols,
        canImport,
    } = pageState;
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

                {/* ══ EXPORT ══════════════════════════════════════════════════════════ */}
                <section className="rounded-lg border border-border bg-card p-5 space-y-4">
                    <h2 className="text-base font-semibold text-foreground">
                        {l('Экспорт каталога', 'Catalog export', 'Kataloga eksports')}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                        {l(
                            'Скачайте все товары в формате CSV — включая базовые и добавленные через админку. Используйте этот файл как основу для редактирования и последующего импорта.',
                            'Download all products as CSV, including built-in products and those added in admin. Use this file as a basis for editing and reimporting.',
                            'Lejupielādējiet visus produktus CSV formātā, tostarp pamata un administrēšanā pievienotos. Izmantojiet šo failu rediģēšanai un atkārtotam importam.'
                        )}
                    </p>
                    <div className="flex flex-wrap gap-3">
                        <a href="/api/admin/export" download>
                            <Button>
                                {l(
                                    'Скачать каталог (CSV)',
                                    'Download catalog (CSV)',
                                    'Lejupielādēt katalogu (CSV)'
                                )}
                            </Button>
                        </a>
                        <a href="/api/admin/export?template=1" download>
                            <Button variant="outline">
                                {l(
                                    'Скачать шаблон (1 пример)',
                                    'Download template (1 example)',
                                    'Lejupielādēt veidni (1 piemērs)'
                                )}
                            </Button>
                        </a>
                    </div>
                    <div className="rounded-md bg-muted border border-border p-3">
                        <p className="text-xs font-medium text-foreground mb-1">
                            {l('Колонки в CSV:', 'CSV columns:', 'CSV kolonnas:')}
                        </p>
                        <p className="text-xs text-muted-foreground leading-relaxed font-mono">
                            <span className="text-red-600 dark:text-red-400">
                                {REQUIRED_COLS.join(', ')}
                            </span>
                            {', '}
                            {ALL_COLS.slice(REQUIRED_COLS.length).join(', ')}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                            {l(
                                'Красным — обязательные. Остальные — необязательные, их можно не включать в файл.',
                                'Required columns are red. The rest are optional and may be omitted.',
                                'Obligātās kolonnas ir sarkanas. Pārējās nav obligātas un tās var neiekļaut failā.'
                            )}{' '}
                            {l('Для', 'For', 'Laukam')} <code>badges</code>{' '}
                            {l(
                                'используйте разделитель',
                                'use the separator',
                                'izmantojiet atdalītāju'
                            )}{' '}
                            <code>;</code> ({l('например', 'for example', 'piemēram')}:{' '}
                            <code>sale;new</code>). {l('Категории:', 'Categories:', 'Kategorijas:')}{' '}
                            <code>hair, face, body, nails, equipment, new</code>.
                        </p>
                    </div>
                </section>

                {/* ══ IMPORT ══════════════════════════════════════════════════════════ */}
                <section className="rounded-lg border border-border bg-card p-5 space-y-5">
                    <h2 className="text-base font-semibold text-foreground">
                        {l('Импорт из CSV', 'Import from CSV', 'Imports no CSV')}
                    </h2>

                    {/* Step 1: Upload */}
                    <div className="space-y-2">
                        <p className="text-sm font-medium text-foreground">
                            {l('1. Выберите файл', '1. Choose a file', '1. Izvēlieties failu')}
                        </p>
                        <div className="flex items-center gap-3 flex-wrap">
                            <Button variant="outline" onClick={() => fileRef.current?.click()}>
                                {fileName
                                    ? l('Заменить файл', 'Replace file', 'Aizstāt failu')
                                    : l(
                                          'Выбрать CSV-файл',
                                          'Choose CSV file',
                                          'Izvēlēties CSV failu'
                                      )}
                            </Button>
                            {fileName && (
                                <>
                                    <span className="text-sm text-foreground font-medium">
                                        {fileName}
                                    </span>
                                    <span className="text-sm text-muted-foreground">
                                        — {rows.length} {l('строк', 'rows', 'rindas')}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={onReset}
                                        className="text-xs text-red-500 hover:underline"
                                    >
                                        {l('Очистить', 'Clear', 'Notīrīt')}
                                    </button>
                                </>
                            )}
                        </div>
                        <input
                            ref={fileRef}
                            type="file"
                            accept=".csv,text/csv"
                            className="hidden"
                            onChange={onFileChange}
                        />
                    </div>

                    {/* Parse error */}
                    {parseError && (
                        <div className="rounded-md border border-red-300 bg-red-50 dark:bg-red-900/20 px-3 py-2 text-sm text-red-700 dark:text-red-300">
                            {parseError}
                        </div>
                    )}

                    {/* Column check */}
                    {rows.length > 0 && (
                        <div className="space-y-2">
                            <p className="text-sm font-medium text-foreground">
                                {l(
                                    'Обнаруженные колонки:',
                                    'Detected columns:',
                                    'Atrastas kolonnas:'
                                )}
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                                {detectedCols.map((col) => (
                                    <span
                                        key={col}
                                        className={`text-xs rounded px-2 py-0.5 font-mono ${
                                            REQUIRED_COLS.includes(col)
                                                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                                                : 'bg-muted text-muted-foreground'
                                        }`}
                                    >
                                        {col}
                                    </span>
                                ))}
                            </div>
                            {missingCols.length > 0 && (
                                <div className="rounded-md border border-red-300 bg-red-50 dark:bg-red-900/20 px-3 py-2 text-sm text-red-700 dark:text-red-300">
                                    {l(
                                        'Отсутствуют обязательные колонки:',
                                        'Required columns are missing:',
                                        'Trūkst obligāto kolonnu:'
                                    )}{' '}
                                    <strong>{missingCols.join(', ')}</strong>
                                </div>
                            )}
                            {missingCols.length === 0 && (
                                <p className="text-xs text-green-600 dark:text-green-400">
                                    {l(
                                        'Все обязательные колонки присутствуют.',
                                        'All required columns are present.',
                                        'Ir visas obligātās kolonnas.'
                                    )}
                                </p>
                            )}
                        </div>
                    )}

                    {/* Step 2: Mode */}
                    {canImport && (
                        <div className="space-y-2">
                            <p className="text-sm font-medium text-foreground">
                                {l('2. Режим импорта', '2. Import mode', '2. Importa režīms')}
                            </p>
                            <div className="space-y-2">
                                {(Object.keys(modeLabels) as ImportMode[]).map((m) => (
                                    <label
                                        key={m}
                                        className="flex items-start gap-2 cursor-pointer"
                                    >
                                        <input
                                            type="radio"
                                            name="mode"
                                            value={m}
                                            checked={mode === m}
                                            onChange={() => onModeChange(m)}
                                            className="mt-0.5"
                                        />
                                        <span className="text-sm text-foreground">
                                            <strong className="capitalize">{m}</strong> —{' '}
                                            {modeLabels[m]}
                                        </span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Step 3: Preview */}
                    {canImport && !result && (
                        <div className="space-y-4">
                            <div className="flex items-center gap-3 flex-wrap">
                                <p className="text-sm font-medium text-foreground">
                                    {l('3. Предпросмотр', '3. Preview', '3. Priekšskatījums')}
                                </p>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={onPreview}
                                    disabled={previewing}
                                >
                                    {previewing
                                        ? l('Анализируется...', 'Analyzing...', 'Notiek analīze...')
                                        : previewResult
                                        ? l(
                                              'Обновить предпросмотр',
                                              'Refresh preview',
                                              'Atjaunināt priekšskatījumu'
                                          )
                                        : l('Проверить файл', 'Check file', 'Pārbaudīt failu')}
                                </Button>
                            </div>

                            {!previewResult && !previewing && (
                                <p className="text-xs text-muted-foreground">
                                    {l(
                                        'Нажмите «Проверить файл» — мы сравним CSV с каталогом и покажем, что будет создано, обновлено или пропущено.',
                                        'Select “Check file” to compare the CSV with the catalog and see what will be created, updated, or skipped.',
                                        'Nospiediet “Pārbaudīt failu”, lai salīdzinātu CSV ar katalogu un redzētu, kas tiks izveidots, atjaunināts vai izlaists.'
                                    )}
                                </p>
                            )}

                            {previewResult && (
                                <div className="space-y-3">
                                    {/* Summary chips */}
                                    <div className="flex flex-wrap gap-2 text-sm">
                                        {previewResult.summary.create > 0 && (
                                            <span className="inline-flex items-center gap-1 rounded-full px-3 py-1 bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300 font-medium">
                                                {l('Создать', 'Create', 'Izveidot')}:{' '}
                                                {previewResult.summary.create}
                                            </span>
                                        )}
                                        {previewResult.summary.update > 0 && (
                                            <span className="inline-flex items-center gap-1 rounded-full px-3 py-1 bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 font-medium">
                                                {l('Обновить', 'Update', 'Atjaunināt')}:{' '}
                                                {previewResult.summary.update}
                                            </span>
                                        )}
                                        {previewResult.summary.skip > 0 && (
                                            <span className="inline-flex items-center gap-1 rounded-full px-3 py-1 bg-muted text-muted-foreground font-medium">
                                                {l('Пропустить', 'Skip', 'Izlaist')}:{' '}
                                                {previewResult.summary.skip}
                                            </span>
                                        )}
                                        {previewResult.summary.error > 0 && (
                                            <span className="inline-flex items-center gap-1 rounded-full px-3 py-1 bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 font-medium">
                                                {l('Ошибок', 'Errors', 'Kļūdas')}:{' '}
                                                {previewResult.summary.error}
                                            </span>
                                        )}
                                    </div>

                                    {/* Enriched table */}
                                    <div className="overflow-auto max-h-[480px] rounded-md border border-border">
                                        <table className="min-w-full text-xs">
                                            <thead className="bg-muted sticky top-0 z-10">
                                                <tr>
                                                    <th className="px-3 py-2 text-left text-muted-foreground font-medium whitespace-nowrap">
                                                        #
                                                    </th>
                                                    <th className="px-3 py-2 text-left text-muted-foreground font-medium whitespace-nowrap">
                                                        {l('Действие', 'Action', 'Darbība')}
                                                    </th>
                                                    <th className="px-3 py-2 text-left text-muted-foreground font-medium whitespace-nowrap">
                                                        ID
                                                    </th>
                                                    <th className="px-3 py-2 text-left text-muted-foreground font-medium whitespace-nowrap">
                                                        {l('Название', 'Title', 'Nosaukums')}
                                                    </th>
                                                    <th className="px-3 py-2 text-left text-muted-foreground font-medium whitespace-nowrap">
                                                        {l('Бренд', 'Brand', 'Zīmols')}
                                                    </th>
                                                    <th className="px-3 py-2 text-left text-muted-foreground font-medium whitespace-nowrap">
                                                        {l('Цена', 'Price', 'Cena')}
                                                    </th>
                                                    <th className="px-3 py-2 text-left text-muted-foreground font-medium whitespace-nowrap">
                                                        {l('Остаток', 'Inventory', 'Krājumi')}
                                                    </th>
                                                    <th className="px-3 py-2 text-left text-muted-foreground font-medium whitespace-nowrap">
                                                        SKU
                                                    </th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-border">
                                                {previewResult.rows.map((row) => {
                                                    const chip = ACTION_CHIPS[row.action];
                                                    return (
                                                        <tr
                                                            key={row.rowNum}
                                                            className={[
                                                                'transition-colors',
                                                                row.action === 'error'
                                                                    ? 'bg-red-50/60 dark:bg-red-900/10'
                                                                    : row.action === 'skip'
                                                                    ? 'opacity-50'
                                                                    : 'hover:bg-gray-50 dark:hover:bg-gray-800/50',
                                                            ].join(' ')}
                                                        >
                                                            <td className="px-3 py-2 text-muted-foreground tabular-nums">
                                                                {row.rowNum}
                                                            </td>
                                                            <td className="px-3 py-2 whitespace-nowrap">
                                                                <span
                                                                    className={`rounded-full px-2 py-0.5 font-medium text-[11px] ${chip}`}
                                                                >
                                                                    {actionLabels[row.action]}
                                                                </span>
                                                            </td>
                                                            <td className="px-3 py-2 font-mono text-muted-foreground max-w-[120px] truncate">
                                                                {row.id || (
                                                                    <span className="text-red-400">
                                                                        —
                                                                    </span>
                                                                )}
                                                            </td>
                                                            <td className="px-3 py-2 text-foreground max-w-[200px]">
                                                                {row.action === 'error' ? (
                                                                    <span className="text-red-600 dark:text-red-400">
                                                                        {row.error}
                                                                    </span>
                                                                ) : (
                                                                    <span className="truncate block">
                                                                        {row.title || '—'}
                                                                    </span>
                                                                )}
                                                            </td>
                                                            <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                                                                {row.brand || '—'}
                                                            </td>
                                                            <td className="px-3 py-2 text-muted-foreground whitespace-nowrap tabular-nums">
                                                                {row.price ? `€${row.price}` : '—'}
                                                            </td>
                                                            <td className="px-3 py-2 text-muted-foreground whitespace-nowrap tabular-nums">
                                                                {row.stock || '—'}
                                                            </td>
                                                            <td className="px-3 py-2 text-muted-foreground font-mono whitespace-nowrap">
                                                                {row.sku || '—'}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Step 4: Run — only after preview */}
                    {canImport && previewResult && !result && (
                        <div className="pt-3 border-t border-border flex items-center gap-3 flex-wrap">
                            <p className="text-sm font-medium text-foreground w-full">
                                {l('4. Запустить импорт', '4. Run import', '4. Sākt importu')}
                            </p>
                            <Button
                                onClick={onImport}
                                disabled={
                                    importing ||
                                    previewResult.summary.error === previewResult.rows.length
                                }
                            >
                                {importing
                                    ? l('Импортируется...', 'Importing...', 'Notiek importēšana...')
                                    : `${l('Запустить', 'Run', 'Sākt')} (${
                                          previewResult.summary.create +
                                          previewResult.summary.update
                                      } ${l('из', 'of', 'no')} ${rows.length} ${l(
                                          'строк',
                                          'rows',
                                          'rindām'
                                      )})`}
                            </Button>
                            {previewResult.summary.error > 0 && (
                                <p className="text-xs text-amber-600 dark:text-amber-400">
                                    {previewResult.summary.error}{' '}
                                    {l(
                                        'строк содержат ошибки и будут пропущены.',
                                        'rows contain errors and will be skipped.',
                                        'rindās ir kļūdas, un tās tiks izlaistas.'
                                    )}
                                </p>
                            )}
                        </div>
                    )}

                    {/* Result */}
                    {result && (
                        <div className="space-y-3">
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                <div className="rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 p-3 text-center">
                                    <p className="text-2xl font-bold text-green-700 dark:text-green-300">
                                        {result.created}
                                    </p>
                                    <p className="text-xs text-green-600 dark:text-green-400 mt-0.5">
                                        {l('Создано', 'Created', 'Izveidoti')}
                                    </p>
                                </div>
                                <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 p-3 text-center">
                                    <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">
                                        {result.updated}
                                    </p>
                                    <p className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">
                                        {l('Обновлено', 'Updated', 'Atjaunināti')}
                                    </p>
                                </div>
                                <div className="rounded-lg border border-border bg-muted p-3 text-center">
                                    <p className="text-2xl font-bold text-muted-foreground">
                                        {result.skipped}
                                    </p>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                        {l('Пропущено', 'Skipped', 'Izlaisti')}
                                    </p>
                                </div>
                                <div
                                    className={`rounded-lg border p-3 text-center ${
                                        result.errors.length > 0
                                            ? 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20'
                                            : 'border-border bg-muted'
                                    }`}
                                >
                                    <p
                                        className={`text-2xl font-bold ${
                                            result.errors.length > 0
                                                ? 'text-red-700 dark:text-red-300'
                                                : 'text-muted-foreground'
                                        }`}
                                    >
                                        {result.errors.length}
                                    </p>
                                    <p
                                        className={`text-xs mt-0.5 ${
                                            result.errors.length > 0
                                                ? 'text-red-600 dark:text-red-400'
                                                : 'text-muted-foreground'
                                        }`}
                                    >
                                        {l('Ошибок', 'Errors', 'Kļūdas')}
                                    </p>
                                </div>
                            </div>

                            {result.errors.length > 0 && (
                                <div className="rounded-md border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/10 p-3 space-y-1 max-h-48 overflow-y-auto">
                                    <p className="text-xs font-medium text-red-700 dark:text-red-300 mb-2">
                                        {l('Ошибки импорта:', 'Import errors:', 'Importa kļūdas:')}
                                    </p>
                                    {result.errors.map((e, i) => (
                                        <p
                                            key={i}
                                            className="text-xs text-red-600 dark:text-red-400 font-mono"
                                        >
                                            {l('Строка', 'Row', 'Rinda')} {e.row}
                                            {e.id ? ` (${e.id})` : ''}: {e.message}
                                        </p>
                                    ))}
                                </div>
                            )}

                            <div className="flex items-center gap-3">
                                {result.created + result.updated > 0 && (
                                    <Link href="/admin/products">
                                        <Button size="sm">
                                            {l(
                                                'Открыть каталог →',
                                                'Open catalog →',
                                                'Atvērt katalogu →'
                                            )}
                                        </Button>
                                    </Link>
                                )}
                                <Button size="sm" variant="outline" onClick={onReset}>
                                    {l('Новый импорт', 'New import', 'Jauns imports')}
                                </Button>
                            </div>
                        </div>
                    )}
                </section>

                {/* ══ HINTS ═══════════════════════════════════════════════════════════ */}
                <section className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground space-y-1">
                    <p className="font-medium text-foreground">
                        {l('Сценарии использования', 'Use cases', 'Lietošanas scenāriji')}
                    </p>
                    <ul className="list-disc list-inside space-y-1 text-sm">
                        <li>
                            {l(
                                'Первичная загрузка каталога: режим',
                                'Initial catalog upload: use',
                                'Sākotnējā kataloga augšupielāde: izmantojiet'
                            )}{' '}
                            <strong>create</strong>
                        </li>
                        <li>
                            {l(
                                'Массовое обновление цен/остатков: скачайте экспорт, отредактируйте нужные колонки, загрузите в режиме',
                                'Bulk price/inventory update: download the export, edit the required columns, and upload using',
                                'Cenu/krājumu masveida atjaunināšana: lejupielādējiet eksportu, rediģējiet vajadzīgās kolonnas un augšupielādējiet ar'
                            )}{' '}
                            <strong>update</strong>
                        </li>
                        <li>
                            {l(
                                'Синхронизация с прайс-листом поставщика: режим',
                                'Supplier price list synchronization: use',
                                'Sinhronizācija ar piegādātāja cenrādi: izmantojiet'
                            )}{' '}
                            <strong>upsert</strong>
                        </li>
                    </ul>
                </section>
            </main>
        </AdminGate>
    );
}
