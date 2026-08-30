'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import AdminGate from '@/components/admin/AdminGate';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Grid2X2, LayoutList } from 'lucide-react';
import { useAdminLocale } from '@/lib/use-admin-locale';
import MediaFileDetails, { fmtBytes, fmtDate } from './MediaFileDetails';

// ─── Types ────────────────────────────────────────────────────────────────────

type SortKey = 'date' | 'name' | 'size';
// ─── Helpers ──────────────────────────────────────────────────────────────────

// ─── Component ────────────────────────────────────────────────────────────────

import { useAdminMediaPage } from './useAdminMediaPage';

export default function AdminMediaPage(): React.ReactElement {
    const { locale, l } = useAdminLocale();
    const pageState = useAdminMediaPage();
    const {
            files,
            loading,
            uploading,
            bulkDeleting,
            message,
            search,
            setSearch,
            filter,
            setFilter,
            sort,
            setSort,
            view,
            setView,
            selected,
            setSelected,
            checkedNames,
            setCheckedNames,
            copied,
            setCopied,
            usageMap,
            fileInputRef,
            replaceInputRef,
            displayed,
            isAllChecked,
            isSomeChecked,
            toggleCheck,
            toggleAll,
            onUpload,
            onReplace,
            onBulkDelete,
            totalSize,
            imgCount,
          } = pageState;
    return (
        <AdminGate>
            <main className="w-full py-4 space-y-5">
                {/* Header */}
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <h1 className="text-2xl md:text-3xl font-bold text-foreground">
                            {l('Медиа-библиотека', 'Media library', 'Mediju bibliotēka')}
                        </h1>
                        <p className="text-sm text-muted-foreground mt-1">
                            {l('Хранилище в базе данных', 'Database storage', 'Datu bāzes krātuve')} · {files.length} {l('файлов', 'files', 'faili')} · {imgCount} {l('изображений', 'images', 'attēli')} · {fmtBytes(totalSize)}
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <Link href="/admin/content">
                            <Button variant="outline">← {l('Контент', 'Content', 'Saturs')}</Button>
                        </Link>
                        <Button onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                            {uploading ? l('Загрузка...', 'Uploading...', 'Augšupielāde...') : `+ ${l('Загрузить', 'Upload', 'Augšupielādēt')}`}
                        </Button>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            multiple
                            className="hidden"
                            onChange={onUpload}
                        />
                        <input
                            ref={replaceInputRef}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={onReplace}
                        />
                    </div>
                </div>

                {/* Toast */}
                {message && (
                    <div
                        className={`rounded-lg border px-4 py-2.5 text-sm ${
                            message.error
                                ? 'border-red-300 bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300'
                                : 'border-green-300 bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300'
                        }`}
                    >
                        {message.text}
                    </div>
                )}

                {/* Toolbar */}
                <div className="flex flex-wrap items-center gap-2">
                    <Input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder={l('Поиск по имени...', 'Search by name...', 'Meklēt pēc nosaukuma...')}
                        className="w-52 h-8 text-sm"
                    />

                    {/* Type filter */}
                    <div className="flex rounded-lg border border-border overflow-hidden text-xs">
                        {(['all', 'image', 'other'] as const).map((f) => (
                            <button
                                key={f}
                                type="button"
                                onClick={() => setFilter(f)}
                                className={`px-3 py-1.5 font-medium transition-colors ${
                                    filter === f
                                        ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
                                        : 'text-muted-foreground hover:bg-gray-50 dark:hover:bg-gray-800'
                                }`}
                            >
                                {f === 'all' ? l('Все', 'All', 'Visi') : f === 'image' ? l('Изображения', 'Images', 'Attēli') : l('Прочие', 'Other', 'Citi')}
                            </button>
                        ))}
                    </div>

                    {/* Sort */}
                    <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
                        <SelectTrigger className="h-8 rounded-lg border border-border bg-card px-2 text-xs text-foreground">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="date">{l('По дате', 'By date', 'Pēc datuma')}</SelectItem>
                            <SelectItem value="name">{l('По имени', 'By name', 'Pēc nosaukuma')}</SelectItem>
                            <SelectItem value="size">{l('По размеру', 'By size', 'Pēc izmēra')}</SelectItem>
                        </SelectContent>
                    </Select>

                    {/* View toggle */}
                    <div className="flex rounded-lg border border-border overflow-hidden">
                        <button
                            type="button"
                            onClick={() => setView('grid')}
                            className={`p-1.5 ${
                                view === 'grid'
                                    ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
                                    : 'text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800'
                            }`}
                        >
                            <Grid2X2 className="h-4 w-4" />
                        </button>
                        <button
                            type="button"
                            onClick={() => setView('list')}
                            className={`p-1.5 ${
                                view === 'list'
                                    ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
                                    : 'text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800'
                            }`}
                        >
                            <LayoutList className="h-4 w-4" />
                        </button>
                    </div>

                    <span className="text-xs text-muted-foreground ml-1">
                        {displayed.length} {l('из', 'of', 'no')} {files.length}
                    </span>
                </div>

                {/* Bulk action bar */}
                {checkedNames.size > 0 && (
                    <div className="flex items-center gap-3 rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-4 py-2.5">
                        <span className="text-sm font-medium text-red-800 dark:text-red-200">
                            {l('Выбрано:', 'Selected:', 'Atlasīti:')} {checkedNames.size}
                        </span>
                        <Button
                            size="sm"
                            variant="destructive"
                            disabled={bulkDeleting}
                            onClick={() => void onBulkDelete()}
                        >
                            {bulkDeleting ? l('Удаление...', 'Deleting...', 'Dzēšana...') : `${l('Удалить', 'Delete', 'Dzēst')} ${checkedNames.size}`}
                        </Button>
                        <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setCheckedNames(new Set())}
                            className="ml-auto text-red-700 dark:text-red-300"
                        >
                            {l('Снять выбор', 'Clear selection', 'Noņemt atlasi')}
                        </Button>
                    </div>
                )}

                {loading ? (
                    <div className="py-16 text-center text-sm text-muted-foreground">{l('Загрузка...', 'Loading...', 'Ielāde...')}</div>
                ) : files.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-border p-12 text-center">
                        <p className="text-sm text-muted-foreground mb-3">
                            {l('Нет загруженных файлов.', 'No files uploaded.', 'Nav augšupielādētu failu.')}
                        </p>
                        <Button onClick={() => fileInputRef.current?.click()}>
                            {l('Загрузить первый файл', 'Upload first file', 'Augšupielādēt pirmo failu')}
                        </Button>
                    </div>
                ) : displayed.length === 0 ? (
                    <div className="py-10 text-center text-sm text-muted-foreground">{l('Ничего не найдено', 'Nothing found', 'Nekas nav atrasts')}</div>
                ) : (
                    <div className="flex gap-4 items-start">
                        {/* Main area */}
                        <div className="flex-1 min-w-0">
                            {/* Select all row */}
                            <div className="flex items-center gap-2 mb-2 px-1">
                                <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
                                    <Checkbox
                                        checked={
                                            isAllChecked
                                                ? true
                                                : isSomeChecked
                                                ? 'indeterminate'
                                                : false
                                        }
                                        onCheckedChange={toggleAll}
                                    />
                                    {l('Выбрать все', 'Select all', 'Atlasīt visu')} ({displayed.length})
                                </label>
                            </div>

                            {view === 'grid' ? (
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                                    {displayed.map((file) => {
                                        const isChecked = checkedNames.has(file.name);
                                        const isSelected = selected?.name === file.name;
                                        const usedIn = usageMap.get(file.path);

                                        return (
                                            <div
                                                key={file.name}
                                                className={[
                                                    'group relative rounded-lg border bg-card overflow-hidden transition-all hover:shadow-md',
                                                    isSelected
                                                        ? 'border-primary/70 ring-2 ring-primary/50 dark:ring-primary/50'
                                                        : 'border-border',
                                                    isChecked
                                                        ? 'ring-2 ring-red-300 dark:ring-red-700 border-red-300'
                                                        : '',
                                                ].join(' ')}
                                            >
                                                {/* Checkbox */}
                                                <div className="absolute top-1.5 left-1.5 z-10 cursor-pointer">
                                                    <Checkbox
                                                        aria-label={`${l('Выбрать', 'Select', 'Atlasīt')} ${file.name}`}
                                                        checked={isChecked}
                                                        onCheckedChange={() =>
                                                            toggleCheck(file.name)
                                                        }
                                                    />
                                                </div>

                                                {/* Usage badge */}
                                                {usedIn?.length && (
                                                    <div className="absolute top-1.5 right-1.5 z-10">
                                                        <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">
                                                            {usedIn.length}
                                                        </span>
                                                    </div>
                                                )}

                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        setSelected(isSelected ? null : file)
                                                    }
                                                    className="w-full"
                                                >
                                                    <div className="aspect-square bg-muted flex items-center justify-center overflow-hidden">
                                                        {file.isImage ? (
                                                            <Image
                                                                src={file.path}
                                                                alt={file.name}
                                                                width={300}
                                                                height={300}
                                                                unoptimized
                                                                className="w-full h-full object-cover"
                                                            />
                                                        ) : (
                                                            <span className="text-2xl font-bold text-muted-foreground uppercase">
                                                                {file.ext}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="p-2 text-left">
                                                        <p
                                                            className="text-xs text-foreground truncate leading-tight"
                                                            title={file.name}
                                                        >
                                                            {file.name}
                                                        </p>
                                                        <p className="text-xs text-muted-foreground mt-0.5">
                                                            {fmtBytes(file.size)}
                                                        </p>
                                                    </div>
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                /* List view */
                                <div className="rounded-xl border border-border overflow-x-auto">
                                    <table className="min-w-full text-sm bg-card">
                                        <thead className="bg-muted">
                                            <tr>
                                                <th className="w-8 px-3 py-2.5"></th>
                                                <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">
                                                    {l('Файл', 'File', 'Fails')}
                                                </th>
                                                <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">
                                                    {l('Размер', 'Size', 'Izmērs')}
                                                </th>
                                                <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">
                                                    {l('Дата', 'Date', 'Datums')}
                                                </th>
                                                <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">
                                                    {l('Используется', 'Used in', 'Izmantots')}
                                                </th>
                                                <th className="px-3 py-2.5"></th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border">
                                            {displayed.map((file) => {
                                                const isChecked = checkedNames.has(file.name);
                                                const isSelected = selected?.name === file.name;
                                                const usedIn = usageMap.get(file.path);
                                                return (
                                                    <tr
                                                        key={file.name}
                                                        className={`hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer ${
                                                            isSelected
                                                                ? 'bg-primary/5 dark:bg-primary/20/10'
                                                                : ''
                                                        }`}
                                                        onClick={() =>
                                                            setSelected(isSelected ? null : file)
                                                        }
                                                    >
                                                        <td
                                                            className="px-3 py-2.5"
                                                            onClick={(e) => e.stopPropagation()}
                                                        >
                                                            <Checkbox
                                                                checked={isChecked}
                                                                onCheckedChange={() =>
                                                                    toggleCheck(file.name)
                                                                }
                                                            />
                                                        </td>
                                                        <td className="px-3 py-2.5">
                                                            <div className="flex items-center gap-2">
                                                                {file.isImage ? (
                                                                    <Image
                                                                        src={file.path}
                                                                        alt=""
                                                                        width={32}
                                                                        height={32}
                                                                        unoptimized
                                                                        className="h-8 w-8 rounded object-cover shrink-0"
                                                                    />
                                                                ) : (
                                                                    <div className="h-8 w-8 rounded bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground uppercase shrink-0">
                                                                        {file.ext}
                                                                    </div>
                                                                )}
                                                                <span className="truncate text-foreground max-w-xs">
                                                                    {file.name}
                                                                </span>
                                                            </div>
                                                        </td>
                                                        <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">
                                                            {fmtBytes(file.size)}
                                                        </td>
                                                        <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap text-xs">
                                                            {fmtDate(file.modifiedAt, locale)}
                                                        </td>
                                                        <td className="px-3 py-2.5 text-xs text-muted-foreground">
                                                            {usedIn?.length ? (
                                                                <span className="text-primary">
                                                                    {usedIn.length} {l('товаров', 'products', 'produkti')}
                                                                </span>
                                                            ) : (
                                                                '—'
                                                            )}
                                                        </td>
                                                        <td
                                                            className="px-3 py-2.5"
                                                            onClick={(e) => e.stopPropagation()}
                                                        >
                                                            <button
                                                                type="button"
                                                                onClick={() =>
                                                                    void navigator.clipboard
                                                                        .writeText(file.path)
                                                                        .then(() => {
                                                                            setCopied(file.path);
                                                                            setTimeout(
                                                                                () =>
                                                                                    setCopied(null),
                                                                                1500
                                                                            );
                                                                        })
                                                                }
                                                                className="text-xs text-muted-foreground hover:text-gray-700 dark:hover:text-gray-200"
                                                            >
                                                                {copied === file.path
                                                                    ? '✓'
                                                                    : l('Копировать', 'Copy', 'Kopēt')}
                                                            </button>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>

                        <MediaFileDetails state={pageState} />
                    </div>
                )}
            </main>
        </AdminGate>
    );
}
