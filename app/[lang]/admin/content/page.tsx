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

import { useAdminContentPage } from './useAdminContentPage'

export default function AdminContentPage(): React.ReactElement {
  const pageState = useAdminContentPage()
  const { overrides, resolveImageSrc, setText, setImage, removeText, removeImage, clearAll, language, setLanguage, openSectionId, setOpenSectionId, message, setMessage, saving, setSaving, textKey, setTextKey, textValue, setTextValue, imageFrom, setImageFrom, imageTo, setImageTo, uploadingImage, setUploadingImage, sourcePreviewFailed, setSourcePreviewFailed, targetPreviewFailed, setTargetPreviewFailed, normalizedTextKey, baseTranslation, existingOverride, currentText, nextText, run, onUploadImage } = pageState
return (
    <AdminGate>
      <main className="w-full py-4 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">Управление контентом сайта</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Тексты и картинки сайта по разделам. Изменения применяются сразу, без деплоя.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/admin/content/banners">
              <Button variant="outline">Баннеры и блоки</Button>
            </Link>
            <Link href="/admin">
              <Button variant="outline">Назад в админку</Button>
            </Link>
            <Button
              variant="destructive"
              disabled={saving}
              onClick={() => void run(clearAll, 'Все override очищены.', 'Не удалось очистить override.')}
            >
              Сбросить все
            </Button>
          </div>
        </div>

        {message && (
          <div className="rounded-md border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-900/20 dark:text-green-300">
            {message}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {(['ru', 'en', 'lv'] as Language[]).map((lang) => (
            <Button key={lang} variant={language === lang ? 'default' : 'outline'} size="sm" onClick={() => setLanguage(lang)}>
              {lang.toUpperCase()}
            </Button>
          ))}
        </div>

        {/* Registry sections */}
        <section className="space-y-3">
          {CONTENT_REGISTRY.map((section) => {
            const isOpen = openSectionId === section.id
            const changedCount = section.entries.filter((entry) =>
              entry.type === 'text'
                ? overrides.text[language]?.[entry.key] !== undefined
                : overrides.images[entry.src] !== undefined
            ).length

            return (
              <div key={section.id} className="rounded-lg border border-border bg-card">
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-4 py-3 text-left"
                  aria-expanded={isOpen}
                  onClick={() => setOpenSectionId(isOpen ? null : section.id)}
                >
                  <span className="font-semibold text-foreground">{section.title}</span>
                  {changedCount > 0 && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                      {changedCount} изм.
                    </span>
                  )}
                  <ChevronDown className={`ml-auto h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>

                {isOpen && (
                  <div className="grid grid-cols-1 gap-3 border-t border-border p-4 lg:grid-cols-2">
                    {section.entries.map((entry) =>
                      entry.type === 'text' ? (
                        <TextEntryRow
                          key={`${language}-${entry.key}`}
                          entry={entry}
                          overrideValue={overrides.text[language]?.[entry.key]}
                          baseValue={translations[language][entry.key]}
                          onSave={(value) =>
                            run(() => setText(language, entry.key, value), 'Текст сохранен.', 'Не удалось сохранить текст.')
                          }
                          onReset={() =>
                            run(() => removeText(language, entry.key), 'Override удален.', 'Не удалось удалить override.')
                          }
                        />
                      ) : (
                        <ImageEntryRow
                          key={entry.src}
                          entry={entry}
                          overridden={overrides.images[entry.src] !== undefined}
                          resolvedSrc={resolveImageSrc(entry.src)}
                          onUploadAndSet={async (file) => {
                            await run(
                              async () => {
                                const path = await uploadImageFile(file)
                                await setImage(entry.src, path)
                              },
                              'Картинка заменена.',
                              'Не удалось заменить картинку.'
                            )
                          }}
                          onReset={() =>
                            run(() => removeImage(entry.src), 'Override удален.', 'Не удалось удалить override.')
                          }
                        />
                      )
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </section>

        {/* Expert mode: free-form editors + active override lists (logic unchanged) */}
        <details className="rounded-lg border border-border bg-card">
          <summary className="cursor-pointer px-4 py-3 font-semibold text-foreground">
            Экспертный режим (произвольные ключи и пути)
          </summary>
          <div className="space-y-4 border-t border-border p-4">
            <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="rounded-lg border border-border bg-card p-4 space-y-3">
                <h2 className="text-lg font-semibold text-foreground">Тексты</h2>
                <p className="text-sm text-muted-foreground">
                  Редактируйте тексты по ключам переводов (например: hero.title, newsletter.title).
                </p>

                <Input value={textKey} onChange={(e) => setTextKey(e.target.value)} placeholder="Ключ текста, например hero.title" />
                <Textarea value={textValue} onChange={(e) => setTextValue(e.target.value)} placeholder="Новое значение текста" className="min-h-[120px]" />

                {(normalizedTextKey || textValue.trim()) && (
                  <div className="space-y-2 rounded-md border border-border p-3">
                    <p className="text-xs text-muted-foreground">Сравнение текста до сохранения:</p>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-gray-700 dark:text-gray-200">Было (Текущее на сайте)</p>
                        <div className="min-h-[96px] rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 whitespace-pre-wrap">
                          {currentText || 'Значение для этого ключа пока не найдено.'}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <p className="text-xs font-medium text-gray-700 dark:text-gray-200">Стало (После сохранения)</p>
                        <div className="min-h-[96px] rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 whitespace-pre-wrap">
                          {nextText || 'Пусто. Если сохранить, override будет удален.'}
                        </div>
                      </div>
                    </div>

                    {normalizedTextKey && !baseTranslation && (
                      <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
                        В базовом словаре переводов ключ не найден. Будет создан только override.
                      </div>
                    )}
                  </div>
                )}

                <Button
                  onClick={() => {
                    if (!textKey.trim()) return
                    void run(() => setText(language, textKey, textValue), 'Текст сохранен.', 'Не удалось сохранить текст.')
                  }}
                  disabled={saving}
                >
                  Сохранить текст
                </Button>
              </div>

              <div className="rounded-lg border border-border bg-card p-4 space-y-3">
                <h2 className="text-lg font-semibold text-foreground">Картинки</h2>
                <p className="text-sm text-muted-foreground">
                  Заменяйте изображения, подменяя исходный src на новый путь или URL.
                </p>

                <Input
                  value={imageFrom}
                  onChange={(e) => {
                    setImageFrom(e.target.value)
                    setSourcePreviewFailed(false)
                  }}
                  placeholder="Исходный src, например /icons/originals.svg"
                />
                <Input
                  value={imageTo}
                  onChange={(e) => {
                    setImageTo(e.target.value)
                    setTargetPreviewFailed(false)
                  }}
                  placeholder="Новый src, например /api/media/new-icon.png"
                />

                {(imageFrom.trim() || imageTo.trim()) && (
                  <div className="space-y-2 rounded-md border border-border p-3">
                    <p className="text-xs text-muted-foreground">Сравнение изображений до сохранения:</p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-gray-700 dark:text-gray-200">Было (Исходный src)</p>
                        {imageFrom.trim() ? (
                          !sourcePreviewFailed ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={imageFrom}
                              alt="Исходное изображение"
                              className="h-36 w-full rounded-md border border-border object-contain bg-muted"
                              onLoad={() => setSourcePreviewFailed(false)}
                              onError={() => setSourcePreviewFailed(true)}
                            />
                          ) : (
                            <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
                              Не удалось загрузить исходное изображение.
                            </div>
                          )
                        ) : (
                          <div className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
                            Укажите исходный src для превью.
                          </div>
                        )}
                      </div>

                      <div className="space-y-2">
                        <p className="text-xs font-medium text-gray-700 dark:text-gray-200">Стало (Новый src)</p>
                        {imageTo.trim() ? (
                          !targetPreviewFailed ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={imageTo}
                              alt="Новое изображение"
                              className="h-36 w-full rounded-md border border-border object-contain bg-muted"
                              onLoad={() => setTargetPreviewFailed(false)}
                              onError={() => setTargetPreviewFailed(true)}
                            />
                          ) : (
                            <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
                              Не удалось загрузить новое изображение.
                            </div>
                          )
                        ) : (
                          <div className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
                            Укажите новый src для превью.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                <div className="space-y-2 rounded-md border border-dashed border-border p-3">
                  <p className="text-xs text-muted-foreground">Или загрузите новый файл изображения (до 10MB):</p>
                  <Input type="file" accept="image/*" disabled={uploadingImage || saving} onChange={(e) => void onUploadImage(e)} />
                </div>
                <Button
                  onClick={() => {
                    if (!imageFrom.trim()) return
                    void run(() => setImage(imageFrom, imageTo), 'Переопределение картинки сохранено.', 'Не удалось сохранить переопределение картинки.')
                  }}
                  disabled={saving}
                >
                  Сохранить картинку
                </Button>
              </div>
            </section>

            <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="rounded-lg border border-border bg-card p-4">
                <h3 className="font-semibold mb-3 text-foreground">Текущие text override ({language.toUpperCase()})</h3>
                <div className="space-y-2 max-h-[380px] overflow-auto pr-1">
                  {Object.entries(overrides.text[language] ?? {}).map(([key, value]) => (
                    <div key={key} className="rounded border border-border p-2">
                      <p className="text-xs text-muted-foreground">{key}</p>
                      <p className="text-sm text-foreground whitespace-pre-wrap">{value}</p>
                      <div className="mt-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={saving}
                          onClick={() => void run(() => removeText(language, key), 'Текстовый override удален.', 'Не удалось удалить text override.')}
                        >
                          Удалить
                        </Button>
                      </div>
                    </div>
                  ))}
                  {Object.keys(overrides.text[language] ?? {}).length === 0 && (
                    <p className="text-sm text-muted-foreground">Пока нет override для этого языка.</p>
                  )}
                </div>
              </div>

              <div className="rounded-lg border border-border bg-card p-4">
                <h3 className="font-semibold mb-3 text-foreground">Текущие image override</h3>
                <div className="space-y-2 max-h-[380px] overflow-auto pr-1">
                  {Object.entries(overrides.images).map(([from, to]) => (
                    <div key={from} className="rounded border border-border p-2">
                      <p className="text-xs text-muted-foreground">{from}</p>
                      <p className="text-sm text-foreground break-all">{to}</p>
                      <div className="mt-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={saving}
                          onClick={() => void run(() => removeImage(from), 'Переопределение картинки удалено.', 'Не удалось удалить image override.')}
                        >
                          Удалить
                        </Button>
                      </div>
                    </div>
                  ))}
                  {Object.keys(overrides.images).length === 0 && (
                    <p className="text-sm text-muted-foreground">Пока нет image override.</p>
                  )}
                </div>
              </div>
            </section>
          </div>
        </details>
      </main>
    </AdminGate>
  )
}
