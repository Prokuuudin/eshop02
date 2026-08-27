'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import AdminGate from '@/components/admin/AdminGate'
import { Button } from '@/components/ui/button'
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
    { name: 'blog-posts.json', label: l('Блог', 'Blog', 'Blogs') },
    { name: 'site-content.json', label: l('Контент сайта', 'Site content', 'Vietnes saturs') },
    { name: 'custom-products.json', label: l('Кастомные товары', 'Custom products', 'Pielāgotie produkti') },
    { name: 'product-overrides.json', label: l('Переопределения товаров', 'Product overrides', 'Produktu pārrakstījumi') },
    { name: 'banners.json', label: l('Баннеры', 'Banners', 'Reklāmkarogi') },
    { name: 'promo-codes.json', label: l('Промокоды', 'Promo codes', 'Promokodi') },
    { name: 'shipping-settings.json', label: l('Настройки доставки', 'Delivery settings', 'Piegādes iestatījumi') },
  ]
  const [lastDownload, setLastDownload] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState('')

  const [previewFiles, setPreviewFiles] = useState<Record<string, unknown> | null>(null)
  const [previewError, setPreviewError] = useState('')

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
    setPreviewError('')
    setPreviewFiles(null)

    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string)
        if (parsed?.kind !== 'configuration-export' || !parsed.files || typeof parsed.files !== 'object' || Array.isArray(parsed.files)) {
          setPreviewError(l('Неверный формат. Выберите JSON-файл конфигурации, скачанный из этого раздела.', 'Invalid format. Select a configuration JSON file downloaded from this section.', 'Nederīgs formāts. Izvēlieties konfigurācijas JSON failu, kas lejupielādēts no šīs sadaļas.'))
          return
        }
        setPreviewFiles(parsed.files)
      } catch {
        setPreviewError(l('Не удалось прочитать файл. Убедитесь, что это корректный JSON.', 'Could not read the file. Make sure it contains valid JSON.', 'Neizdevās nolasīt failu. Pārliecinieties, ka tajā ir derīgs JSON.'))
      }
    }
    reader.readAsText(file)
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
          <h2 className="text-lg font-semibold">{l('Проверить файл экспорта', 'Inspect export file', 'Pārbaudīt eksporta failu')}</h2>

          <div className="bg-yellow-50 border border-yellow-200 rounded-md px-4 py-3 text-sm text-yellow-800">
            {l('Автоматическое восстановление отключено. Здесь можно только проверить состав файла; восстановление выполняется в рамках контролируемого технического обслуживания.', 'Automatic restore is disabled. You can inspect the file contents here; restoration is performed only during controlled maintenance.', 'Automātiskā atjaunošana ir atspējota. Šeit var tikai pārbaudīt faila saturu; atjaunošanu veic kontrolētas apkopes laikā.')}
          </div>

          <div>
            <label htmlFor="backup-file" className="block text-sm font-medium mb-2">{l('Выберите файл backup (.json)', 'Select backup file (.json)', 'Izvēlieties rezerves kopijas failu (.json)')}</label>
            <input
              id="backup-file"
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
            </div>
          )}

          {previewError && (
            <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {previewError}
            </div>
          )}
        </section>
      </main>
    </AdminGate>
  )
}
