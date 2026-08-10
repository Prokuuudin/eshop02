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

import fs from 'fs'
import path from 'path'
import { cropProductImage, loadProductImage } from '../lib/product-image-crop'

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

async function cropOne(
  url: string,
  label: string,
  readMediaAsset: (name: string) => Promise<Buffer | null>,
): Promise<{ buffer: Buffer; skipped: boolean; reason?: string }> {
  const original = await loadProductImage(url, readMediaAsset)
  const result = await cropProductImage(original)
  if (!result.skipped && result.crop) {
    console.log(`  ${label}: ${result.sourceWidth}x${result.sourceHeight} -> bbox ${result.crop.width}x${result.crop.height} @ (${result.crop.left},${result.crop.top}) [${((result.fillRatio ?? 0) * 100).toFixed(0)}% -> ~100%]`)
  }
  return { buffer: result.buffer, skipped: result.skipped, reason: result.reason }
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
    const r = await cropOne(urls[i], `фото ${i + 1}/${urls.length}`, async (name) => {
      const asset = await prisma.mediaAsset.findUnique({ where: { name }, select: { data: true } })
      return asset ? Buffer.from(asset.data) : null
    })
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
