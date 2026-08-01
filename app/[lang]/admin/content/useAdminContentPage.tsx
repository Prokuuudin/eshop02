'use client'

import React from 'react'
import Link from 'next/link'
import { ChevronDown } from 'lucide-react'
import { useSiteContent } from '@/lib/use-site-content'
import { translations } from '@/data/translations'
import { CONTENT_REGISTRY, type ContentEntry } from '@/lib/content-registry'
import AdminGate from '@/components/admin/AdminGate'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

type Language = 'ru' | 'en' | 'lv'

async function uploadImageFile(file: File): Promise<string> {
  const formData = new FormData()
  formData.append('file', file)
  const response = await fetch('/api/admin/content/upload', { method: 'POST', body: formData })
  if (!response.ok) throw new Error('failed_to_upload_image')
  const data = (await response.json()) as { path?: string }
  if (!data.path) throw new Error('invalid_upload_response')
  return data.path
}

function ChangedBadge() {
  return (
    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
      изменено
    </span>
  )
}

function TextEntryRow({
  entry,
  overrideValue,
  baseValue,
  onSave,
  onReset,
}: {
  entry: Extract<ContentEntry, { type: 'text' }>
  overrideValue: string | undefined
  baseValue: string | undefined
  onSave: (value: string) => Promise<void>
  onReset: () => Promise<void>
}) {
  const currentValue = overrideValue ?? baseValue ?? ''
  const [value, setValue] = React.useState(currentValue)
  const [busy, setBusy] = React.useState(false)
  const dirty = value !== currentValue

  // Language switches remount rows via key={...} in the parent. This effect covers the
  // remaining path: a global «Сбросить все» clears the override without remounting the row,
  // and the stale local value would otherwise re-enable «Сохранить» with the cleared text.
  React.useEffect(() => {
    queueMicrotask(() => setValue(currentValue))
  }, [currentValue])

  const save = async () => {
    setBusy(true)
    try {
      await onSave(value)
    } finally {
      setBusy(false)
    }
  }

  const reset = async () => {
    setBusy(true)
    try {
      await onReset()
      setValue(baseValue ?? '')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-md border border-border p-3 space-y-2">
      <div className="flex items-center gap-2">
        <p className="text-sm font-medium text-foreground">{entry.label}</p>
        {overrideValue !== undefined && <ChangedBadge />}
        <code className="ml-auto text-[10px] text-muted-foreground">{entry.key}</code>
      </div>
      {entry.multiline ? (
        <Textarea value={value} onChange={(e) => setValue(e.target.value)} className="min-h-[96px]" />
      ) : (
        <Input value={value} onChange={(e) => setValue(e.target.value)} />
      )}
      <div className="flex gap-2">
        <Button size="sm" onClick={() => void save()} disabled={busy || !dirty}>
          Сохранить
        </Button>
        {overrideValue !== undefined && (
          <Button size="sm" variant="outline" onClick={() => void reset()} disabled={busy}>
            Сбросить к базовому
          </Button>
        )}
      </div>
    </div>
  )
}

function ImageEntryRow({
  entry,
  overridden,
  resolvedSrc,
  onUploadAndSet,
  onReset,
}: {
  entry: Extract<ContentEntry, { type: 'image' }>
  overridden: boolean
  resolvedSrc: string
  onUploadAndSet: (file: File) => Promise<void>
  onReset: () => Promise<void>
}) {
  const [busy, setBusy] = React.useState(false)

  const onFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    setBusy(true)
    try {
      await onUploadAndSet(file)
    } finally {
      setBusy(false)
      event.target.value = ''
    }
  }

  return (
    <div className="rounded-md border border-border p-3 space-y-2">
      <div className="flex items-center gap-2">
        <p className="text-sm font-medium text-foreground">{entry.label}</p>
        {overridden && <ChangedBadge />}
        <code className="ml-auto text-[10px] text-muted-foreground">{entry.src}</code>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={resolvedSrc}
        alt={entry.label}
        className="h-28 w-full rounded-md border border-border object-contain bg-muted"
      />
      <div className="flex flex-wrap items-center gap-2">
        <Input type="file" accept="image/*" disabled={busy} onChange={(e) => void onFileChange(e)} className="max-w-xs" />
        {overridden && (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => { setBusy(true); void onReset().finally(() => setBusy(false)) }}>
            Сбросить
          </Button>
        )}
      </div>
    </div>
  )
}

export function useAdminContentPage() {
  const { overrides, resolveImageSrc, setText, setImage, removeText, removeImage, clearAll } = useSiteContent()

  const [language, setLanguage] = React.useState<Language>('ru')
  const [openSectionId, setOpenSectionId] = React.useState<string | null>(CONTENT_REGISTRY[0]?.id ?? null)
  const [message, setMessage] = React.useState('')
  const [saving, setSaving] = React.useState(false)

  // Expert mode state (free-form editors, unchanged logic from the previous page version)
  const [textKey, setTextKey] = React.useState('')
  const [textValue, setTextValue] = React.useState('')
  const [imageFrom, setImageFrom] = React.useState('')
  const [imageTo, setImageTo] = React.useState('')
  const [uploadingImage, setUploadingImage] = React.useState(false)
  const [sourcePreviewFailed, setSourcePreviewFailed] = React.useState(false)
  const [targetPreviewFailed, setTargetPreviewFailed] = React.useState(false)

  const normalizedTextKey = textKey.trim()
  const baseTranslation = normalizedTextKey ? translations[language][normalizedTextKey] : undefined
  const existingOverride = normalizedTextKey ? overrides.text[language]?.[normalizedTextKey] : undefined
  const currentText = existingOverride ?? baseTranslation
  const nextText = textValue.trim() ? textValue : baseTranslation

  const run = async (action: () => Promise<void>, ok: string, fail: string) => {
    setSaving(true)
    try {
      await action()
      setMessage(ok)
    } catch {
      setMessage(fail)
    } finally {
      setSaving(false)
    }
  }

  const onUploadImage = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    setUploadingImage(true)
    try {
      const path = await uploadImageFile(file)
      setImageTo(path)
      setTargetPreviewFailed(false)
      setMessage('Файл загружен. Новый путь подставлен в поле "Новый src".')
    } catch {
      setMessage('Не удалось загрузить файл.')
    } finally {
      setUploadingImage(false)
      event.target.value = ''
    }
  }

    return { overrides, resolveImageSrc, setText, setImage, removeText, removeImage, clearAll, language, setLanguage, openSectionId, setOpenSectionId, message, setMessage, saving, setSaving, textKey, setTextKey, textValue, setTextValue, imageFrom, setImageFrom, imageTo, setImageTo, uploadingImage, setUploadingImage, sourcePreviewFailed, setSourcePreviewFailed, targetPreviewFailed, setTargetPreviewFailed, normalizedTextKey, baseTranslation, existingOverride, currentText, nextText, run, onUploadImage }
}
