import sharp from 'sharp'
import { deriveHiResSrc } from '@/lib/image-hires'

const PADDING_RATIO = 0.06
const MAX_DIMENSION = 1600
const MAX_SOURCE_BYTES = 15 * 1024 * 1024
const MAX_INPUT_PIXELS = 40_000_000

export type CropBox = { left: number; top: number; width: number; height: number }

export type ProductImageCropResult = {
  buffer: Buffer
  skipped: boolean
  reason?: string
  sourceWidth: number
  sourceHeight: number
  crop?: CropBox
  fillRatio?: number
}

function assertAllowedRemoteUrl(rawUrl: string): URL {
  const url = new URL(rawUrl)
  if (url.protocol !== 'https:') throw new Error('Only HTTPS image URLs are allowed')
  const configuredHosts = [process.env.NEXT_PUBLIC_SITE_URL, process.env.VERCEL_URL]
    .filter(Boolean)
    .flatMap((value) => {
      try { return [new URL(value!.startsWith('http') ? value! : `https://${value}`).hostname] }
      catch { return [] }
    })
  const allowedHosts = new Set(['hairshop.lv', 'www.hairshop.lv', ...configuredHosts])
  if (!allowedHosts.has(url.hostname.toLowerCase())) throw new Error('Image host is not allowed for server-side processing')
  return url
}

export async function loadProductImage(
  source: string,
  readMediaAsset: (name: string) => Promise<Buffer | null>,
): Promise<Buffer> {
  if (source.startsWith('/api/media/')) {
    const name = decodeURIComponent(source.slice('/api/media/'.length))
    if (!name || name.includes('/') || name.includes('\\')) throw new Error('Invalid media asset name')
    const data = await readMediaAsset(name)
    if (!data) throw new Error('Media asset not found')
    if (data.length > MAX_SOURCE_BYTES) throw new Error('Image is too large')
    return data
  }
  const sourceUrl = deriveHiResSrc(source) ?? source
  const url = assertAllowedRemoteUrl(sourceUrl)
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(15_000) })
  if (!response.ok) throw new Error(`Image download failed (${response.status})`)
  const length = Number(response.headers.get('content-length') ?? 0)
  if (length > MAX_SOURCE_BYTES) throw new Error('Image is too large')
  const buffer = Buffer.from(await response.arrayBuffer())
  if (buffer.length > MAX_SOURCE_BYTES) throw new Error('Image is too large')
  return buffer
}

async function findContentBox(buffer: Buffer): Promise<{ crop: CropBox | null; width: number; height: number }> {
  const image = sharp(buffer, { limitInputPixels: MAX_INPUT_PIXELS }).ensureAlpha()
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true })
  const { width, height, channels } = info
  let hasRealAlpha = false
  for (let i = 3; i < data.length; i += channels) {
    if (data[i] < 250) { hasRealAlpha = true; break }
  }
  let minX = width, minY = height, maxX = -1, maxY = -1
  if (hasRealAlpha) {
    for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * channels + 3] > 10) {
        minX = Math.min(minX, x); maxX = Math.max(maxX, x)
        minY = Math.min(minY, y); maxY = Math.max(maxY, y)
      }
    }
  } else {
    const pixel = (x: number, y: number) => {
      const i = (y * width + x) * channels
      return [data[i], data[i + 1], data[i + 2]]
    }
    const corners = [pixel(0, 0), pixel(width - 1, 0), pixel(0, height - 1), pixel(width - 1, height - 1)]
    const background = [0, 1, 2].map((channel) => Math.round(corners.reduce((sum, p) => sum + p[channel], 0) / 4))
    for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * channels
      const distance = Math.abs(data[i] - background[0]) + Math.abs(data[i + 1] - background[1]) + Math.abs(data[i + 2] - background[2])
      if (distance > 40) {
        minX = Math.min(minX, x); maxX = Math.max(maxX, x)
        minY = Math.min(minY, y); maxY = Math.max(maxY, y)
      }
    }
  }
  if (maxX < minX || maxY < minY) return { crop: null, width, height }
  const contentWidth = maxX - minX + 1
  const contentHeight = maxY - minY + 1
  const padX = Math.round(contentWidth * PADDING_RATIO)
  const padY = Math.round(contentHeight * PADDING_RATIO)
  const left = Math.max(0, minX - padX)
  const top = Math.max(0, minY - padY)
  const right = Math.min(width, maxX + 1 + padX)
  const bottom = Math.min(height, maxY + 1 + padY)
  return { crop: { left, top, width: right - left, height: bottom - top }, width, height }
}

export async function cropProductImage(buffer: Buffer): Promise<ProductImageCropResult> {
  const { crop, width, height } = await findContentBox(buffer)
  if (!crop) return { buffer, skipped: true, reason: 'Содержимое изображения не найдено', sourceWidth: width, sourceHeight: height }
  const fillRatio = (crop.width * crop.height) / (width * height)
  if (fillRatio > 0.9) return { buffer, skipped: true, reason: 'Изображение уже плотно кадрировано', sourceWidth: width, sourceHeight: height, crop, fillRatio }
  let pipeline = sharp(buffer, { limitInputPixels: MAX_INPUT_PIXELS }).extract(crop)
  if (Math.max(crop.width, crop.height) > MAX_DIMENSION) {
    pipeline = pipeline.resize({
      width: crop.width >= crop.height ? MAX_DIMENSION : undefined,
      height: crop.height > crop.width ? MAX_DIMENSION : undefined,
      withoutEnlargement: true,
    })
  }
  return {
    buffer: await pipeline.png({ compressionLevel: 9 }).toBuffer(),
    skipped: false, sourceWidth: width, sourceHeight: height, crop, fillRatio,
  }
}

export async function makeCropPreview(buffer: Buffer): Promise<string> {
  const preview = await sharp(buffer).resize({ width: 700, height: 700, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer()
  return `data:image/webp;base64,${preview.toString('base64')}`
}
