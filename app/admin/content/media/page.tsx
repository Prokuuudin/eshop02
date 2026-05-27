'use client'

import React from 'react'
import Link from 'next/link'
import AdminGate from '@/components/admin/AdminGate'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type MediaFile = {
  name: string
  path: string
  size: number
  isImage: boolean
  ext: string
  createdAt: string
  modifiedAt: string
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  })
}

export default function AdminMediaPage() {
  const [files, setFiles] = React.useState<MediaFile[]>([])
  const [loading, setLoading] = React.useState(true)
  const [uploading, setUploading] = React.useState(false)
  const [deleting, setDeleting] = React.useState<string | null>(null)
  const [search, setSearch] = React.useState('')
  const [filter, setFilter] = React.useState<'all' | 'image' | 'other'>('all')
  const [copied, setCopied] = React.useState<string | null>(null)
  const [selected, setSelected] = React.useState<MediaFile | null>(null)
  const [message, setMessage] = React.useState<{ text: string; error?: boolean } | null>(null)
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  const showMsg = (text: string, error = false) => {
    setMessage({ text, error })
    setTimeout(() => setMessage(null), 3000)
  }

  const loadFiles = React.useCallback(async () => {
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

  React.useEffect(() => { void loadFiles() }, [loadFiles])

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? [])
    if (!picked.length) return

    setUploading(true)
    let success = 0
    let fail = 0

    for (const file of picked) {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/admin/content/upload', { method: 'POST', body: formData })
      if (res.ok) { success++ } else { fail++ }
    }

    setUploading(false)
    e.target.value = ''

    if (fail === 0) showMsg(`Загружено файлов: ${success}.`)
    else showMsg(`Загружено: ${success}, ошибок: ${fail}.`, fail > 0 && success === 0)

    await loadFiles()
  }

  const onCopy = async (path: string) => {
    await navigator.clipboard.writeText(path)
    setCopied(path)
    setTimeout(() => setCopied(null), 1500)
  }

  const onDelete = async (file: MediaFile) => {
    if (!confirm(`Удалить файл «${file.name}»? Это действие необратимо.`)) return
    setDeleting(file.name)
    try {
      const res = await fetch('/api/admin/media', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: file.name })
      })
      if (!res.ok) throw new Error()
      if (selected?.name === file.name) setSelected(null)
      showMsg(`Файл «${file.name}» удалён.`)
      await loadFiles()
    } catch {
      showMsg('Не удалось удалить файл.', true)
    } finally {
      setDeleting(null)
    }
  }

  const filtered = files.filter((f) => {
    const matchSearch = f.name.toLowerCase().includes(search.toLowerCase())
    const matchFilter = filter === 'all' || (filter === 'image' ? f.isImage : !f.isImage)
    return matchSearch && matchFilter
  })

  const totalSize = files.reduce((s, f) => s + f.size, 0)
  const imageCount = files.filter((f) => f.isImage).length

  return (
    <AdminGate>
      <main className="max-w-7xl mx-auto p-4 md:p-6 space-y-5">

        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-gray-100">
              Медиа-библиотека
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
              Все загруженные файлы из папки <code className="text-xs bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">public/uploads/</code>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/admin/content">
              <Button variant="outline">← Контент</Button>
            </Link>
            <Button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? 'Загрузка...' : '+ Загрузить файлы'}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={onUpload}
            />
          </div>
        </div>

        {/* Message */}
        {message && (
          <div className={`rounded-md border px-3 py-2 text-sm ${
            message.error
              ? 'border-red-300 bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300'
              : 'border-green-300 bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300'
          }`}>
            {message.text}
          </div>
        )}

        {/* Stats + toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
            <span>Всего файлов: <strong className="text-gray-900 dark:text-gray-100">{files.length}</strong></span>
            <span>Изображений: <strong className="text-gray-900 dark:text-gray-100">{imageCount}</strong></span>
            <span>Занято: <strong className="text-gray-900 dark:text-gray-100">{formatBytes(totalSize)}</strong></span>
          </div>
          <div className="flex items-center gap-2">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск по имени..."
              className="w-48 h-8 text-sm"
            />
            <div className="flex rounded-md border border-gray-200 dark:border-gray-700 overflow-hidden">
              {(['all', 'image', 'other'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                    filter === f
                      ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
                      : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`}
                >
                  {f === 'all' ? 'Все' : f === 'image' ? 'Изображения' : 'Прочие'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {loading ? (
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-12 text-center text-sm text-gray-500 dark:text-gray-400">
            Загрузка...
          </div>
        ) : files.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 dark:border-gray-700 p-12 text-center">
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
              Пока нет загруженных файлов.
            </p>
            <Button onClick={() => fileInputRef.current?.click()} disabled={uploading}>
              Загрузить первый файл
            </Button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-8 text-center text-sm text-gray-500 dark:text-gray-400">
            Ничего не найдено по запросу «{search}».
          </div>
        ) : (
          <div className="flex gap-4 items-start">
            {/* Grid */}
            <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
              {filtered.map((file) => (
                <button
                  key={file.name}
                  type="button"
                  onClick={() => setSelected(selected?.name === file.name ? null : file)}
                  className={`group relative rounded-lg border bg-white dark:bg-gray-900 overflow-hidden text-left transition-all hover:shadow-md focus:outline-none ${
                    selected?.name === file.name
                      ? 'border-indigo-400 ring-2 ring-indigo-300 dark:ring-indigo-600'
                      : 'border-gray-200 dark:border-gray-700'
                  }`}
                >
                  {/* Thumbnail */}
                  <div className="aspect-square bg-gray-50 dark:bg-gray-800 flex items-center justify-center overflow-hidden">
                    {file.isImage ? (
                      <img
                        src={file.path}
                        alt={file.name}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <span className="text-3xl text-gray-400 dark:text-gray-500 uppercase font-bold">
                        {file.ext}
                      </span>
                    )}
                  </div>

                  {/* Name + size */}
                  <div className="p-2">
                    <p className="text-xs text-gray-700 dark:text-gray-200 truncate leading-tight" title={file.name}>
                      {file.name}
                    </p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                      {formatBytes(file.size)}
                    </p>
                  </div>
                </button>
              ))}
            </div>

            {/* Detail panel */}
            {selected && (
              <div className="w-64 flex-shrink-0 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 space-y-4 sticky top-6">
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="absolute top-3 right-3 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-lg leading-none"
                  aria-label="Закрыть"
                >×</button>

                {/* Preview */}
                <div className="aspect-square rounded-md bg-gray-50 dark:bg-gray-800 flex items-center justify-center overflow-hidden border border-gray-200 dark:border-gray-700">
                  {selected.isImage ? (
                    <img
                      src={selected.path}
                      alt={selected.name}
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <span className="text-4xl font-bold text-gray-300 dark:text-gray-600 uppercase">
                      {selected.ext}
                    </span>
                  )}
                </div>

                {/* Meta */}
                <div className="space-y-1 text-xs text-gray-600 dark:text-gray-300">
                  <p className="font-medium text-gray-900 dark:text-gray-100 break-all">{selected.name}</p>
                  <p>Размер: {formatBytes(selected.size)}</p>
                  <p>Тип: {selected.ext.toUpperCase()}</p>
                  <p>Дата: {formatDate(selected.modifiedAt)}</p>
                </div>

                {/* Path */}
                <div className="space-y-1">
                  <p className="text-xs text-gray-500 dark:text-gray-400">Путь для вставки:</p>
                  <div className="flex items-center gap-1">
                    <code className="flex-1 text-xs bg-gray-100 dark:bg-gray-800 rounded px-2 py-1.5 break-all text-gray-800 dark:text-gray-200">
                      {selected.path}
                    </code>
                  </div>
                  <Button
                    size="sm"
                    variant={copied === selected.path ? 'default' : 'outline'}
                    className="w-full text-xs"
                    onClick={() => void onCopy(selected.path)}
                  >
                    {copied === selected.path ? '✓ Скопировано!' : 'Копировать путь'}
                  </Button>
                </div>

                {/* Open + Delete */}
                <div className="flex flex-col gap-2">
                  <a
                    href={selected.path}
                    target="_blank"
                    rel="noreferrer"
                    className="text-center text-xs rounded-md border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  >
                    Открыть в новой вкладке ↗
                  </a>
                  <Button
                    size="sm"
                    variant="destructive"
                    className="w-full text-xs"
                    disabled={deleting === selected.name}
                    onClick={() => void onDelete(selected)}
                  >
                    {deleting === selected.name ? 'Удаление...' : 'Удалить файл'}
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
