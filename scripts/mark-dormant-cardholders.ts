/**
 * Флаг mustChangePassword для «спящих» держателей карт (импорт Klienti 2026.xlsx,
 * см. scripts/import-client-cards.ts), чтобы они могли войти через общий флоу
 * /api/auth/register-card общим приветственным паролем (FIRST_LOGIN_PASSWORD)
 * и попасть на принудительную смену пароля — как уже работает для держателей
 * компаний.
 *
 * Раньше import-client-cards.ts ставил этим строкам mustChangePassword=false
 * и случайный неизвестный хэш пароля — вход был невозможен никак, кроме
 * инвайт-токена. Теперь регистрация по карте проверяет пароль по паролю из
 * FIRST_LOGIN_PASSWORD, только если mustChangePassword=true — эта миграция
 * переводит уже импортированных «спящих» клиентов в такое состояние.
 *
 * Целевые строки: cardNumber задан, companyId не задан (никогда не проходили
 * ни инвайт-акцепт, ни register-card — оба пишут companyId), mustChangePassword
 * сейчас false, platformRole не admin. passwordHash не трогаем — его больше
 * никто не читает для этих строк (register-card сверяет пароль с константой
 * напрямую, не через хэш).
 *
 * Usage:
 *   npx tsx scripts/mark-dormant-cardholders.ts           # dry run, только отчёт
 *   npx tsx scripts/mark-dormant-cardholders.ts --apply    # запись в БД
 *
 * После --apply пишет rollback-отчёт C:/Temp/mark-dormant-cardholders-<ts>.json
 * (id всех затронутых юзеров — чтобы откатить mustChangePassword обратно на false).
 */
import { config } from 'dotenv'
config({ path: '.env.local' })
import { writeFileSync } from 'fs'

const APPLY = process.argv.includes('--apply')
const BATCH = 500

async function main() {
  const { prisma } = await import('../lib/prisma')

  const targets = await prisma.user.findMany({
    where: {
      cardNumber: { not: null },
      companyId: null,
      mustChangePassword: false,
      platformRole: { not: 'admin' },
    },
    select: { id: true, email: true, cardNumber: true },
  })

  console.log(`Найдено «спящих» держателей карт: ${targets.length}`)
  if (targets.length > 0) {
    console.log('Примеры:', targets.slice(0, 5).map((u) => `${u.cardNumber} <${u.email}>`).join(', '))
  }

  if (!APPLY) {
    console.log('\nDry run. Для записи: npx tsx scripts/mark-dormant-cardholders.ts --apply')
    return
  }

  if (targets.length === 0) {
    console.log('Нечего обновлять.')
    return
  }

  let updated = 0
  for (let i = 0; i < targets.length; i += BATCH) {
    const batch = targets.slice(i, i + BATCH)
    await prisma.user.updateMany({
      where: { id: { in: batch.map((u) => u.id) } },
      data: { mustChangePassword: true },
    })
    updated += batch.length
    process.stdout.write(`  updated ${updated}/${targets.length}\r`)
  }
  console.log(`\n  ✓ обновлено ${updated}`)

  const reportPath = `C:/Temp/mark-dormant-cardholders-${Date.now()}.json`
  writeFileSync(
    reportPath,
    JSON.stringify({ affectedUserIds: targets.map((u) => u.id) }, null, 2)
  )
  console.log(`Rollback-отчёт: ${reportPath}`)
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
