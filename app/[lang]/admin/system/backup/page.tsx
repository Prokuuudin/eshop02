'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import AdminGate from '@/components/admin/AdminGate'
import { Button } from '@/components/ui/button'
import { useAdminConfirm } from '@/components/admin/AdminConfirmProvider'
import { useAdminLocale } from '@/lib/use-admin-locale'

const LS_KEY = 'admin_backup_last_download'

function countEntries(value: unknown, l: (ru: string, en: string, lv: string) => string): string {
  if (Array.isArray(value)) return `${value.length} ${l('записей', 'entries', 'ieraksti')}`
  if (value && typeof value === 'object') {
    const keys = Object.keys(value as object).length
    return `${keys} ${l('ключей', 'keys', 'atslēgas')}`
  }
  return l('данные', 'data', 'dati')
}

export default function AdminBackupPage(): React.ReactElement {
  const { l, locale } = useAdminLocale()
  const includedFiles = [
    { name: 'orders.json', label: l('Заказы', 'Orders', 'Pasūtījumi') },
    { name: 'reviews.json', label: l('Отзывы', 'Reviews', 'Atsauksmes') },
    { name: 'blog-posts.json', label: l('Блог', 'Blog', 'Blogs') },
    { name: 'site-content.json', label: l('Контент сайта', 'Site content', 'Vietnes saturs') },
    { name: 'custom-products.json', label: l('Кастомные товары', 'Custom products', 'Pielāgotie produkti') },
    { name: 'product-overrides.json', label: l('Переопределения товаров', 'Product overrides', 'Produktu pārrakstījumi') },
    { name: 'banners.json', label: l('Баннеры', 'Banners', 'Reklāmkarogi') },
    { name: 'promo-codes.json', label: l('Промокоды', 'Promo codes', 'Promokodi') },
    { name: 'shipping-settings.json', label: l('Настройки доставки', 'Delivery settings', 'Piegādes iestatījumi') },
  ]
  const confirmAction = useAdminConfirm()
  const [lastDownload, setLastDownload] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState('')

  const [previewFiles, setPreviewFiles] = useState<Record<string, unknown> | null>(null)
  const [restoring, setRestoring] = useState(false)
  const [restoreResult, setRestoreResult] = useState<{ ok: boolean; message: string } | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const saved = localStorage.getItem(LS_KEY)
    if (saved) queueMicrotask(() => setLastDownload(saved))
  }, [])

  async function handleDownload() {
    setDownloading(true)
    setDownloadError('')
    try {
      const res = await fetch('/api/admin/backup')
      if (!res.ok) throw new Error(`${l('Ошибка сервера', 'Server error', 'Servera kļūda')}: ${res.status}`)
      const data = await res.json()
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const date = new Date().toISOString().slice(0, 10)
      a.download = `configuration-export-${date}.json`
      a.click()
      URL.revokeObjectURL(url)

      const ts = new Date().toLocaleString(locale)
      localStorage.setItem(LS_KEY, ts)
      setLastDownload(ts)
    } catch (e: unknown) {
      setDownloadError(e instanceof Error ? e.message : l('Неизвестная ошибка', 'Unknown error', 'Nezināma kļūda'))
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
          setRestoreResult({ ok: false, message: l('Неверный формат файла. Ожидается backup с полем "files".', 'Invalid file format. Expected a backup with a “files” field.', 'Nederīgs faila formāts. Nepieciešama rezerves kopija ar lauku “files”.') })
          return
        }
        setPreviewFiles(parsed.files)
      } catch {
        setRestoreResult({ ok: false, message: l('Не удалось прочитать файл. Убедитесь, что это корректный JSON.', 'Could not read the file. Make sure it contains valid JSON.', 'Neizdevās nolasīt failu. Pārliecinieties, ka tajā ir derīgs JSON.') })
      }
    }
    reader.readAsText(file)
  }

  async function handleRestore() {
    if (!previewFiles) return
    const decision = await confirmAction({ title: l('Восстановить резервную копию?', 'Restore backup?', 'Atjaunot rezerves kopiju?'), description: l('Текущие данные будут перезаписаны содержимым выбранной копии. Операцию нельзя отменить.', 'Current data will be overwritten with the selected backup. This cannot be undone.', 'Pašreizējie dati tiks pārrakstīti ar izvēlēto rezerves kopiju. Šo darbību nevar atsaukt.'), affected: Object.keys(previewFiles), confirmText: l('ВОССТАНОВИТЬ', 'RESTORE', 'ATJAUNOT'), requireReason: true, destructive: true })
    if (!decision.confirmed) return

    setRestoring(true)
    setRestoreResult(null)
    try {
      const res = await fetch('/api/admin/backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: previewFiles, confirmConfigurationRestore: true }),
      })
      const data = await res.json()
      if (data.ok) {
        setRestoreResult({
          ok: true,
          message: `${l('Восстановлено:', 'Restored:', 'Atjaunots:')} ${data.restored?.join(', ') || l('нет файлов', 'no files', 'nav failu')}${data.skipped?.length ? `. ${l('Пропущено:', 'Skipped:', 'Izlaists:')} ${data.skipped.join(', ')}` : ''}`,
        })
      } else {
        setRestoreResult({ ok: false, message: data.error ?? l('Ошибка восстановления', 'Restore failed', 'Atjaunošanas kļūda') })
      }
    } catch (e: unknown) {
      setRestoreResult({ ok: false, message: e instanceof Error ? e.message : l('Неизвестная ошибка', 'Unknown error', 'Nezināma kļūda') })
    } finally {
      setRestoring(false)
    }
  }

  return (
    <AdminGate>
      <main className="w-full py-4 space-y-8">
        <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {l('Этот раздел экспортирует только файловые настройки и контент. Он не копирует PostgreSQL, заказы, пользователей, счета или медиаданные и не заменяет PITR/резервную копию провайдера БД.', 'This section exports file-based settings and content only. It does not copy PostgreSQL, orders, users, invoices or media and does not replace PITR or a database-provider backup.', 'Šī sadaļa eksportē tikai failos glabātos iestatījumus un saturu. Tā nekopē PostgreSQL, pasūtījumus, lietotājus, rēķinus vai multividi un neaizstāj PITR vai datubāzes pakalpojuma sniedzēja rezerves kopiju.')}
        </div>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <h1 className="text-2xl font-bold">{l('Резервное копирование', 'Backup and restore', 'Rezerves kopēšana un atjaunošana')}</h1>
          <Button variant="outline" asChild>
            <Link href="/admin">← {l('Назад в админку', 'Back to admin', 'Atpakaļ uz administrāciju')}</Link>
          </Button>
        </div>

        {/* === Backup section === */}
        <section className="border rounded-lg p-6 space-y-4">
          <h2 className="text-lg font-semibold">{l('Создать резервную копию', 'Create backup', 'Izveidot rezerves kopiju')}</h2>

          <div>
            <p className="text-sm text-muted-foreground mb-3">{l('Будут включены следующие файлы:', 'The following files will be included:', 'Tiks iekļauti šādi faili:')}</p>
            <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {includedFiles.map((f) => (
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
              {downloading ? l('Загрузка…', 'Downloading…', 'Lejupielāde…') : l('Скачать backup.json', 'Download backup.json', 'Lejupielādēt backup.json')}
            </Button>
            {lastDownload && (
              <span className="text-sm text-muted-foreground">
                {l('Последнее скачивание:', 'Last download:', 'Pēdējā lejupielāde:')} {lastDownload}
              </span>
            )}
          </div>

          {downloadError && (
            <p className="text-sm text-destructive">{downloadError}</p>
          )}
        </section>

        {/* === Restore section === */}
        <section className="border rounded-lg p-6 space-y-4">
          <h2 className="text-lg font-semibold">{l('Восстановить из файла', 'Restore from file', 'Atjaunot no faila')}</h2>

          <div className="bg-yellow-50 border border-yellow-200 rounded-md px-4 py-3 text-sm text-yellow-800">
            {l('Восстановление перезапишет текущие данные. Сначала сделайте резервную копию.', 'Restoring will overwrite current data. Create a backup first.', 'Atjaunošana pārrakstīs pašreizējos datus. Vispirms izveidojiet rezerves kopiju.')}
          </div>

          <div>
            <label htmlFor="backup-file" className="block text-sm font-medium mb-2">{l('Выберите файл backup (.json)', 'Select backup file (.json)', 'Izvēlieties rezerves kopijas failu (.json)')}</label>
            <input
              id="backup-file"
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleFileSelect}
              className="block text-sm file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-primary file:text-primary-foreground hover:file:opacity-90 cursor-pointer"
            />
          </div>

          {previewFiles && (
            <div>
              <p className="text-sm font-medium mb-2">{l('Содержимое архива:', 'Backup contents:', 'Rezerves kopijas saturs:')}</p>
              <ul className="border rounded-md divide-y text-sm">
                {Object.entries(previewFiles).map(([filename, content]) => (
                  <li key={filename} className="flex items-center justify-between px-4 py-2">
                    <span className="font-mono">{filename}</span>
                    <span className="text-muted-foreground text-xs">{countEntries(content, l)}</span>
                  </li>
                ))}
              </ul>

              <Button
                variant="destructive"
                className="mt-4"
                onClick={handleRestore}
                disabled={restoring}
              >
                {restoring ? l('Восстановление…', 'Restoring…', 'Atjaunošana…') : l('Восстановить', 'Restore', 'Atjaunot')}
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
