/**
 * Обрезать лишние белые/прозрачные поля вокруг товара на фото конкретного
 * товара (находится по brand+sku, либо напрямую по id).
 *
 * Некоторые фото с hairshop.lv (nopCommerce) экспортированы с большим
 * "воздухом" вокруг продукта — на витрине товар выглядит мельче соседних.
 * Источники бывают двух видов:
 *  - настоящий PNG-вырез с альфа-каналом (даже если URL называется .jpeg —
 *    известный баг nopCommerce с расширением);
 *  - непрозрачный JPEG на сплошном фоне.
 * Скрипт определяет тип и ищет bbox контента соответствующим методом.
 *
 * Кропнутый файл заливается в MediaAsset (та же таблица, что и обычные
 * загрузки в админке, отдаётся через /api/media/[name]), затем URL
 * пишется через upsertProductOverride (lib/product-overrides-store) —
 * тот же override-слой, что и правки из админки. Он накладывается поверх
 * базовой строки Product при каждом чтении (getMergedProducts), поэтому
 * переживает будущий ERP pull-синк (сейчас cron выключен): даже если синк
 * перезапишет базовые image/images исходным URL с hairshop.lv, override
 * всё равно вернёт кропнутый.
 *
 * Usage:
 *   npx tsx scripts/crop-product-image.ts --brand EVERYGREEN --sku 24002524
 *   npx tsx scripts/crop-product-image.ts --id 22255
 *   ...затем, проверив превью в scratch-crop-preview/:
 *   npx tsx scripts/crop-product-image.ts --id 22255 --apply
 */
import { config } from 'dotenv'
config({ path: '.env.local' })

import sharp from 'sharp'
import fs from 'fs'
import path from 'path'
import { deriveHiResSrc } from '../lib/image-hires'

const PADDING_RATIO = 0.06 // запас вокруг найденного bbox, доля от его размера
const MAX_DIMENSION = 1600 // не раздуваем сверх разумного веб-размера
const PREVIEW_DIR = path.join(__dirname, '..', 'scratch-crop-preview')

type Args = { brand?: string; sku?: string; id?: string; apply: boolean }

function parseArgs(): Args {
  const argv = process.argv.slice(2)
  const get = (flag: string) => {
    const i = argv.indexOf(flag)
    return i >= 0 ? argv[i + 1] : undefined
  }
  return {
    brand: get('--brand'),
    sku: get('--sku'),
    id: get('--id'),
    apply: argv.includes('--apply'),
  }
}

function resolveSourceUrl(url: string): string {
  return deriveHiResSrc(url) ?? url
}

