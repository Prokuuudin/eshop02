// Одноразовая миграция: у pickup-заказов адрес магазина был записан снимком
// на языке оформления (обычно русском). Приводим address/city к латышскому
// виду из data/stores.ts. Магазин определяем по уникальному индексу LV-xxxx
// внутри сохранённой строки. Идемпотентно. Запуск:
//   npx tsx --env-file=.env.local scripts/fix-pickup-order-addresses.ts [--apply]
import { prisma } from '../lib/prisma'
import { stores } from '../data/stores'

const apply = process.argv.includes('--apply')

async function main() {
  const orders = await prisma.order.findMany({
    where: { deliveryMethod: 'pickup' },
    select: { id: true, address: true, city: true },
  })
  console.log(`pickup-заказов: ${orders.length}; режим: ${apply ? 'APPLY' : 'DRY-RUN'}`)

  let updated = 0
  let unmatched = 0
  for (const o of orders) {
    const postal = (o.address ?? '').match(/LV-\d{4}/)
    const store = postal ? stores.find((s) => s.address.lv.includes(postal[0])) : undefined
    if (!store) {
      unmatched++
      console.log(`  ? #${o.id}: магазин не определён — "${o.address}"`)
      continue
    }
    const address = `${store.name.lv} — ${store.address.lv}`
    const city = store.city.lv
    if (o.address === address && o.city === city) continue
    console.log(`  ~ #${o.id}: "${o.address}" → "${address}"`)
    if (apply) {
      await prisma.order.update({ where: { id: o.id }, data: { address, city } })
    }
    updated++
  }
  console.log(`изменено: ${updated}, не определено: ${unmatched}`)
}

main().finally(() => prisma.$disconnect())
