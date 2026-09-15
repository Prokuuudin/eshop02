/**
 * Одноразовая чистка: удаляет ключ personalCode из Order.legalDetails и
 * User.checkoutProfile во всей БД.
 *
 * С 2026-09-15 приложение больше не пишет personalCode ни в один из этих
 * JSON-столбцов — см. lib/orders-store.ts (OrderLegalDetails), lib/auth-types.ts
 * (CheckoutProfile), app/api/orders/route.ts, app/api/user/profile/route.ts.
 * Персональный код теперь используется только вручную, на конкретный счёт,
 * по инициативе клиента (components/admin/OrderInvoiceModal.tsx) и нигде не
 * сохраняется. Этот скрипт вычищает то, что успело накопиться в БД раньше.
 *
 * Заказчик одобрил полное удаление уже накопленных персональных кодов
 * (2026-09-15).
 *
 * Usage:
 *   npx tsx scripts/purge-personal-codes.ts           # dry run, только отчёт
 *   npx tsx scripts/purge-personal-codes.ts --apply   # запись в БД
 *
 * Перед --apply пишет снимок затронутых строк в
 * .backups/personal-codes-before-purge-<ts>.json — .backups/ в .gitignore,
 * файл только локальный. В нём остаются настоящие персональные коды: после
 * того как проверите, что чистка прошла как надо (см. итоговые счётчики),
 * этот файл нужно удалить вручную — держать его дольше пары дней бессмысленно
 * и противоречит самой цели чистки.
 */
import { config } from 'dotenv'
config({ path: '.env.local' })
import { writeFileSync } from 'fs'

const APPLY = process.argv.includes('--apply')

async function main() {
  const { prisma } = await import('../lib/prisma')

  const affectedOrders = await prisma.$queryRawUnsafe<{ id: string; legalDetails: unknown }[]>(
    `SELECT id, "legalDetails" FROM "Order" WHERE "legalDetails"->>'personalCode' IS NOT NULL`
  )
  const affectedUsers = await prisma.$queryRawUnsafe<{ id: string; checkoutProfile: unknown }[]>(
    `SELECT id, "checkoutProfile" FROM "User" WHERE "checkoutProfile"->>'personalCode' IS NOT NULL`
  )

  console.log(`Заказов с personalCode в legalDetails: ${affectedOrders.length}`)
  console.log(`Пользователей с personalCode в checkoutProfile: ${affectedUsers.length}`)

  if (!APPLY) {
    console.log('\nDry run. Для записи: npx tsx scripts/purge-personal-codes.ts --apply')
    return
  }

  if (affectedOrders.length === 0 && affectedUsers.length === 0) {
    console.log('Нечего чистить.')
    return
  }

  const backupPath = `.backups/personal-codes-before-purge-${Date.now()}.json`
  writeFileSync(backupPath, JSON.stringify({ affectedOrders, affectedUsers }, null, 2))
  console.log(`Снимок «до» записан: ${backupPath}`)
  console.log('В нём настоящие персональные коды — удалите файл после проверки итоговых счётчиков ниже.')

  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `UPDATE "Order" SET "legalDetails" = "legalDetails" - 'personalCode' WHERE "legalDetails"->>'personalCode' IS NOT NULL`
    )
    await tx.$executeRawUnsafe(
      `UPDATE "User" SET "checkoutProfile" = "checkoutProfile" - 'personalCode' WHERE "checkoutProfile"->>'personalCode' IS NOT NULL`
    )
  })

  const remainingOrders = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
    `SELECT COUNT(*)::bigint AS count FROM "Order" WHERE "legalDetails"->>'personalCode' IS NOT NULL`
  )
  const remainingUsers = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
    `SELECT COUNT(*)::bigint AS count FROM "User" WHERE "checkoutProfile"->>'personalCode' IS NOT NULL`
  )
  console.log(
    `После чистки остаётся с personalCode — заказов: ${remainingOrders[0].count}, пользователей: ${remainingUsers[0].count}`
  )
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
