/**
 * Одноразовый бэкафилл User.pkLast3 из Klienti 2026.xlsx для карт, уже
 * импортированных раньше (import-client-cards.ts исторически не писал pk).
 *
 * Что делает:
 *  - для каждой строки файла с непустым pk вычисляет последние 3 символа
 *    (derivePkLast3) и пишет в User.pkLast3 по совпадению cardNumber, если
 *    там сейчас null;
 *  - отдельно переводит mustChangePassword false→true, но ТОЛЬКО для
 *    юзеров без companyId и без принятого InvitationToken — то есть
 *    реально ни разу не активированных. Юзеров, кто уже выбрал свой пароль
 *    (через инвайт), не трогает — иначе угадавший 3 цифры сможет
 *    перехватить уже живой аккаунт. См.
 *    docs/superpowers/specs/2026-07-31-card-pk-registration-design.md
 *
 * Usage:
 *   npx tsx scripts/backfill-pk-last3.ts           # dry run, только отчёт
 *   npx tsx scripts/backfill-pk-last3.ts --apply   # запись в БД
 *
 * После --apply пишет отчёт C:/Temp/pk-last3-backfill-<ts>.json
 * (какие юзеры получили pkLast3 и/или mustChangePassword: true).
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

  const pkByCode = new Map<string, string>()
  for (const r of rows) {
    const code = r['Код'] === null || r['Код'] === undefined ? '' : String(r['Код']).trim()
    const rawPk = r['pk'] === null || r['pk'] === undefined ? null : String(r['pk'])
    const pk = derivePkLast3(rawPk)
    if (code && pk) pkByCode.set(code, pk)
  }
  console.log(`Карт с pk в файле: ${pkByCode.size}`)

  const users = await prisma.user.findMany({
    where: { cardNumber: { not: null } },
    select: { id: true, cardNumber: true, pkLast3: true, mustChangePassword: true, companyId: true },
  })
  console.log(`Юзеров с cardNumber в БД: ${users.length}`)

  const acceptedInvites = await prisma.invitationToken.findMany({
    where: { status: 'accepted' },
    select: { userId: true },
  })
  const activatedViaInvite = new Set(acceptedInvites.map((i) => i.userId))

  const pkUpdates: { userId: string; cardNumber: string; pkLast3: string }[] = []
  const flipUpdates: { userId: string; cardNumber: string }[] = []

  for (const u of users) {
    if (!u.cardNumber) continue
    const pk = pkByCode.get(u.cardNumber)
    if (pk && !u.pkLast3) {
      pkUpdates.push({ userId: u.id, cardNumber: u.cardNumber, pkLast3: pk })
    }
    if (!u.mustChangePassword && !u.companyId && !activatedViaInvite.has(u.id)) {
      flipUpdates.push({ userId: u.id, cardNumber: u.cardNumber })
    }
  }

  console.log(`pkLast3 будет проставлен: ${pkUpdates.length}`)
  console.log(`mustChangePassword false→true (спящие, без инвайта): ${flipUpdates.length}`)

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

  let flipped = 0
  for (const u of flipUpdates) {
    await prisma.user.update({ where: { id: u.userId }, data: { mustChangePassword: true } })
    flipped++
    if (flipped % 200 === 0) process.stdout.write(`  mustChangePassword ${flipped}/${flipUpdates.length}\r`)
  }
  console.log(`  ✓ mustChangePassword выставлен у ${flipped}`)

  const reportPath = `C:/Temp/pk-last3-backfill-${Date.now()}.json`
  writeFileSync(reportPath, JSON.stringify({ pkUpdates, flipUpdates }, null, 2))
  console.log(`Rollback-отчёт: ${reportPath}`)
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
