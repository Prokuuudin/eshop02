'use client'

import React from 'react'
import Link from 'next/link'
import AdminGate from '@/components/admin/AdminGate'
import { Button } from '@/components/ui/button'

// ─── CSV parser (no external deps) ───────────────────────────────────────────

function parseCSV(text: string): string[][] {
  const rows: string[][] = []
  const lines = text.split(/\r?\n/)

  for (const line of lines) {
    if (!line.trim()) continue
    const cells: string[] = []
    let cur = ''
    let inQ = false

    for (let i = 0; i < line.length; i++) {
      const c = line[i]
      if (c === '"') {
        if (inQ && line[i + 1] === '"') { cur += '"'; i++ }
        else inQ = !inQ
      } else if (c === ',' && !inQ) {
        cells.push(cur); cur = ''
      } else {
        cur += c
      }
    }
    cells.push(cur)
    rows.push(cells)
  }
  return rows
}

function csvToObjects(text: string): Record<string, string>[] {
  const rows = parseCSV(text)
  if (rows.length < 2) return []
  const headers = rows[0].map((h) => h.trim())
  return rows.slice(1).map((row) => {
    const obj: Record<string, string> = {}
    headers.forEach((h, i) => { obj[h] = row[i]?.trim() ?? '' })
    return obj
  })
}

// ─── Types ────────────────────────────────────────────────────────────────────

type ImportMode = 'create' | 'update' | 'upsert'

type ImportResult = {
  created: number
  updated: number
  skipped: number
  errors: { row: number; id: string; message: string }[]
}

// ─── Required + optional CSV columns ──────────────────────────────────────────

const REQUIRED_COLS = ['id', 'title', 'brand', 'price', 'stock', 'category']
const ALL_COLS = [
  ...REQUIRED_COLS,
  'titleEn', 'titleLv', 'sku', 'oldPrice', 'rating', 'ratingCount', 'image', 'badges',
  'description', 'purpose', 'specVolume', 'specType', 'specCountry',
  'feature1', 'feature1En', 'feature1Lv',
  'feature2', 'feature2En', 'feature2Lv',
  'feature3', 'feature3En', 'feature3Lv',
  'feature4', 'feature4En', 'feature4Lv',
  'unitOfMeasure', 'packagingSize', 'bonusRate',
  'manufacturerName', 'manufacturerAddress', 'manufacturerEmail',
  'metaTitle', 'metaDescription',
]

const MODE_LABELS: Record<ImportMode, string> = {
  create: 'Только создание — новые товары, существующие пропускаются',
  update: 'Только обновление — существующие товары, новые пропускаются',
  upsert: 'Создание + обновление — новые создаются, существующие обновляются',
}

const PREVIEW_COLS = ['id', 'title', 'brand', 'price', 'stock', 'category', 'sku']

// ─── Component ────────────────────────────────────────────────────────────────

