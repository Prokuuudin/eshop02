/**
 * Одноразовый бэкафилл User.pkLast3 из Klienti 2026.xlsx для карт, уже
 * импортированных раньше (import-client-cards.ts исторически не писал pk).
 *
 * Что делает:
 *  - для каждой строки файла с непустым pk вычисляет последние 3 символа
 *    (derivePkLast3) и пишет в User.pkLast3 по совпадению cardNumber, если
 *    там сейчас null. Существующее значение никогда не перезаписывается.
 *  - код (`Код`), задублированный на нескольких строках файла, — неоднозначность
 *    (последняя строка может принадлежать другому человеку); ВСЕ строки с
 *    таким кодом пропускаются, как и в import-client-cards.ts.
 *
 * Больше ничего не делает — mustChangePassword этот скрипт не трогает.
 * (Ранее скрипт также переводил mustChangePassword false→true для «спящих»
 * юзеров, но это убрано: у всех текущих держателей карт mustChangePassword
 * уже true благодаря отдельному scripts/mark-dormant-cardholders.ts и
 * обновлённому import-client-cards.ts (Task 8), а сама эвристика не умела
 * отличить «настоящего активированного через карту+pkLast3 юзера, который
 * сменил пароль» от «спящего» — что открыло бы окно для угона аккаунта.
 * См. docs/superpowers/specs/2026-07-31-card-pk-registration-design.md
 *
 * Usage:
 *   npx tsx scripts/backfill-pk-last3.ts           # dry run, только отчёт
 *   npx tsx scripts/backfill-pk-last3.ts --apply   # запись в БД
 *
 * После --apply пишет отчёт C:/Temp/pk-last3-backfill-<ts>.json
 * (какие юзеры получили pkLast3).
 */
import { config } from 'dotenv'
config({ path: '.env.local' })
import { writeFileSync } from 'fs'
import * as XLSX from 'xlsx'
import { derivePkLast3 } from '../lib/personal-code'

const APPLY = process.argv.includes('--apply')

async function main() {
  const { prisma } = await import('../lib/prisma')

  const wb = XLSX.readFile('Klienti 2026.xlsx')
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets['Klienti 2026'], {
    defval: null,
  })

  // Дубли кода в файле — та же неоднозначность, что и в
  // import-client-cards.ts: без этого Map.set молча берёт последнюю строку
  // и может записать код от ЧУЖОГО клиента (см. final-review находку —
  // код "303" встречался у двух разных людей). Пропускаем ВСЕ строки с
  // задублированным кодом, а не только "лишние".
  const codeCount = new Map<string, number>()
  for (const r of rows) {
    const code = r['Код'] === null || r['Код'] === undefined ? '' : String(r['Код']).trim()
    if (code) codeCount.set(code, (codeCount.get(code) ?? 0) + 1)
  }

  const pkByCode = new Map<string, string>()
  const dupCodesSkipped = new Set<string>()
  for (const r of rows) {
    const code = r['Код'] === null || r['Код'] === undefined ? '' : String(r['Код']).trim()
    const rawPk = r['pk'] === null || r['pk'] === undefined ? null : String(r['pk'])
    const pk = derivePkLast3(rawPk)
    if (!code || !pk) continue
    if (codeCount.get(code)! > 1) {
      dupCodesSkipped.add(code)
      continue
    }
    pkByCode.set(code, pk)
  }
  console.log(`Пропущено дублей кода: ${dupCodesSkipped.size}`)
  console.log(`Карт с pk в файле: ${pkByCode.size}`)

  const users = await prisma.user.findMany({
    where: { cardNumber: { not: null } },
    select: { id: true, cardNumber: true, pkLast3: true },
  })
  console.log(`Юзеров с cardNumber в БД: ${users.length}`)

  const pkUpdates: { userId: string; cardNumber: string; pkLast3: string }[] = []

  for (const u of users) {
    if (!u.cardNumber) continue
    const pk = pkByCode.get(u.cardNumber)
    if (pk && !u.pkLast3) {
      pkUpdates.push({ userId: u.id, cardNumber: u.cardNumber, pkLast3: pk })
    }
  }

  console.log(`pkLast3 будет проставлен: ${pkUpdates.length}`)

  if (!APPLY) {
    console.log('\nDry run. Для записи: npx tsx scripts/backfill-pk-last3.ts --apply')
    return
  }

  let pkUpdated = 0
  for (const u of pkUpdates) {
    await prisma.user.update({ where: { id: u.userId }, data: { pkLast3: u.pkLast3 } })
    pkUpdated++
    if (pkUpdated % 200 === 0) process.stdout.write(`  pkLast3 ${pkUpdated}/${pkUpdates.length}\r`)
  }
  console.log(`  ✓ pkLast3 обновлён у ${pkUpdated}`)

  const reportPath = `C:/Temp/pk-last3-backfill-${Date.now()}.json`
  writeFileSync(reportPath, JSON.stringify({ pkUpdates }, null, 2))
  console.log(`Rollback-отчёт: ${reportPath}`)
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
