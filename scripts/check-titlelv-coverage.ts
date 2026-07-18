// Одноразовая проверка: у скольких товаров заполнен titleLv (для латышского инвойса).
import { prisma } from '../lib/prisma'

async function main() {
  const total = await prisma.product.count()
  const withLv = await prisma.product.count({ where: { titleLv: { not: null } } })
  const active = await prisma.product.count({ where: { isActive: true } })
  const activeLv = await prisma.product.count({ where: { isActive: true, titleLv: { not: null } } })
  const sample = await prisma.product.findMany({
    where: { isActive: true },
    select: { id: true, title: true, titleLv: true },
    take: 5,
  })
  console.log(JSON.stringify({ total, withLv, active, activeLv, sample }, null, 2))
}

main().finally(() => prisma.$disconnect())
