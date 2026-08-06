'use client'

import React, { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

const PREVIEW_SIZE = 240
const OUTPUT_SIZE = 400

type Props = {
  source: string | null
  onCancel: () => void
  onApply: (dataUrl: string) => void
  labels: { title: string; zoom: string; reset: string; cancel: string; apply: string }
}

export function AvatarCropDialog({ source, onCancel, onApply, labels }: Props): React.ReactElement {
  const [imageSize, setImageSize] = useState({ width: 1, height: 1 })
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const drag = useRef<{ x: number; y: number; offsetX: number; offsetY: number } | null>(null)

  useEffect(() => {
    if (!source) return
    const image = new window.Image()
    image.onload = () => {
      setImageSize({ width: image.naturalWidth, height: image.naturalHeight })
      setZoom(1)
      setOffset({ x: 0, y: 0 })
    }
    image.src = source
  }, [source])

  const baseScale = Math.max(PREVIEW_SIZE / imageSize.width, PREVIEW_SIZE / imageSize.height)
  const renderedWidth = imageSize.width * baseScale * zoom
  const renderedHeight = imageSize.height * baseScale * zoom
  const maxX = Math.max(0, (renderedWidth - PREVIEW_SIZE) / 2)
  const maxY = Math.max(0, (renderedHeight - PREVIEW_SIZE) / 2)
  const clampedOffset = {
    x: Math.max(-maxX, Math.min(maxX, offset.x)),
    y: Math.max(-maxY, Math.min(maxY, offset.y)),
  }

  const apply = () => {
    if (!source) return
    const image = new window.Image()
    image.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = OUTPUT_SIZE
      canvas.height = OUTPUT_SIZE
      const context = canvas.getContext('2d')
      if (!context) return
      const outputScale = OUTPUT_SIZE / PREVIEW_SIZE
      const drawWidth = renderedWidth * outputScale
      const drawHeight = renderedHeight * outputScale
      context.drawImage(
        image,
        (OUTPUT_SIZE - drawWidth) / 2 + clampedOffset.x * outputScale,
        (OUTPUT_SIZE - drawHeight) / 2 + clampedOffset.y * outputScale,
        drawWidth,
        drawHeight,
      )
      onApply(canvas.toDataURL('image/jpeg', 0.82))
    }
    image.src = source
  }

  return (
    <Dialog open={Boolean(source)} onOpenChange={(open) => { if (!open) onCancel() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{labels.title}</DialogTitle></DialogHeader>
        <div className="space-y-5 pt-2">
          <div
            className="mx-auto h-[240px] w-[240px] touch-none cursor-move overflow-hidden rounded-2xl border border-border bg-muted shadow-inner"
            style={{
              backgroundImage: source ? `url(${source})` : undefined,
              backgroundRepeat: 'no-repeat',
              backgroundSize: `${renderedWidth}px ${renderedHeight}px`,
              backgroundPosition: `calc(50% + ${clampedOffset.x}px) calc(50% + ${clampedOffset.y}px)`,
            }}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId)
              drag.current = { x: event.clientX, y: event.clientY, offsetX: clampedOffset.x, offsetY: clampedOffset.y }
            }}
            onPointerMove={(event) => {
              if (!drag.current) return
              setOffset({
                x: drag.current.offsetX + event.clientX - drag.current.x,
                y: drag.current.offsetY + event.clientY - drag.current.y,
              })
            }}
            onPointerUp={() => { drag.current = null }}
            onPointerCancel={() => { drag.current = null }}
          />

          <label className="block space-y-2 text-sm text-muted-foreground">
            <span>{labels.zoom}</span>
            <input
              type="range"
              min="1"
              max="3"
              step="0.01"
              value={zoom}
              onChange={(event) => setZoom(Number(event.target.value))}
              className="w-full accent-primary"
            />
          </label>

          <div className="flex flex-wrap justify-between gap-2">
            <Button type="button" variant="ghost" onClick={() => { setZoom(1); setOffset({ x: 0, y: 0 }) }}>
              {labels.reset}
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onCancel}>{labels.cancel}</Button>
              <Button type="button" onClick={apply}>{labels.apply}</Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
