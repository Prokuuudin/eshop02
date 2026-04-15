'use client'

import React from 'react'
import Link from 'next/link'
import { useTranslation } from '@/lib/use-translation'
import { useSiteContent } from '@/lib/use-site-content'
import { translations } from '@/data/translations'
import AdminGate from '@/components/admin/AdminGate'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

type Language = 'ru' | 'en' | 'lv'

const COMMON_TEXT_KEYS = [
  'hero.title',
  'hero.subtitle',
  'hero.ctaPrimary',
  'hero.ctaSecondary',
  'newsletter.title',
  'newsletter.subtitle',
  'footer.about',
  'contact.title'
]

const COMMON_IMAGE_PATHS = [
  '/hero/hero-main.webp',
  '/icons/original.svg',
  '/icons/delivery.svg',
  '/icons/quality.svg',
  '/icons/support.svg'
]

export default function AdminContentPage() {
  const { t } = useTranslation()
  const { overrides, setText, setImage, removeText, removeImage, clearAll } = useSiteContent()

  const [language, setLanguage] = React.useState<Language>('ru')
  const [textKey, setTextKey] = React.useState('')
  const [textValue, setTextValue] = React.useState('')
  const [imageFrom, setImageFrom] = React.useState('')
  const [imageTo, setImageTo] = React.useState('')
  const [uploadingImage, setUploadingImage] = React.useState(false)
  const [sourcePreviewFailed, setSourcePreviewFailed] = React.useState(false)
  const [targetPreviewFailed, setTargetPreviewFailed] = React.useState(false)

  const [message, setMessage] = React.useState<string>('')
  const [saving, setSaving] = React.useState(false)

  const normalizedTextKey = textKey.trim()
  const baseTranslation = normalizedTextKey ? translations[language][normalizedTextKey] : undefined
  const existingOverride = normalizedTextKey ? overrides.text[language]?.[normalizedTextKey] : undefined
  const currentText = existingOverride ?? baseTranslation
  const nextText = textValue.trim() ? textValue : baseTranslation

  React.useEffect(() => {
    setSourcePreviewFailed(false)
  }, [imageFrom])

  React.useEffect(() => {
    setTargetPreviewFailed(false)
  }, [imageTo])

  const onSaveText = async () => {
    if (!textKey.trim()) return
    setSaving(true)
    try {
      await setText(language, textKey, textValue)
      setMessage('Текст сохранен.')
    } catch {
      setMessage('Не удалось сохранить текст.')
    } finally {
      setSaving(false)
    }
  }

  const onSaveImage = async () => {
    if (!imageFrom.trim()) return
    setSaving(true)
    try {
      await setImage(imageFrom, imageTo)
      setMessage('Переопределение картинки сохранено.')
    } catch {
      setMessage('Не удалось сохранить переопределение картинки.')
    } finally {
      setSaving(false)
    }
  }

  const onUploadImage = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setUploadingImage(true)
    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch('/api/admin/content/upload', {
        method: 'POST',
        body: formData
      })

      if (!response.ok) {
        throw new Error('failed_to_upload_image')
      }

      const data = (await response.json()) as { path?: string }
      if (!data.path) {
        throw new Error('invalid_upload_response')
      }

      setImageTo(data.path)
      setMessage('Файл загружен. Новый путь подставлен в поле "Новый src".')
    } catch {
      setMessage('Не удалось загрузить файл.')
    } finally {
      setUploadingImage(false)
      event.target.value = ''
    }
  }

  const onRemoveText = async (key: string) => {
    setSaving(true)
    try {
      await removeText(language, key)
      setMessage('Текстовый override удален.')
    } catch {
      setMessage('Не удалось удалить text override.')
    } finally {
      setSaving(false)
    }
  }

  const onRemoveImage = async (source: string) => {
    setSaving(true)
    try {
      await removeImage(source)
      setMessage('Переопределение картинки удалено.')
    } catch {
      setMessage('Не удалось удалить image override.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <AdminGate>
      <main className="max-w-6xl mx-auto p-4 md:p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-gray-100">Управление контентом сайта</h1>
          <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
            Меняйте тексты и изображения без правки кода. Изменения применяются сразу на клиенте.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/admin">
            <Button variant="outline">Назад в админку</Button>
          </Link>
          <Button
            variant="destructive"
            onClick={async () => {
              setSaving(true)
              try {
                await clearAll()
                setMessage('Все override очищены.')
              } catch {
                setMessage('Не удалось очистить override.')
              } finally {
                setSaving(false)
              }
            }}
            disabled={saving}
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

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 space-y-3">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Тексты</h2>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Редактируйте тексты по ключам переводов (например: hero.title, newsletter.title).
          </p>

          <div className="flex flex-wrap gap-2">
            {(['ru', 'en', 'lv'] as Language[]).map((lang) => (
              <Button
                key={lang}
                variant={language === lang ? 'default' : 'outline'}
                size="sm"
                onClick={() => setLanguage(lang)}
              >
                {lang.toUpperCase()}
              </Button>
            ))}
          </div>

          <Input value={textKey} onChange={(e) => setTextKey(e.target.value)} placeholder="Ключ текста, например hero.title" />
          <Textarea value={textValue} onChange={(e) => setTextValue(e.target.value)} placeholder="Новое значение текста" className="min-h-[120px]" />

          {(normalizedTextKey || textValue.trim()) && (
            <div className="space-y-2 rounded-md border border-gray-200 dark:border-gray-700 p-3">
              <p className="text-xs text-gray-500 dark:text-gray-400">Сравнение текста до сохранения:</p>

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

          <Button onClick={onSaveText} disabled={saving}>Сохранить текст</Button>

          <div className="pt-2">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Популярные ключи:</p>
            <div className="flex flex-wrap gap-2">
              {COMMON_TEXT_KEYS.map((key) => (
                <button
                  key={key}
                  type="button"
                  className="text-xs rounded border border-gray-300 dark:border-gray-700 px-2 py-1 hover:bg-gray-50 dark:hover:bg-gray-800"
                  onClick={() => setTextKey(key)}
                >
                  {key}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 space-y-3">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Картинки</h2>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Заменяйте любые изображения, подменяя исходный src на новый путь или URL.
          </p>

          <Input value={imageFrom} onChange={(e) => setImageFrom(e.target.value)} placeholder="Исходный src, например /icons/original.svg" />
          <Input value={imageTo} onChange={(e) => setImageTo(e.target.value)} placeholder="Новый src, например /uploads/new-icon.svg" />

          {(imageFrom.trim() || imageTo.trim()) && (
            <div className="space-y-2 rounded-md border border-gray-200 dark:border-gray-700 p-3">
              <p className="text-xs text-gray-500 dark:text-gray-400">Сравнение изображений до сохранения:</p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <p className="text-xs font-medium text-gray-700 dark:text-gray-200">Было (Исходный src)</p>
                  {imageFrom.trim() ? (
                    !sourcePreviewFailed ? (
                      <img
                        src={imageFrom}
                        alt="Исходное изображение"
                        className="h-36 w-full rounded-md border border-gray-200 dark:border-gray-700 object-contain bg-gray-50 dark:bg-gray-800"
                        onLoad={() => setSourcePreviewFailed(false)}
                        onError={() => setSourcePreviewFailed(true)}
                      />
                    ) : (
                      <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
                        Не удалось загрузить исходное изображение.
                      </div>
                    )
                  ) : (
                    <div className="rounded-md border border-dashed border-gray-300 dark:border-gray-700 px-3 py-2 text-xs text-gray-500 dark:text-gray-400">
                      Укажите исходный src для превью.
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-medium text-gray-700 dark:text-gray-200">Стало (Новый src)</p>
                  {imageTo.trim() ? (
                    !targetPreviewFailed ? (
                      <img
                        src={imageTo}
                        alt="Новое изображение"
                        className="h-36 w-full rounded-md border border-gray-200 dark:border-gray-700 object-contain bg-gray-50 dark:bg-gray-800"
                        onLoad={() => setTargetPreviewFailed(false)}
                        onError={() => setTargetPreviewFailed(true)}
                      />
                    ) : (
                      <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
                        Не удалось загрузить новое изображение.
                      </div>
                    )
                  ) : (
                    <div className="rounded-md border border-dashed border-gray-300 dark:border-gray-700 px-3 py-2 text-xs text-gray-500 dark:text-gray-400">
                      Укажите новый src для превью.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="space-y-2 rounded-md border border-dashed border-gray-300 dark:border-gray-700 p-3">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Или загрузите новый файл изображения (до 10MB):
            </p>
            <Input
              type="file"
              accept="image/*"
              disabled={uploadingImage || saving}
              onChange={onUploadImage}
            />
          </div>
          <Button onClick={onSaveImage} disabled={saving}>Сохранить картинку</Button>

          <div className="pt-2">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Популярные пути:</p>
            <div className="flex flex-wrap gap-2">
              {COMMON_IMAGE_PATHS.map((path) => (
                <button
                  key={path}
                  type="button"
                  className="text-xs rounded border border-gray-300 dark:border-gray-700 px-2 py-1 hover:bg-gray-50 dark:hover:bg-gray-800"
                  onClick={() => setImageFrom(path)}
                >
                  {path}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
          <h3 className="font-semibold mb-3 text-gray-900 dark:text-gray-100">Текущие text override ({language.toUpperCase()})</h3>
          <div className="space-y-2 max-h-[380px] overflow-auto pr-1">
            {Object.entries(overrides.text[language] ?? {}).map(([key, value]) => (
              <div key={key} className="rounded border border-gray-200 dark:border-gray-700 p-2">
                <p className="text-xs text-gray-500 dark:text-gray-400">{key}</p>
                <p className="text-sm text-gray-900 dark:text-gray-100 whitespace-pre-wrap">{value}</p>
                <div className="mt-2">
                  <Button variant="outline" size="sm" disabled={saving} onClick={() => void onRemoveText(key)}>
                    Удалить
                  </Button>
                </div>
              </div>
            ))}
            {Object.keys(overrides.text[language] ?? {}).length === 0 && (
              <p className="text-sm text-gray-500 dark:text-gray-400">Пока нет override для этого языка.</p>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
          <h3 className="font-semibold mb-3 text-gray-900 dark:text-gray-100">Текущие image override</h3>
          <div className="space-y-2 max-h-[380px] overflow-auto pr-1">
            {Object.entries(overrides.images).map(([from, to]) => (
              <div key={from} className="rounded border border-gray-200 dark:border-gray-700 p-2">
                <p className="text-xs text-gray-500 dark:text-gray-400">{from}</p>
                <p className="text-sm text-gray-900 dark:text-gray-100 break-all">{to}</p>
                <div className="mt-2">
                  <Button variant="outline" size="sm" disabled={saving} onClick={() => void onRemoveImage(from)}>
                    Удалить
                  </Button>
                </div>
              </div>
            ))}
            {Object.keys(overrides.images).length === 0 && (
              <p className="text-sm text-gray-500 dark:text-gray-400">Пока нет image override.</p>
            )}
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 text-sm text-gray-600 dark:text-gray-300">
        <p>
          Подсказка: сначала загрузите файл в блоке "Картинки", затем сохраните замену src. Можно также указывать уже существующие пути в public и внешние URL.
        </p>
        <p className="mt-2">{t('admin.dashboard')} → /admin/content</p>
      </section>
      </main>
    </AdminGate>
  )
}
