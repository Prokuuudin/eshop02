'use client'

import { useState } from 'react'
import { useFormContext } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import type { AddProductFormValues } from './productFormSchema'

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
      if (!response.ok) throw new Error(body.error ?? 'Не удалось обработать изображение')
      const data = body.data
      if (action === 'preview') {
        if (!isPreview(data)) throw new Error('Сервер вернул неполные данные превью')
        setPreview(data)
      }
      else {
        if (!data || !('image' in data) || typeof data.image !== 'string' || !Array.isArray(data.images)) {
          throw new Error('Сервер вернул неполные данные изображения')
        }
        setValue('image', data.image, { shouldDirty: true })
        setValue('images', data.images, { shouldDirty: true })
        setPreview(null)
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось обработать изображение')
    } finally { setBusy(null) }
  }

  return (
    <div className="mt-4 rounded-lg border border-border bg-muted/30 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Исправление размера изображения</p>
          <p className="mt-1 text-xs text-muted-foreground">Удаляет лишние белые или прозрачные поля. Сначала обязательно проверьте превью.</p>
        </div>
        <Button type="button" variant="outline" size="sm" disabled={busy !== null} onClick={() => void request('preview')}>
          {busy === 'preview' ? 'Анализирую…' : 'Создать превью'}
        </Button>
      </div>
      {preview && (
        <div className="mt-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <figure className="rounded border bg-white p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview.originalUrl} alt="Исходное изображение" className="mx-auto h-64 w-full object-contain" />
              <figcaption className="mt-2 text-center text-xs text-muted-foreground">Оригинал · {preview.sourceSize.width}×{preview.sourceSize.height}</figcaption>
            </figure>
            <figure className="rounded border bg-white p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview.preview} alt="Превью после обработки" className="mx-auto h-64 w-full object-contain" />
              <figcaption className="mt-2 text-center text-xs text-muted-foreground">
                Результат{preview.crop ? ` · ${preview.crop.width}×${preview.crop.height}` : ''}
              </figcaption>
            </figure>
          </div>
          {preview.skipped ? (
            <p className="text-sm text-muted-foreground">Изменение не требуется: {preview.reason}</p>
          ) : (
            <div className="flex items-center gap-3">
              <Button type="button" size="sm" disabled={busy !== null} onClick={() => void request('apply')}>
                {busy === 'apply' ? 'Применяю…' : 'Применить исправление'}
              </Button>
              <Button type="button" variant="ghost" size="sm" disabled={busy !== null} onClick={() => setPreview(null)}>Отмена</Button>
            </div>
          )}
        </div>
      )}
      {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
    </div>
  )
}
