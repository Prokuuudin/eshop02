'use client'

import { useEffect, useState } from 'react'
import AdminGate from '@/components/admin/AdminGate'
import { Button } from '@/components/ui/button'
import { useAdminLocale } from '@/lib/use-admin-locale'
import { Info } from 'lucide-react'

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
    { name: 'email-templates.json', label: l('Шаблоны писем', 'Email templates', 'E-pasta veidnes') },
    { name: 'price-groups.json', label: l('Ценовые группы', 'Price groups', 'Cenu grupas') },
  ]
  const [lastDownload, setLastDownload] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState('')

  const [previewFiles, setPreviewFiles] = useState<Record<string, unknown> | null>(null)
  const [selectedBackup, setSelectedBackup] = useState<unknown>(null)
  const [selectedCreatedAt, setSelectedCreatedAt] = useState<string | null>(null)
  const [previewError, setPreviewError] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [restoring, setRestoring] = useState(false)
  const [restoreMessage, setRestoreMessage] = useState('')

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
      const disposition = res.headers.get('Content-Disposition')
      a.download = disposition?.match(/filename="([^"]+)"/)?.[1] ?? `configuration-backup-${new Date().toISOString().slice(0, 10)}.json`
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
    setSelectedBackup(null)
    setSelectedCreatedAt(null)
    setRestoreMessage('')

    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string)
        if (parsed?.kind !== 'configuration-backup' || parsed.version !== 1 || !parsed.files || !parsed.manifest || typeof parsed.files !== 'object' || Array.isArray(parsed.files)) {
          setPreviewError(l('Неверный формат. Выберите JSON-файл конфигурации, скачанный из этого раздела.', 'Invalid format. Select a configuration JSON file downloaded from this section.', 'Nederīgs formāts. Izvēlieties konfigurācijas JSON failu, kas lejupielādēts no šīs sadaļas.'))
          return
        }
        setPreviewFiles(parsed.files)
        setSelectedBackup(parsed)
        setSelectedCreatedAt(typeof parsed.createdAt === 'string' ? parsed.createdAt : null)
      } catch {
        setPreviewError(l('Не удалось прочитать файл. Убедитесь, что это корректный JSON.', 'Could not read the file. Make sure it contains valid JSON.', 'Neizdevās nolasīt failu. Pārliecinieties, ka tajā ir derīgs JSON.'))
      }
    }
    reader.readAsText(file)
  }

  async function handleRestore() {
    if (!selectedBackup || confirmation !== 'RESTORE CONFIGURATION') return
    setRestoring(true)
    setRestoreMessage('')
    try {
      const res = await fetch('/api/admin/backup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ backup: selectedBackup, confirmation }) })
      const result = await res.json().catch(() => null) as { restored?: string[]; error?: string } | null
      if (!res.ok) throw new Error(result?.error ?? `HTTP ${res.status}`)
      setRestoreMessage(l(`Восстановлено файлов: ${result?.restored?.length ?? 0}.`, `Restored files: ${result?.restored?.length ?? 0}.`, `Atjaunoti faili: ${result?.restored?.length ?? 0}.`))
      setConfirmation('')
    } catch (error) {
      setRestoreMessage(`${l('Восстановление не выполнено', 'Restore failed', 'Atjaunošana neizdevās')}: ${error instanceof Error ? error.message : 'unknown_error'}`)
    } finally {
      setRestoring(false)
    }
  }

  return (
    <AdminGate>
      <main className="w-full py-4 space-y-8">
        <div role="alert" className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <Info aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />
          <p>{l('Этот раздел экспортирует только файловые настройки и контент. Он не копирует PostgreSQL, заказы, пользователей, счета или медиаданные и не заменяет PITR/резервную копию провайдера БД.', 'This section exports file-based settings and content only. It does not copy PostgreSQL, orders, users, invoices or media and does not replace PITR or a database-provider backup.', 'Šī sadaļa eksportē tikai failos glabātos iestatījumus un saturu. Tā nekopē PostgreSQL, pasūtījumus, lietotājus, rēķinus vai multividi un neaizstāj PITR vai datubāzes pakalpojuma sniedzēja rezerves kopiju.')}</p>
        </div>

        <div className="flex items-center justify-between gap-4 flex-wrap">
          <h1 className="text-2xl font-bold">{l('Резервное копирование', 'Backup and restore', 'Rezerves kopēšana un atjaunošana')}</h1>
        </div>

        <details className="group rounded-lg border border-blue-200 bg-blue-50 text-sm text-blue-950">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 font-semibold text-base select-none [&::-webkit-details-marker]:hidden">
            <span className="flex items-center gap-2"><Info aria-hidden="true" className="h-5 w-5 shrink-0" />{l('Как это работает', 'How this works', 'Kā tas darbojas')}</span>
            <span aria-hidden="true" className="text-xl leading-none transition-transform group-open:rotate-180">⌄</span>
          </summary>
          <div className="space-y-4 border-t border-blue-200 px-5 py-4">
            <p className="text-blue-900">{l('На этой странице можно сохранить и восстановить настройки сайта. Файл скачивается на ваш компьютер — на сервере история копий не хранится.', 'This page saves and restores site settings. The file is downloaded to your computer; no backup history is stored on the server.', 'Šajā lapā var saglabāt un atjaunot vietnes iestatījumus. Fails tiek lejupielādēts datorā; serverī kopiju vēsture netiek glabāta.')}</p>
            <ol className="list-decimal pl-5 space-y-2">
            <li><strong>{l('Создайте копию.', 'Create a backup.', 'Izveidojiet kopiju.')}</strong> {l('Нажмите «Скачать backup.json» и сохраните полученный файл в надёжном месте. В нём находятся все настройки, перечисленные ниже.', 'Click “Download backup.json” and keep the downloaded file in a safe place. It contains every setting listed below.', 'Noklikšķiniet “Lejupielādēt backup.json” un glabājiet failu drošā vietā. Tajā ir visi zemāk uzskaitītie iestatījumi.')}</li>
            <li><strong>{l('Перед восстановлением скачайте новую копию.', 'Before restoring, download a fresh backup.', 'Pirms atjaunošanas lejupielādējiet jaunu kopiju.')}</strong> {l('Она позволит отменить результат, если выбранный архив окажется не тем.', 'It lets you undo the change if you selected the wrong backup.', 'Tā ļaus atcelt izmaiņas, ja būs izvēlēta nepareizā kopija.')}</li>
            <li><strong>{l('Выберите архив.', 'Select the backup.', 'Izvēlieties kopiju.')}</strong> {l('В разделе «Восстановить конфигурацию» укажите JSON-файл и проверьте дату и список файлов. Система также автоматически проверит полноту и контрольные суммы.', 'Under “Restore configuration”, choose the JSON file and verify its date and file list. The system also checks completeness and checksums automatically.', 'Sadaļā “Atjaunot konfigurāciju” izvēlieties JSON failu un pārbaudiet tā datumu un failu sarakstu. Sistēma automātiski pārbaudīs arī pilnīgumu un kontrolsummas.')}</li>
            <li><strong>{l('Подтвердите замену.', 'Confirm replacement.', 'Apstipriniet aizstāšanu.')}</strong> {l('Введите RESTORE CONFIGURATION и нажмите «Восстановить конфигурацию». Все перечисленные настройки будут заменены одновременно; выбрать отдельные файлы нельзя.', 'Type RESTORE CONFIGURATION and click “Restore configuration”. All listed settings are replaced together; individual files cannot be selected.', 'Ievadiet RESTORE CONFIGURATION un noklikšķiniet “Atjaunot konfigurāciju”. Visi uzskaitītie iestatījumi tiks aizstāti kopā; atsevišķus failus izvēlēties nevar.')}</li>
            </ol>
            <div className="rounded-md border border-blue-300 bg-white/70 px-3 py-2">
              <p className="font-semibold">{l('Что не восстанавливается на этой странице', 'What this page does not restore', 'Ko šajā lapā neatjauno')}</p>
              <p className="mt-1">{l('Товары, остатки, заказы, пользователи, счета и загруженные изображения находятся в PostgreSQL. Для их восстановления остановите изменения в магазине и обратитесь к техническому администратору: он восстановит PITR/дамп в отдельную базу, проверит её и только затем переключит магазин.', 'Products, stock, orders, users, invoices and uploaded images are stored in PostgreSQL. To recover them, pause store changes and contact the technical administrator: they must restore PITR/a dump into a separate database, verify it, and only then switch the store over.', 'Produkti, atlikumi, pasūtījumi, lietotāji, rēķini un augšupielādētie attēli glabājas PostgreSQL. Lai tos atjaunotu, apturiet izmaiņas veikalā un sazinieties ar tehnisko administratoru: PITR vai izmetne jāatjauno atsevišķā datubāzē, jāpārbauda un tikai tad veikals jāpārslēdz.')}</p>
            </div>
          </div>
        </details>
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
          <h2 className="text-lg font-semibold">{l('Восстановить конфигурацию', 'Restore configuration', 'Atjaunot konfigurāciju')}</h2>

          <div className="flex items-start gap-3 bg-yellow-50 border border-yellow-200 rounded-md px-4 py-3 text-sm text-yellow-800">
            <Info aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />
            <p>{l('Восстановление заменяет всю файловую конфигурацию. Перед операцией скачайте текущую копию. PostgreSQL восстанавливается отдельно через PITR в изолированную базу.', 'Restore replaces all file-based configuration. Download the current backup first. PostgreSQL is restored separately using PITR into an isolated database.', 'Atjaunošana aizstāj visu failu konfigurāciju. Vispirms lejupielādējiet pašreizējo kopiju. PostgreSQL atjauno atsevišķi ar PITR izolētā datubāzē.')}</p>
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
              {selectedCreatedAt && <p className="mb-2 text-sm text-muted-foreground">{l('Копия создана:', 'Backup created:', 'Kopija izveidota:')} {new Date(selectedCreatedAt).toLocaleString(locale)}</p>}
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

          {previewFiles && (
            <div className="space-y-2 border-t pt-4">
              <label htmlFor="restore-confirmation" className="block text-sm font-medium">
                {l('Для подтверждения введите RESTORE CONFIGURATION', 'Type RESTORE CONFIGURATION to confirm', 'Lai apstiprinātu, ievadiet RESTORE CONFIGURATION')}
              </label>
              <div className="flex gap-3 flex-wrap">
                <input id="restore-confirmation" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="h-10 rounded-md border px-3 font-mono text-sm" />
                <Button variant="destructive" disabled={restoring || confirmation !== 'RESTORE CONFIGURATION'} onClick={handleRestore}>
                  {restoring ? l('Восстановление…', 'Restoring…', 'Atjauno…') : l('Восстановить конфигурацию', 'Restore configuration', 'Atjaunot konfigurāciju')}
                </Button>
              </div>
              {restoreMessage && <p role="status" className="text-sm">{restoreMessage}</p>}
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
