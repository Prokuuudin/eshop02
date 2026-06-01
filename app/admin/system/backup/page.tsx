'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import AdminGate from '@/components/admin/AdminGate'
import { Button } from '@/components/ui/button'

const INCLUDED_FILES = [
  { name: 'orders.json', label: 'Заказы' },
  { name: 'reviews.json', label: 'Отзывы' },
  { name: 'blog-posts.json', label: 'Блог' },
  { name: 'site-content.json', label: 'Контент сайта' },
  { name: 'custom-products.json', label: 'Кастомные товары' },
  { name: 'product-overrides.json', label: 'Переопределения товаров' },
  { name: 'banners.json', label: 'Баннеры' },
  { name: 'promo-codes.json', label: 'Промокоды' },
  { name: 'shipping-settings.json', label: 'Настройки доставки' },
]

const LS_KEY = 'admin_backup_last_download'

function countEntries(value: unknown): string {
  if (Array.isArray(value)) return `${value.length} записей`
  if (value && typeof value === 'object') {
    const keys = Object.keys(value as object).length
    return `${keys} ключей`
  }
  return 'данные'
}

export default function AdminBackupPage() {
  const [lastDownload, setLastDownload] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState('')

  const [previewFiles, setPreviewFiles] = useState<Record<string, unknown> | null>(null)
  const [restoring, setRestoring] = useState(false)
  const [restoreResult, setRestoreResult] = useState<{ ok: boolean; message: string } | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const saved = localStorage.getItem(LS_KEY)
    if (saved) setLastDownload(saved)
  }, [])

  async function handleDownload() {
    setDownloading(true)
    setDownloadError('')
    try {
      const res = await fetch('/api/admin/backup')
      if (!res.ok) throw new Error(`Ошибка сервера: ${res.status}`)
      const data = await res.json()
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const date = new Date().toISOString().slice(0, 10)
      a.download = `backup-${date}.json`
      a.click()
      URL.revokeObjectURL(url)

      const ts = new Date().toLocaleString('ru-RU')
      localStorage.setItem(LS_KEY, ts)
      setLastDownload(ts)
    } catch (e: unknown) {
      setDownloadError(e instanceof Error ? e.message : 'Неизвестная ошибка')
    } finally {
      setDownloading(false)
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setRestoreResult(null)
    setPreviewFiles(null)

    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string)
        if (!parsed?.files || typeof parsed.files !== 'object') {
          setRestoreResult({ ok: false, message: 'Неверный формат файла. Ожидается backup с полем "files".' })
          return
        }
        setPreviewFiles(parsed.files)
      } catch {
        setRestoreResult({ ok: false, message: 'Не удалось прочитать файл. Убедитесь, что это корректный JSON.' })
      }
    }
    reader.readAsText(file)
  }

  async function handleRestore() {
    if (!previewFiles) return
    if (!confirm('Восстановление перезапишет текущие данные. Продолжить?')) return

    setRestoring(true)
    setRestoreResult(null)
    try {
      const res = await fetch('/api/admin/backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: previewFiles }),
      })
      const data = await res.json()
      if (data.ok) {
        setRestoreResult({
          ok: true,
          message: `Восстановлено: ${data.restored?.join(', ') || 'нет файлов'}${data.skipped?.length ? `. Пропущено: ${data.skipped.join(', ')}` : ''}`,
        })
      } else {
        setRestoreResult({ ok: false, message: data.error ?? 'Ошибка восстановления' })
      }
    } catch (e: unknown) {
      setRestoreResult({ ok: false, message: e instanceof Error ? e.message : 'Неизвестная ошибка' })
    } finally {
      setRestoring(false)
    }
  }

  return (
    <AdminGate>
      <main className="w-full py-4 space-y-8">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <h1 className="text-2xl font-bold">Резервное копирование</h1>
          <Button variant="outline" asChild>
            <Link href="/admin">← Назад в админку</Link>
          </Button>
        </div>

        {/* === Backup section === */}
        <section className="border rounded-lg p-6 space-y-4">
          <h2 className="text-lg font-semibold">Создать резервную копию</h2>

          <div>
            <p className="text-sm text-muted-foreground mb-3">Будут включены следующие файлы:</p>
            <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {INCLUDED_FILES.map((f) => (
                <li key={f.name} className="flex items-center gap-2 text-sm">
                  <span className="text-base">📄</span>
                  <span>
                    <span className="font-medium">{f.label}</span>
                    <span className="text-muted-foreground text-xs block">{f.name}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex items-center gap-4 flex-wrap">
            <Button onClick={handleDownload} disabled={downloading}>
              {downloading ? 'Загрузка…' : 'Скачать backup.json'}
            </Button>
            {lastDownload && (
              <span className="text-sm text-muted-foreground">
                Последнее скачивание: {lastDownload}
              </span>
            )}
          </div>

          {downloadError && (
            <p className="text-sm text-destructive">{downloadError}</p>
          )}
        </section>

        {/* === Restore section === */}
        <section className="border rounded-lg p-6 space-y-4">
          <h2 className="text-lg font-semibold">Восстановить из файла</h2>

          <div className="bg-yellow-50 border border-yellow-200 rounded-md px-4 py-3 text-sm text-yellow-800">
            Восстановление перезапишет текущие данные. Сначала сделайте резервную копию.
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Выберите файл backup (.json)</label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleFileSelect}
              className="block text-sm file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-primary file:text-primary-foreground hover:file:opacity-90 cursor-pointer"
            />
          </div>

          {previewFiles && (
            <div>
              <p className="text-sm font-medium mb-2">Содержимое архива:</p>
              <ul className="border rounded-md divide-y text-sm">
                {Object.entries(previewFiles).map(([filename, content]) => (
                  <li key={filename} className="flex items-center justify-between px-4 py-2">
                    <span className="font-mono">{filename}</span>
                    <span className="text-muted-foreground text-xs">{countEntries(content)}</span>
                  </li>
                ))}
              </ul>

              <Button
                variant="destructive"
                className="mt-4"
                onClick={handleRestore}
                disabled={restoring}
              >
                {restoring ? 'Восстановление…' : 'Восстановить'}
              </Button>
            </div>
          )}

          {restoreResult && (
            <div
              className={`rounded-md px-4 py-3 text-sm ${
                restoreResult.ok
                  ? 'bg-green-50 border border-green-200 text-green-800'
                  : 'bg-red-50 border border-red-200 text-red-800'
              }`}
            >
              {restoreResult.message}
            </div>
          )}
        </section>
      </main>
    </AdminGate>
  )
}