async function fetchBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`fetch ${url} -> ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

type Bbox = { left: number; top: number; width: number; height: number }

async function findContentBbox(buf: Buffer): Promise<{ bbox: Bbox | null; canvasW: number; canvasH: number }> {
  const img = sharp(buf).ensureAlpha()
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true })
  const { width: w, height: h, channels: ch } = info

  // Есть ли реальная прозрачность (а не просто добавленный ensureAlpha=255 везде)?
  let hasRealAlpha = false
  for (let i = 3; i < data.length; i += ch) {
    if (data[i] < 250) { hasRealAlpha = true; break }
  }

  let minX = w, minY = h, maxX = -1, maxY = -1

  if (hasRealAlpha) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const a = data[(y * w + x) * ch + 3]
        if (a > 10) {
          if (x < minX) minX = x
          if (x > maxX) maxX = x
          if (y < minY) minY = y
          if (y > maxY) maxY = y
        }
      }
    }
  } else {
    // Непрозрачный фон: берём цвет фона по 4 углам, ищем пиксели, заметно
    // отличающиеся от него (порог по манхэттенскому расстоянию каналов RGB).
    const corner = (x: number, y: number) => {
      const i = (y * w + x) * ch
      return [data[i], data[i + 1], data[i + 2]]
    }
    const corners = [corner(0, 0), corner(w - 1, 0), corner(0, h - 1), corner(w - 1, h - 1)]
    const bg = [0, 1, 2].map((c) => Math.round(corners.reduce((s, p) => s + p[c], 0) / 4))
    const THRESHOLD = 40
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * ch
        const dist = Math.abs(data[i] - bg[0]) + Math.abs(data[i + 1] - bg[1]) + Math.abs(data[i + 2] - bg[2])
        if (dist > THRESHOLD) {
          if (x < minX) minX = x
          if (x > maxX) maxX = x
          if (y < minY) minY = y
          if (y > maxY) maxY = y
        }
      }
    }
  }

  if (maxX < minX || maxY < minY) return { bbox: null, canvasW: w, canvasH: h }

  const contentW = maxX - minX + 1
  const contentH = maxY - minY + 1
  const padX = Math.round(contentW * PADDING_RATIO)
  const padY = Math.round(contentH * PADDING_RATIO)
  const left = Math.max(0, minX - padX)
  const top = Math.max(0, minY - padY)
  const right = Math.min(w, maxX + 1 + padX)
  const bottom = Math.min(h, maxY + 1 + padY)

  return { bbox: { left, top, width: right - left, height: bottom - top }, canvasW: w, canvasH: h }
}

async function cropOne(url: string, label: string): Promise<{ buffer: Buffer; skipped: boolean; reason?: string }> {
  const sourceUrl = resolveSourceUrl(url)
  const original = await fetchBuffer(sourceUrl)
  const { bbox, canvasW, canvasH } = await findContentBbox(original)

  if (!bbox) {
    return { buffer: original, skipped: true, reason: 'контент не найден (пустое/однотонное фото?)' }
  }

  const fillRatio = (bbox.width * bbox.height) / (canvasW * canvasH)
  if (fillRatio > 0.9) {
    return { buffer: original, skipped: true, reason: `уже плотно (${(fillRatio * 100).toFixed(0)}% кадра), пропускаю` }
  }

  console.log(
    `  ${label}: ${canvasW}x${canvasH} -> bbox ${bbox.width}x${bbox.height} @ (${bbox.left},${bbox.top}) [${(fillRatio * 100).toFixed(0)}% -> ~100%]`
  )

  let pipeline = sharp(original).extract(bbox)
  if (Math.max(bbox.width, bbox.height) > MAX_DIMENSION) {
    pipeline = pipeline.resize({
      width: bbox.width >= bbox.height ? MAX_DIMENSION : undefined,
      height: bbox.height > bbox.width ? MAX_DIMENSION : undefined,
      withoutEnlargement: true,
    })
  }
  const buffer = await pipeline.png({ compressionLevel: 9 }).toBuffer()
  return { buffer, skipped: false }
}

async function main() {
  const args = parseArgs()
  const { prisma } = await import('../lib/prisma')
  const { upsertProductOverride } = await import('../lib/product-overrides-store')

  let product
  if (args.id) {
    product = await prisma.product.findUnique({ where: { id: args.id } })
  } else if (args.brand && args.sku) {
    product = await prisma.product.findFirst({
      where: { brand: { equals: args.brand, mode: 'insensitive' }, sku: args.sku },
    })
  } else {
    console.error('Нужно указать --id <productId> ИЛИ --brand <brand> --sku <sku>')
    process.exit(1)
    return
  }

  if (!product) {
    console.error('Товар не найден')
    process.exit(1)
    return
  }

  console.log(`Товар: ${product.id} — ${product.brand} — ${product.title}`)

  const urls = product.images?.length ? product.images : product.image ? [product.image] : []
  if (urls.length === 0) {
    console.error('У товара нет фото')
    process.exit(1)
    return
  }

  const results: { originalUrl: string; buffer: Buffer; skipped: boolean; reason?: string }[] = []
  for (let i = 0; i < urls.length; i++) {
    const r = await cropOne(urls[i], `фото ${i + 1}/${urls.length}`)
    if (r.skipped) console.log(`  фото ${i + 1}: ${r.reason}`)
    results.push({ originalUrl: urls[i], ...r })
  }

  if (!args.apply) {
    fs.mkdirSync(PREVIEW_DIR, { recursive: true })
    results.forEach((r, i) => {
      const file = path.join(PREVIEW_DIR, `${product.id}-${i}.png`)
      fs.writeFileSync(file, r.buffer)
      console.log(`  превью: ${file}`)
    })
    console.log('\nDry run — превью сохранены выше. Проверь глазами, затем добавь --apply.')
    await prisma.$disconnect()
    return
  }

  const newUrls: string[] = []
  for (let i = 0; i < results.length; i++) {
    const r = results[i]
    if (r.skipped) {
      newUrls.push(r.originalUrl)
      continue
    }
    const name = `crop-${product.id}-${i}.png`
    const data = new Uint8Array(r.buffer)
    await prisma.mediaAsset.upsert({
      where: { name },
      create: { name, mimeType: 'image/png', size: r.buffer.length, data },
      update: { mimeType: 'image/png', size: r.buffer.length, data },
    })
    newUrls.push(`/api/media/${name}`)
    console.log(`  залито: /api/media/${name} (${r.buffer.length} байт)`)
  }

  const result = await upsertProductOverride(product.id, { image: newUrls[0], images: newUrls })
  if (!result.success) {
    console.error(`❌ Override не сохранён: ${result.error}`)
    await prisma.$disconnect()
    process.exit(1)
    return
  }

  console.log(`\n✓ Override для ${product.id} сохранён (переживёт ERP-ресинк). Было: ${urls.length} фото, кроплено: ${results.filter((r) => !r.skipped).length}.`)
  await prisma.$disconnect()
}

main().catch((e) => {
  console.error('❌ Error:', e)
  process.exit(1)
})
