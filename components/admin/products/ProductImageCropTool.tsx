'use client'

import { useState } from 'react'
import { useFormContext } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import type { AddProductFormValues } from './productFormSchema'
import { useAdminLocale } from '@/lib/use-admin-locale'

type Preview = {
  skipped: boolean
  reason?: string
  originalUrl: string
  preview: string
  sourceSize: { width: number; height: number }
  crop?: { width: number; height: number }
}

type CropResponse = Preview | { image: string; images: string[] }
type ApiEnvelope = { data?: CropResponse; error?: string }

function isPreview(value: CropResponse | undefined): value is Preview {
  return Boolean(
    value && 'preview' in value && typeof value.preview === 'string' &&
    value.sourceSize && typeof value.sourceSize.width === 'number' &&
    typeof value.sourceSize.height === 'number',
  )
}

export default function ProductImageCropTool({ productId }: { productId: string }): React.ReactElement {
  const { setValue } = useFormContext<AddProductFormValues>()
  const { l } = useAdminLocale()
  const [preview, setPreview] = useState<Preview | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<'preview' | 'apply' | null>(null)

  const request = async (action: 'preview' | 'apply') => {
    setError('')
    setBusy(action)
    try {
      const response = await fetch('/api/admin/products/image-crop', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, action }),
      })
      const body = await response.json().catch(() => ({})) as ApiEnvelope
      if (!response.ok) throw new Error(body.error ?? l('Не удалось обработать изображение', 'Failed to process the image', 'Neizdevās apstrādāt attēlu'))
      const data = body.data
      if (action === 'preview') {
        if (!isPreview(data)) throw new Error(l('Сервер вернул неполные данные превью', 'The server returned incomplete preview data', 'Serveris atgrieza nepilnīgus priekšskatījuma datus'))
        setPreview(data)
      }
      else {
        if (!data || !('image' in data) || typeof data.image !== 'string' || !Array.isArray(data.images)) {
          throw new Error(l('Сервер вернул неполные данные изображения', 'The server returned incomplete image data', 'Serveris atgrieza nepilnīgus attēla datus'))
        }
        setValue('image', data.image, { shouldDirty: true })
        setValue('images', data.images, { shouldDirty: true })
        setPreview(null)
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : l('Не удалось обработать изображение', 'Failed to process the image', 'Neizdevās apstrādāt attēlu'))
    } finally { setBusy(null) }
  }

  return (
    <div className="mt-4 rounded-lg border border-border bg-muted/30 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">{l('Исправление размера изображения', 'Image size correction', 'Attēla izmēra labošana')}</p>
          <p className="mt-1 text-xs text-muted-foreground">{l('Удаляет лишние белые или прозрачные поля. Сначала обязательно проверьте превью.', 'Removes excess white or transparent margins. Always check the preview first.', 'Noņem liekās baltās vai caurspīdīgās malas. Vispirms noteikti pārbaudiet priekšskatījumu.')}</p>
        </div>
        <Button type="button" variant="outline" size="sm" disabled={busy !== null} onClick={() => void request('preview')}>
          {busy === 'preview' ? l('Анализирую…', 'Analyzing…', 'Analizē…') : l('Создать превью', 'Create preview', 'Izveidot priekšskatījumu')}
        </Button>
      </div>
      {preview && (
        <div className="mt-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <figure className="rounded border bg-white p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview.originalUrl} alt={l('Исходное изображение', 'Source image', 'Sākotnējais attēls')} className="mx-auto h-64 w-full object-contain" />
              <figcaption className="mt-2 text-center text-xs text-muted-foreground">{l('Оригинал', 'Original', 'Oriģināls')} · {preview.sourceSize.width}×{preview.sourceSize.height}</figcaption>
            </figure>
            <figure className="rounded border bg-white p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview.preview} alt={l('Превью после обработки', 'Processed preview', 'Priekšskatījums pēc apstrādes')} className="mx-auto h-64 w-full object-contain" />
              <figcaption className="mt-2 text-center text-xs text-muted-foreground">
                {l('Результат', 'Result', 'Rezultāts')}{preview.crop ? ` · ${preview.crop.width}×${preview.crop.height}` : ''}
              </figcaption>
            </figure>
          </div>
          {preview.skipped ? (
            <p className="text-sm text-muted-foreground">{l('Изменение не требуется', 'No change required', 'Izmaiņas nav nepieciešamas')}: {preview.reason}</p>
          ) : (
            <div className="flex items-center gap-3">
              <Button type="button" size="sm" disabled={busy !== null} onClick={() => void request('apply')}>
                {busy === 'apply' ? l('Применяю…', 'Applying…', 'Lieto…') : l('Применить исправление', 'Apply correction', 'Lietot labojumu')}
              </Button>
              <Button type="button" variant="ghost" size="sm" disabled={busy !== null} onClick={() => setPreview(null)}>{l('Отмена', 'Cancel', 'Atcelt')}</Button>
            </div>
          )}
        </div>
      )}
      {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
    </div>
  )
}
