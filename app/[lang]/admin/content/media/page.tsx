'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import AdminGate from '@/components/admin/AdminGate'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Download, Grid2X2, LayoutList } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

type MediaFile = {
  name: string
  path: string
  size: number
  isImage: boolean
  ext: string
  createdAt: string
  modifiedAt: string
}

type SortKey = 'date' | 'name' | 'size'
type ViewMode = 'grid' | 'list'
type FilterType = 'all' | 'image' | 'other'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

// ─── Component ────────────────────────────────────────────────────────────────

import { useAdminMediaPage } from './useAdminMediaPage'

export default function AdminMediaPage(): React.ReactElement {
  const pageState = useAdminMediaPage()
  const { files, setFiles, loading, setLoading, uploading, setUploading, replacing, setReplacing, bulkDeleting, setBulkDeleting, message, setMessage, search, setSearch, filter, setFilter, sort, setSort, view, setView, selected, setSelected, checkedNames, setCheckedNames, copied, setCopied, usageMap, setUsageMap, fileInputRef, replaceInputRef, showMsg, loadFiles, displayed, isAllChecked, isSomeChecked, toggleCheck, toggleAll, onUpload, onReplace, onDelete, onBulkDelete, totalSize, imgCount } = pageState
return (
    <AdminGate>
      <main className="w-full py-4 space-y-5">

        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">Медиа-библиотека</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Хранилище в базе данных
              {' '}· {files.length} файлов · {imgCount} изображений · {fmtBytes(totalSize)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/admin/content"><Button variant="outline">← Контент</Button></Link>
            <Button onClick={() => fileInputRef.current?.click()} disabled={uploading}>
              {uploading ? 'Загрузка...' : '+ Загрузить'}
            </Button>
            <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={onUpload} />
            <input ref={replaceInputRef} type="file" accept="image/*" className="hidden" onChange={onReplace} />
          </div>
        </div>

        {/* Toast */}
        {message && (
          <div className={`rounded-lg border px-4 py-2.5 text-sm ${
            message.error
              ? 'border-red-300 bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300'
              : 'border-green-300 bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300'
          }`}>
            {message.text}
          </div>
        )}

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по имени..."
            className="w-52 h-8 text-sm"
          />

          {/* Type filter */}
          <div className="flex rounded-lg border border-border overflow-hidden text-xs">
            {(['all', 'image', 'other'] as const).map((f) => (
              <button key={f} type="button" onClick={() => setFilter(f)}
                className={`px-3 py-1.5 font-medium transition-colors ${filter === f ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900' : 'text-muted-foreground hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
                {f === 'all' ? 'Все' : f === 'image' ? 'Изображения' : 'Прочие'}
              </button>
            ))}
          </div>

          {/* Sort */}
          <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
            <SelectTrigger className="h-8 rounded-lg border border-border bg-card px-2 text-xs text-gray-700 dark:text-gray-300">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="date">По дате</SelectItem>
              <SelectItem value="name">По имени</SelectItem>
              <SelectItem value="size">По размеру</SelectItem>
            </SelectContent>
          </Select>

          {/* View toggle */}
          <div className="flex rounded-lg border border-border overflow-hidden">
            <button type="button" onClick={() => setView('grid')}
              className={`p-1.5 ${view === 'grid' ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900' : 'text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
              <Grid2X2 className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => setView('list')}
              className={`p-1.5 ${view === 'list' ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900' : 'text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
              <LayoutList className="h-4 w-4" />
            </button>
          </div>

          <span className="text-xs text-gray-400 dark:text-gray-500 ml-1">{displayed.length} из {files.length}</span>
        </div>

        {/* Bulk action bar */}
        {checkedNames.size > 0 && (
          <div className="flex items-center gap-3 rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-4 py-2.5">
            <span className="text-sm font-medium text-red-800 dark:text-red-200">Выбрано: {checkedNames.size}</span>
            <Button size="sm" variant="destructive" disabled={bulkDeleting} onClick={() => void onBulkDelete()}>
              {bulkDeleting ? 'Удаление...' : `Удалить ${checkedNames.size}`}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setCheckedNames(new Set())} className="ml-auto text-red-700 dark:text-red-300">
              Снять выбор
            </Button>
          </div>
        )}

        {loading ? (
          <div className="py-16 text-center text-sm text-gray-400">Загрузка...</div>
        ) : files.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-12 text-center">
            <p className="text-sm text-muted-foreground mb-3">Нет загруженных файлов.</p>
            <Button onClick={() => fileInputRef.current?.click()}>Загрузить первый файл</Button>
          </div>
        ) : displayed.length === 0 ? (
          <div className="py-10 text-center text-sm text-gray-400">Ничего не найдено</div>
        ) : (
          <div className="flex gap-4 items-start">

            {/* Main area */}
            <div className="flex-1 min-w-0">

              {/* Select all row */}
              <div className="flex items-center gap-2 mb-2 px-1">
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
                  <Checkbox
                    checked={isAllChecked ? true : isSomeChecked ? 'indeterminate' : false}
                    onCheckedChange={toggleAll}
                  />
                  Выбрать все ({displayed.length})
                </label>
              </div>

              {view === 'grid' ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                  {displayed.map((file) => {
                    const isChecked = checkedNames.has(file.name)
                    const isSelected = selected?.name === file.name
                    const usedIn = usageMap.get(file.path)

                    return (
                      <div
                        key={file.name}
                        className={[
                          'group relative rounded-lg border bg-card overflow-hidden transition-all hover:shadow-md',
                          isSelected ? 'border-primary/70 ring-2 ring-primary/50 dark:ring-primary/50' : 'border-border',
                          isChecked ? 'ring-2 ring-red-300 dark:ring-red-700 border-red-300' : '',
                        ].join(' ')}
                      >
                        {/* Checkbox */}
                        <div
                          className="absolute top-1.5 left-1.5 z-10 cursor-pointer"
                        >
                          <Checkbox
                            aria-label={`Выбрать ${file.name}`}
                            checked={isChecked}
                            onCheckedChange={() => toggleCheck(file.name)}
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
                          onClick={() => setSelected(isSelected ? null : file)}
                          className="w-full"
                        >
                          <div className="aspect-square bg-muted flex items-center justify-center overflow-hidden">
                            {file.isImage ? (
                              <Image src={file.path} alt={file.name} width={300} height={300} unoptimized className="w-full h-full object-cover" />
                            ) : (
                              <span className="text-2xl font-bold text-gray-300 dark:text-gray-600 uppercase">{file.ext}</span>
                            )}
                          </div>
                          <div className="p-2 text-left">
                            <p className="text-xs text-gray-700 dark:text-gray-200 truncate leading-tight" title={file.name}>{file.name}</p>
                            <p className="text-xs text-gray-400 mt-0.5">{fmtBytes(file.size)}</p>
                          </div>
                        </button>
                      </div>
                    )
                  })}
                </div>
              ) : (
                /* List view */
                <div className="rounded-xl border border-border overflow-x-auto">
                  <table className="min-w-full text-sm bg-card">
                    <thead className="bg-muted">
                      <tr>
                        <th className="w-8 px-3 py-2.5"></th>
                        <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Файл</th>
                        <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Размер</th>
                        <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Дата</th>
                        <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Используется</th>
                        <th className="px-3 py-2.5"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                      {displayed.map((file) => {
                        const isChecked = checkedNames.has(file.name)
                        const isSelected = selected?.name === file.name
                        const usedIn = usageMap.get(file.path)
                        return (
                          <tr
                            key={file.name}
                            className={`hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer ${isSelected ? 'bg-primary/5 dark:bg-primary/20/10' : ''}`}
                            onClick={() => setSelected(isSelected ? null : file)}
                          >
                            <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                              <Checkbox checked={isChecked} onCheckedChange={() => toggleCheck(file.name)} />
                            </td>
                            <td className="px-3 py-2.5">
                              <div className="flex items-center gap-2">
                                {file.isImage
                                  ? <Image src={file.path} alt="" width={32} height={32} unoptimized className="h-8 w-8 rounded object-cover shrink-0" />
                                  : <div className="h-8 w-8 rounded bg-muted flex items-center justify-center text-xs font-bold text-gray-400 uppercase shrink-0">{file.ext}</div>
                                }
                                <span className="truncate text-gray-800 dark:text-gray-200 max-w-xs">{file.name}</span>
                              </div>
                            </td>
                            <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">{fmtBytes(file.size)}</td>
                            <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap text-xs">{fmtDate(file.modifiedAt)}</td>
                            <td className="px-3 py-2.5 text-xs text-muted-foreground">
                              {usedIn?.length ? (
                                <span className="text-primary">{usedIn.length} товаров</span>
                              ) : '—'}
                            </td>
                            <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                              <button
                                type="button"
                                onClick={() => void navigator.clipboard.writeText(file.path).then(() => { setCopied(file.path); setTimeout(() => setCopied(null), 1500) })}
                                className="text-xs text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                              >
                                {copied === file.path ? '✓' : 'Копировать'}
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Detail panel */}
            {selected && (
              <div className="w-72 flex-shrink-0 rounded-xl border border-border bg-card p-4 space-y-4 sticky top-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-foreground truncate">{selected.name}</p>
                  <button type="button" onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-xl leading-none ml-2 shrink-0">×</button>
                </div>

                {/* Preview */}
                <div className="aspect-square rounded-lg bg-muted border border-border flex items-center justify-center overflow-hidden">
                  {selected.isImage
                    ? <Image src={selected.path} alt={selected.name} width={288} height={288} unoptimized className="w-full h-full object-contain" />
                    : <span className="text-4xl font-bold text-gray-300 dark:text-gray-600 uppercase">{selected.ext}</span>
                  }
                </div>

                {/* Meta */}
                <div className="text-xs text-muted-foreground space-y-1">
                  <p>Размер: <strong>{fmtBytes(selected.size)}</strong></p>
                  <p>Тип: <strong>{selected.ext.toUpperCase()}</strong></p>
                  <p>Изменён: {fmtDate(selected.modifiedAt)}</p>
                </div>

                {/* Usage */}
                {(() => {
                  const usedIn = usageMap.get(selected.path)
                  if (!usedIn?.length) return (
                    <p className="text-xs text-gray-400 dark:text-gray-500">Не используется в товарах</p>
                  )
                  return (
                    <div className="text-xs">
                      <p className="font-medium text-primary dark:text-primary mb-1">
                        Используется в {usedIn.length} товарах:
                      </p>
                      <div className="space-y-0.5 max-h-24 overflow-y-auto">
                        {usedIn.map((t, i) => (
                          <p key={i} className="text-muted-foreground truncate">· {t}</p>
                        ))}
                      </div>
                    </div>
                  )
                })()}

                {/* Path copy */}
                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground">Путь:</p>
                  <code className="block text-xs bg-muted rounded px-2 py-1.5 break-all text-gray-800 dark:text-gray-200">
                    {selected.path}
                  </code>
                  <Button size="sm" variant={copied === selected.path ? 'default' : 'outline'} className="w-full text-xs"
                    onClick={() => void navigator.clipboard.writeText(selected.path).then(() => { setCopied(selected.path); setTimeout(() => setCopied(null), 1500) })}>
                    {copied === selected.path ? '✓ Скопировано!' : 'Копировать путь'}
                  </Button>
                </div>

                {/* Actions */}
                <div className="flex flex-col gap-2 pt-1 border-t border-gray-100 dark:border-gray-800">
                  <a href={selected.path} target="_blank" rel="noreferrer"
                    className="flex items-center justify-center gap-1.5 text-xs rounded-lg border border-border px-3 py-1.5 text-muted-foreground hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                    <Download className="h-3.5 w-3.5" /> Открыть ↗
                  </a>

                  {selected.isImage && (
                    <button type="button"
                      disabled={replacing}
                      onClick={() => replaceInputRef.current?.click()}
                      className="text-xs rounded-lg border border-primary/50 dark:border-primary/50 px-3 py-1.5 text-primary dark:text-primary hover:bg-primary/5 dark:hover:bg-primary/10 transition-colors disabled:opacity-50">
                      {replacing ? 'Замена...' : 'Заменить файл (путь не изменится)'}
                    </button>
                  )}

                  <Button size="sm" variant="destructive" className="w-full text-xs"
                    onClick={() => void onDelete(selected)}>
                    Удалить файл
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </AdminGate>
  )
}
