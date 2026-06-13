'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import AdminGate from '@/components/admin/AdminGate'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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

export default function AdminMediaPage() {
  const [files, setFiles] = useState<MediaFile[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [replacing, setReplacing] = useState(false)
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null)

  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<FilterType>('all')
  const [sort, setSort] = useState<SortKey>('date')
  const [view, setView] = useState<ViewMode>('grid')

  const [selected, setSelected] = useState<MediaFile | null>(null)
  const [checkedNames, setCheckedNames] = useState<Set<string>>(new Set())
  const [copied, setCopied] = useState<string | null>(null)

  // Usage: filePath → list of product titles that use it
  const [usageMap, setUsageMap] = useState<Map<string, string[]>>(new Map())

  const fileInputRef = useRef<HTMLInputElement>(null)
  const replaceInputRef = useRef<HTMLInputElement>(null)

  const showMsg = (text: string, error = false) => {
    setMessage({ text, error })
    setTimeout(() => setMessage(null), 4000)
  }

  // ── Load media files ────────────────────────────────────────────────────────

  const loadFiles = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/media', { cache: 'no-store' })
      if (!res.ok) throw new Error()
      const data = (await res.json()) as { files: MediaFile[] }
      setFiles(data.files)
    } catch {
      showMsg('Не удалось загрузить файлы.', true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void loadFiles() }, [loadFiles])

  // ── Load product usage ──────────────────────────────────────────────────────

  useEffect(() => {
    fetch('/api/admin/products')
      .then((r) => r.json())
      .then((data: { data?: { products?: Record<string, unknown>[] } }) => {
        const products = data.data?.products ?? []
        const map = new Map<string, string[]>()
        products.forEach((p) => {
          const title = String(p.title ?? p.id ?? '')
          const paths: string[] = []
          if (p.image) paths.push(String(p.image))
          if (Array.isArray(p.images)) p.images.forEach((img) => paths.push(String(img)))
          paths.forEach((imgPath) => {
            if (!map.has(imgPath)) map.set(imgPath, [])
            map.get(imgPath)!.push(title)
          })
        })
        setUsageMap(map)
      })
      .catch(() => {})
  }, [])

  // ── Derived: filtered + sorted ──────────────────────────────────────────────

  const displayed = useMemo(() => {
    const q = search.toLowerCase()
    return files
      .filter((f) => {
        if (q && !f.name.toLowerCase().includes(q)) return false
        if (filter === 'image' && !f.isImage) return false
        if (filter === 'other' && f.isImage) return false
        return true
      })
      .sort((a, b) => {
        if (sort === 'name') return a.name.localeCompare(b.name)
        if (sort === 'size') return b.size - a.size
        return new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime()
      })
  }, [files, search, filter, sort])

  const isAllChecked = displayed.length > 0 && displayed.every((f) => checkedNames.has(f.name))
  const isSomeChecked = displayed.some((f) => checkedNames.has(f.name))

  const toggleCheck = (name: string) => {
    setCheckedNames((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const toggleAll = () => {
    if (isAllChecked) {
      setCheckedNames(new Set())
    } else {
      setCheckedNames(new Set(displayed.map((f) => f.name)))
    }
  }

  // ── Upload ──────────────────────────────────────────────────────────────────

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? [])
    if (!picked.length) return
    setUploading(true)
    let ok = 0, fail = 0
    for (const file of picked) {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/admin/content/upload', { method: 'POST', body: fd })
      if (res.ok) { ok++ } else { fail++ }
    }
    e.target.value = ''
    setUploading(false)
    showMsg(fail === 0 ? `Загружено: ${ok}` : `Загружено: ${ok}, ошибок: ${fail}`, fail > 0 && ok === 0)
    await loadFiles()
  }

  // ── Replace ─────────────────────────────────────────────────────────────────

  const onReplace = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!selected) return
    const file = e.target.files?.[0]
    if (!file) return
    setReplacing(true)
    try {
      const fd = new FormData()
      fd.append('name', selected.name)
      fd.append('file', file)
      const res = await fetch('/api/admin/media/replace', { method: 'POST', body: fd })
      if (!res.ok) throw new Error()
      showMsg(`Файл «${selected.name}» заменён. Все ссылки на него обновлены автоматически.`)
      await loadFiles()
    } catch {
      showMsg('Не удалось заменить файл.', true)
    } finally {
      setReplacing(false)
      e.target.value = ''
    }
  }

  // ── Delete single ───────────────────────────────────────────────────────────

  const onDelete = async (file: MediaFile) => {
    if (!confirm(`Удалить «${file.name}»?\n\nЕсли файл используется в товарах — ссылки сломаются.`)) return
    const res = await fetch('/api/admin/media', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ names: [file.name] }),
    })
    if (res.ok) {
      if (selected?.name === file.name) setSelected(null)
      showMsg(`Файл «${file.name}» удалён.`)
      await loadFiles()
    } else {
      showMsg('Не удалось удалить файл.', true)
    }
  }

  // ── Bulk delete ─────────────────────────────────────────────────────────────

  const onBulkDelete = async () => {
    const names = Array.from(checkedNames)
    if (!names.length) return
    if (!confirm(`Удалить ${names.length} файлов?\n\nЕсли они используются в товарах — ссылки сломаются.`)) return
    setBulkDeleting(true)
    try {
      const res = await fetch('/api/admin/media', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ names }),
      })
      const data = (await res.json()) as { deleted: number; errors: string[] }
      setCheckedNames(new Set())
      if (selected && names.includes(selected.name)) setSelected(null)
      showMsg(`Удалено: ${data.deleted}${data.errors.length ? `, ошибок: ${data.errors.length}` : ''}`)
      await loadFiles()
    } catch {
      showMsg('Ошибка при удалении.', true)
    } finally {
      setBulkDeleting(false)
    }
  }

  // ── Stats ───────────────────────────────────────────────────────────────────

  const totalSize = files.reduce((s, f) => s + f.size, 0)
  const imgCount = files.filter((f) => f.isImage).length

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <AdminGate>
      <main className="w-full py-4 space-y-5">

        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">Медиа-библиотека</h1>
            <p className="text-sm text-muted-foreground mt-1">
              <code className="text-xs bg-muted px-1 py-0.5 rounded">public/uploads/</code>
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
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="h-8 rounded-lg border border-border bg-card px-2 text-xs text-gray-700 dark:text-gray-300"
          >
            <option value="date">По дате</option>
            <option value="name">По имени</option>
            <option value="size">По размеру</option>
          </select>

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
                  <input
                    type="checkbox"
                    checked={isAllChecked}
                    ref={(el) => { if (el) el.indeterminate = isSomeChecked && !isAllChecked }}
                    onChange={toggleAll}
                    className="h-3.5 w-3.5 accent-indigo-600"
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
                          isSelected ? 'border-indigo-400 ring-2 ring-indigo-300 dark:ring-indigo-700' : 'border-border',
                          isChecked ? 'ring-2 ring-red-300 dark:ring-red-700 border-red-300' : '',
                        ].join(' ')}
                      >
                        {/* Checkbox */}
                        <label
                          className="absolute top-1.5 left-1.5 z-10 cursor-pointer"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleCheck(file.name)}
                            className="h-4 w-4 accent-indigo-600 rounded"
                          />
                        </label>

                        {/* Usage badge */}
                        {usedIn?.length && (
                          <div className="absolute top-1.5 right-1.5 z-10">
                            <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-white">
                              {usedIn.length}
                            </span>
                          </div>
                        )}

                        <button
                          type="button"
                          onClick={() => setSelected(isSelected ? null : file)}
                          className="w-full"
                        >
                          <div className="aspect-square bg-gray-50 dark:bg-gray-800 flex items-center justify-center overflow-hidden">
                            {file.isImage ? (
                              <img src={file.path} alt={file.name} className="w-full h-full object-cover" loading="lazy" />
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
                <div className="rounded-xl border border-border overflow-hidden">
                  <table className="min-w-full text-sm bg-card">
                    <thead className="bg-gray-50 dark:bg-gray-800">
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
                            className={`hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer ${isSelected ? 'bg-indigo-50 dark:bg-indigo-900/10' : ''}`}
                            onClick={() => setSelected(isSelected ? null : file)}
                          >
                            <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                              <input type="checkbox" checked={isChecked} onChange={() => toggleCheck(file.name)} className="h-4 w-4 accent-indigo-600" />
                            </td>
                            <td className="px-3 py-2.5">
                              <div className="flex items-center gap-2">
                                {file.isImage
                                  ? <img src={file.path} alt="" className="h-8 w-8 rounded object-cover shrink-0" loading="lazy" />
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
                <div className="aspect-square rounded-lg bg-gray-50 dark:bg-gray-800 border border-border flex items-center justify-center overflow-hidden">
                  {selected.isImage
                    ? <img src={selected.path} alt={selected.name} className="w-full h-full object-contain" />
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
                      <p className="font-medium text-indigo-700 dark:text-primary mb-1">
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
                      className="text-xs rounded-lg border border-indigo-300 dark:border-indigo-700 px-3 py-1.5 text-indigo-700 dark:text-primary hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors disabled:opacity-50">
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
