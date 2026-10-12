'use client'

import React from 'react'
import { Button } from '@/components/ui/button'
import type { GrinsStockPreviewResponse } from '@/app/api/admin/grins-import/stocks-preview/route'
import type { Localize } from './import-config'
import { GrinsStockChanges } from './GrinsStockChanges'

const MAX_BYTES = 20 * 1024 * 1024

function previewError(code: string, l: Localize): string {
  const messages: Record<string, [string, string, string]> = {
    file_required: ['Выберите XML-файл.', 'Choose an XML file.', 'Izvēlieties XML failu.'],
    empty_file: ['Файл пустой.', 'The file is empty.', 'Fails ir tukšs.'],
    file_too_large: ['Файл больше 20 МБ.', 'The file is larger than 20 MB.', 'Fails ir lielāks par 20 MB.'],
    not_xml_file: ['Нужен файл .xml.', 'An .xml file is required.', 'Nepieciešams .xml fails.'],
    invalid_encoding: ['Файл должен быть в UTF-8.', 'The file must use UTF-8.', 'Failam jābūt UTF-8 kodējumā.'],
    forbidden_xml_construct: ['XML содержит запрещённый DOCTYPE/ENTITY.', 'XML contains a forbidden DOCTYPE/ENTITY.', 'XML satur aizliegtu DOCTYPE/ENTITY.'],
    unauthorized: ['Сессия истекла. Войдите снова.', 'Session expired. Sign in again.', 'Sesija beigusies. Piesakieties vēlreiz.'],
    forbidden: ['Недостаточно прав для диагностики GrinS.', 'Insufficient permission for GrinS diagnostics.', 'Nepietiek tiesību GrinS diagnostikai.'],
    preview_failed: ['Не удалось проверить файл.', 'The file could not be checked.', 'Failu neizdevās pārbaudīt.'],
  }
  return messages[code] ? l(...messages[code]) : `${l('Ошибка', 'Error', 'Kļūda')}: ${code}`
}

export function GrinsStockPreviewSection({ l }: { l: Localize }): React.ReactElement {
  const fileRef = React.useRef<HTMLInputElement>(null)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [preview, setPreview] = React.useState<GrinsStockPreviewResponse | null>(null)

  const reset = () => {
    setPreview(null)
    setError(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  const onPreview = async () => {
    const file = fileRef.current?.files?.[0]
    setError(null)
    setPreview(null)
    if (!file) { setError(previewError('file_required', l)); return }
    if (file.size > MAX_BYTES) { setError(previewError('file_too_large', l)); return }
    setBusy(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const response = await fetch('/api/admin/grins-import/stocks-preview', { method: 'POST', body: form })
      const data = (await response.json()) as GrinsStockPreviewResponse & { error?: string }
      if (!response.ok) setError(previewError(data.error ?? 'preview_failed', l))
      else setPreview(data)
    } catch {
      setError(previewError('preview_failed', l))
    } finally {
      setBusy(false)
    }
  }

  const s = preview?.summary
  const stat = (label: string, value: number, warning = false) => (
    <div className={`rounded-md border px-3 py-2 ${warning && value > 0 ? 'border-amber-300 bg-amber-50 dark:bg-amber-950/30' : 'border-border'}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{value.toLocaleString()}</div>
    </div>
  )

  return (
    <section className="rounded-lg border border-border bg-card p-5 space-y-5">
      <div>
        <h2 className="text-base font-semibold text-foreground">
          {l('Диагностика остатков GrinS (только Preview)', 'GrinS stock diagnostics (Preview only)', 'GrinS atlikumu diagnostika (tikai Preview)')}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {l(
            'Сопоставление выполняется только по точному externalId. Preview читает Product.stock и ничего не записывает.',
            'Products are matched only by exact externalId. Preview reads Product.stock and writes nothing.',
            'Produkti tiek salīdzināti tikai pēc precīza externalId. Preview nolasa Product.stock un neko neieraksta.',
          )}
        </p>
      </div>

      <div role="note" className="rounded-md border border-amber-400 bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
        <strong>{l('Важно:', 'Important:', 'Svarīgi:')}</strong>{' '}
        {l(
          'входящий остаток GrinS пока не подтверждён как доступный для продажи. Это только диагностическое сравнение; применение остатков отсутствует.',
          'incoming GrinS stock is not yet confirmed as available-to-sell. This is diagnostic comparison only; stock Apply is not available.',
          'ienākošais GrinS atlikums vēl nav apstiprināts kā pārdošanai pieejams. Šis ir tikai diagnostisks salīdzinājums; atlikumu Apply nav pieejams.',
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input ref={fileRef} type="file" accept=".xml,text/xml,application/xml" className="text-sm" disabled={busy} onChange={() => { setPreview(null); setError(null) }} />
        <Button type="button" onClick={onPreview} disabled={busy}>
          {busy ? l('Проверка…', 'Checking…', 'Pārbauda…') : l('Проверить остатки', 'Check stock', 'Pārbaudīt atlikumus')}
        </Button>
        {preview && <Button type="button" variant="outline" onClick={reset} disabled={busy}>{l('Сбросить', 'Reset', 'Atiestatīt')}</Button>}
      </div>

      {error && <div role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">{error}</div>}

      {preview && s && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-6">
            {stat(l('Записей XML', 'XML rows', 'XML ieraksti'), s.rows)}
            {stat(l('Совпадений', 'Matched', 'Atbilstības'), s.matched)}
            {stat(l('Пропущено', 'Skipped', 'Izlaisti'), s.skipped, true)}
            {stat(l('Изменений', 'Differences', 'Atšķirības'), s.stockChanges)}
            {stat(l('Увеличений', 'Increases', 'Palielinājumi'), s.increases)}
            {stat(l('Уменьшений', 'Decreases', 'Samazinājumi'), s.decreases)}
            {stat(l('Переходов через ноль', 'Zero transitions', 'Nulles pārejas'), s.zeroTransitions, true)}
            {stat(l('В ноль', 'To zero', 'Uz nulli'), s.toZero, true)}
            {stat(l('Из нуля', 'From zero', 'No nulles'), s.fromZero)}
            {stat(l('Расхождений >50%', 'Differences >50%', 'Atšķirības >50%'), s.largeDifferences, true)}
            {stat(l('Без изменений', 'Unchanged', 'Bez izmaiņām'), s.unchanged)}
            {stat(l('Ошибок/конфликтов', 'Errors/conflicts', 'Kļūdas/konflikti'), s.conflicts + s.duplicateSkus + s.invalidValues + s.negativeValues, true)}
          </div>

          {preview.hard.length > 0 && (
            <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950/30 dark:text-red-200">
              <div className="font-semibold">{l('Проверка XML не пройдена', 'XML validation failed', 'XML pārbaude neizdevās')}</div>
              <ul className="mt-1 list-disc pl-5">{preview.hard.map(item => <li key={item}>{item}</li>)}</ul>
            </div>
          )}

          {preview.hard.length === 0 && <GrinsStockChanges changes={preview.changes} l={l} />}
        </div>
      )}
    </section>
  )
}