export default function AdminImportPage() {
  const [rows, setRows] = React.useState<Record<string, string>[]>([])
  const [fileName, setFileName] = React.useState('')
  const [mode, setMode] = React.useState<ImportMode>('upsert')
  const [importing, setImporting] = React.useState(false)
  const [result, setResult] = React.useState<ImportResult | null>(null)
  const [parseError, setParseError] = React.useState('')
  const [missingCols, setMissingCols] = React.useState<string[]>([])
  const fileRef = React.useRef<HTMLInputElement>(null)

  // ── File handling ─────────────────────────────────────────────────────────

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    setResult(null)
    setParseError('')
    setMissingCols([])

    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      try {
        const parsed = csvToObjects(text)
        if (parsed.length === 0) { setParseError('Файл пуст или не содержит строк данных.'); return }

        const headers = Object.keys(parsed[0])
        const missing = REQUIRED_COLS.filter((c) => !headers.includes(c))
        setMissingCols(missing)
        setRows(parsed)
      } catch {
        setParseError('Не удалось разобрать CSV. Проверьте формат файла.')
      }
    }
    reader.readAsText(file, 'utf-8')
    e.target.value = ''
  }

  const onReset = () => {
    setRows([])
    setFileName('')
    setResult(null)
    setParseError('')
    setMissingCols([])
  }

  // ── Import ────────────────────────────────────────────────────────────────

  const onImport = async () => {
    if (!rows.length || missingCols.length > 0) return
    setImporting(true)
    setResult(null)
    try {
      const res = await fetch('/api/admin/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows, mode })
      })
      const data = (await res.json()) as ImportResult
      setResult(data)
    } catch {
      setResult({ created: 0, updated: 0, skipped: 0, errors: [{ row: 0, id: '', message: 'Ошибка соединения с сервером.' }] })
    } finally {
      setImporting(false)
    }
  }

  // ── Validation summary ────────────────────────────────────────────────────

  const detectedCols = rows.length > 0 ? Object.keys(rows[0]) : []
  const canImport = rows.length > 0 && missingCols.length === 0

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <AdminGate>
      <main className="max-w-6xl mx-auto p-4 md:p-6 space-y-6">

        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-gray-100">
              Импорт и обновление каталога
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
              Загрузка товаров из CSV, массовое обновление цен и остатков, экспорт каталога.
            </p>
          </div>
          <Link href="/admin">
            <Button variant="outline">Назад в админку</Button>
          </Link>
        </div>

        {/* ══ EXPORT ══════════════════════════════════════════════════════════ */}
        <section className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5 space-y-4">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Экспорт каталога</h2>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Скачайте все товары в формате CSV — включая базовые и добавленные через админку.
            Используйте этот файл как основу для редактирования и последующего импорта.
          </p>
          <div className="flex flex-wrap gap-3">
            <a href="/api/admin/export" download>
              <Button>Скачать каталог (CSV)</Button>
            </a>
            <a href="/api/admin/export?template=1" download>
              <Button variant="outline">Скачать шаблон (1 пример)</Button>
            </a>
          </div>
          <div className="rounded-md bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-3">
            <p className="text-xs font-medium text-gray-700 dark:text-gray-200 mb-1">Колонки в CSV:</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed font-mono">
              <span className="text-red-600 dark:text-red-400">{REQUIRED_COLS.join(', ')}</span>
              {', '}
              {ALL_COLS.slice(REQUIRED_COLS.length).join(', ')}
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              Красным — обязательные. Остальные — необязательные, можно не включать в файл.
              Для <code>badges</code> используйте разделитель <code>;</code> (например: <code>sale;new</code>).
              Категории: <code>hair, face, body, nails, equipment, new</code>.
            </p>
          </div>
        </section>

        {/* ══ IMPORT ══════════════════════════════════════════════════════════ */}
        <section className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5 space-y-5">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Импорт из CSV</h2>

          {/* Step 1: Upload */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-200">1. Выберите файл</p>
            <div className="flex items-center gap-3">
              <Button variant="outline" onClick={() => fileRef.current?.click()}>
                {fileName ? 'Заменить файл' : 'Выбрать CSV-файл'}
              </Button>
              {fileName && (
                <>
                  <span className="text-sm text-gray-700 dark:text-gray-200 font-medium">{fileName}</span>
                  <span className="text-sm text-gray-500 dark:text-gray-400">— {rows.length} строк</span>
                  <button type="button" onClick={onReset} className="text-xs text-red-500 hover:underline">
                    Очистить
                  </button>
                </>
              )}
            </div>
            <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={onFileChange} />
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
              <p className="text-sm font-medium text-gray-700 dark:text-gray-200">Обнаруженные колонки:</p>
              <div className="flex flex-wrap gap-1.5">
                {detectedCols.map((col) => (
                  <span
                    key={col}
                    className={`text-xs rounded px-2 py-0.5 font-mono ${
                      REQUIRED_COLS.includes(col)
                        ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'
                    }`}
                  >
                    {col}
                  </span>
                ))}
              </div>
              {missingCols.length > 0 && (
                <div className="rounded-md border border-red-300 bg-red-50 dark:bg-red-900/20 px-3 py-2 text-sm text-red-700 dark:text-red-300">
                  Отсутствуют обязательные колонки: <strong>{missingCols.join(', ')}</strong>
                </div>
              )}
              {missingCols.length === 0 && (
                <p className="text-xs text-green-600 dark:text-green-400">
                  Все обязательные колонки присутствуют.
                </p>
              )}
            </div>
          )}

          {/* Step 2: Mode */}
          {canImport && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-200">2. Режим импорта</p>
              <div className="space-y-2">
                {(Object.keys(MODE_LABELS) as ImportMode[]).map((m) => (
                  <label key={m} className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="mode"
                      value={m}
                      checked={mode === m}
                      onChange={() => setMode(m)}
                      className="mt-0.5"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-200">
                      <strong className="capitalize">{m}</strong> — {MODE_LABELS[m]}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Step 3: Preview */}
          {canImport && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
                3. Предпросмотр{rows.length > 10 ? ` (первые 10 из ${rows.length})` : ` (${rows.length} строк)`}
              </p>
              <div className="overflow-x-auto rounded-md border border-gray-200 dark:border-gray-700">
                <table className="min-w-full text-xs">
                  <thead className="bg-gray-50 dark:bg-gray-800">
                    <tr>
                      <th className="px-3 py-2 text-left text-gray-500 dark:text-gray-400 font-medium">#</th>
                      {PREVIEW_COLS.filter((c) => detectedCols.includes(c)).map((col) => (
                        <th key={col} className="px-3 py-2 text-left text-gray-500 dark:text-gray-400 font-medium whitespace-nowrap">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {rows.slice(0, 10).map((row, i) => (
                      <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                        <td className="px-3 py-2 text-gray-400 dark:text-gray-500">{i + 2}</td>
                        {PREVIEW_COLS.filter((c) => detectedCols.includes(c)).map((col) => (
                          <td key={col} className="px-3 py-2 text-gray-700 dark:text-gray-200 max-w-[180px] truncate">
                            {row[col] || <span className="text-gray-300 dark:text-gray-600">—</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Step 4: Run */}
          {canImport && !result && (
            <div className="flex items-center gap-3">
              <Button onClick={onImport} disabled={importing}>
                {importing ? 'Импортируется...' : `Запустить импорт (${rows.length} строк, режим: ${mode})`}
              </Button>
            </div>
          )}

          {/* Result */}
          {result && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 p-3 text-center">
                  <p className="text-2xl font-bold text-green-700 dark:text-green-300">{result.created}</p>
                  <p className="text-xs text-green-600 dark:text-green-400 mt-0.5">Создано</p>
                </div>
                <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 p-3 text-center">
                  <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">{result.updated}</p>
                  <p className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">Обновлено</p>
                </div>
                <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 p-3 text-center">
                  <p className="text-2xl font-bold text-gray-600 dark:text-gray-300">{result.skipped}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Пропущено</p>
                </div>
                <div className={`rounded-lg border p-3 text-center ${
                  result.errors.length > 0
                    ? 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20'
                    : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800'
                }`}>
                  <p className={`text-2xl font-bold ${result.errors.length > 0 ? 'text-red-700 dark:text-red-300' : 'text-gray-600 dark:text-gray-300'}`}>
                    {result.errors.length}
                  </p>
                  <p className={`text-xs mt-0.5 ${result.errors.length > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'}`}>
                    Ошибок
                  </p>
                </div>
              </div>

              {result.errors.length > 0 && (
                <div className="rounded-md border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/10 p-3 space-y-1 max-h-48 overflow-y-auto">
                  <p className="text-xs font-medium text-red-700 dark:text-red-300 mb-2">Ошибки импорта:</p>
                  {result.errors.map((e, i) => (
                    <p key={i} className="text-xs text-red-600 dark:text-red-400 font-mono">
                      Строка {e.row}{e.id ? ` (${e.id})` : ''}: {e.message}
                    </p>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-3">
                {result.created + result.updated > 0 && (
                  <Link href="/admin/products">
                    <Button size="sm">Открыть каталог →</Button>
                  </Link>
                )}
                <Button size="sm" variant="outline" onClick={onReset}>
                  Новый импорт
                </Button>
              </div>
            </div>
          )}
        </section>

        {/* ══ HINTS ═══════════════════════════════════════════════════════════ */}
        <section className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 text-sm text-gray-600 dark:text-gray-300 space-y-1">
          <p className="font-medium text-gray-900 dark:text-gray-100">Сценарии использования</p>
          <ul className="list-disc list-inside space-y-1 text-sm">
            <li>Первичная загрузка каталога: режим <strong>create</strong></li>
            <li>Массовое обновление цен/остатков: скачайте экспорт, отредактируйте нужные колонки, загрузите в режиме <strong>update</strong></li>
            <li>Синхронизация с прайс-листом поставщика: режим <strong>upsert</strong></li>
          </ul>
        </section>

      </main>
    </AdminGate>
  )
}
