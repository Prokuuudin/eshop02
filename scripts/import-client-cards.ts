/**
 * Импорт клиентских карт из Klienti 2026.xlsx (лист "Klienti 2026") в Neon.
 *
 * Что делает:
 *  - код клиента ERP (`Код`) становится User.cardNumber;
 *  - существующий юзер (матч по email, case-insensitive) получает cardNumber;
 *  - для клиента без юзера создаётся «спящий» аккаунт (случайный пароль,
 *    mustChangePassword=true) — активировать его можно либо инвайтом (см.
 *    /api/auth/invite), либо через самостоятельную регистрацию по номеру
 *    карты + последним 3 цифрам personal code (см.
 *    app/api/auth/register-card/route.ts), если pkLast3 у клиента заполнен;
 *  - письма НЕ отправляет — рассылка через админку /admin/invitations.
 *
 * Для отсутствующего, некорректного или повторяющегося email использует
 * уникальный технический адрес card.<номер>@client.local. Пропускает (с
 * отчётом): нечисловой код, дубли кодов и конфликты карт в БД.
 *
 * Usage:
 *   npx tsx scripts/import-client-cards.ts           # dry run, только отчёт
 *   npx tsx scripts/import-client-cards.ts --apply   # запись в БД
 *
 * После --apply пишет rollback-отчёт C:/Temp/client-cards-import-<ts>.json
 * (id созданных юзеров + прежние cardNumber обновлённых).
 */
import { config } from 'dotenv'
config({ path: '.env.local' })
import { randomUUID, randomBytes } from 'crypto'
import { writeFileSync } from 'fs'
import bcrypt from 'bcryptjs'
import * as XLSX from 'xlsx'
import { derivePkLast3 } from '../lib/personal-code'
import { isValidCardNumber, normalizeCardNumber } from '../lib/card-number'

const APPLY = process.argv.includes('--apply')
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const BATCH = 500

type Client = {
  code: string
  name: string | null
  pk: string | null
  tel: string | null
  email: string | null
  type: string | null
}

const accountEmail = (client: Pick<Client, 'code' | 'email'>): string =>
  client.email ?? `card.${client.code.toLowerCase()}@client.local`

const clean = (v: unknown): string | null => {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s.length > 0 ? s : null
}

async function main() {
  const { prisma } = await import('../lib/prisma')

  const wb = XLSX.readFile('Klienti 2026.xlsx')
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets['Klienti 2026'], {
    defval: null,
  })

  const skipped: Record<string, number> = {}
  const skip = (reason: string) => {
    skipped[reason] = (skipped[reason] ?? 0) + 1
  }

  // ── 1. Чистка и фильтрация строк файла ──────────────────────────────────
  const raw: Client[] = []
  for (const r of rows) {
    const code = clean(r['Код'])
    const rawEmail = clean(r['mail'])?.toLowerCase() ?? null
    const email = rawEmail && EMAIL_RE.test(rawEmail) ? rawEmail : null
    const normalizedCode = code ? normalizeCardNumber(code) : null
    if (!code || !clean(r['Наименование'])) {
      skip('нет кода или имени')
      continue
    }
    if (!normalizedCode || !isValidCardNumber(normalizedCode)) {
      skip('нечисловой код')
      continue
    }
    if (rawEmail && !email) skip('невалидный email заменён техническим')
    raw.push({
      code: normalizedCode,
      name: clean(r['Наименование']),
      pk: clean(r['pk']),
      tel: clean(r['tel']),
      email,
      type: clean(r['Тип']),
    })
  }

  // Дубли внутри файла — неоднозначность, пропускаем все вхождения
  const codeCount = new Map<string, number>()
  const emailCount = new Map<string, number>()
  for (const c of raw) {
    codeCount.set(c.code, (codeCount.get(c.code) ?? 0) + 1)
    if (c.email) emailCount.set(c.email, (emailCount.get(c.email) ?? 0) + 1)
  }
  // Один реальный email у нескольких ERP-карт неоднозначен: не связываем
  // ни одну из них с чужим/общим аккаунтом, а выдаём каждой технический email.
  for (const c of raw) {
    if (c.email && emailCount.get(c.email)! > 1) {
      skip('дубль email заменён техническим')
      c.email = null
    }
  }
  const clients = raw.filter((c) => {
    if (codeCount.get(c.code)! > 1) {
      skip('дубль кода в файле')
      return false
    }
    return true
  })

  // ── 2. Состояние БД ─────────────────────────────────────────────────────
  const users = await prisma.user.findMany({
    select: { id: true, email: true, cardNumber: true },
  })
  const byEmail = new Map<string, { id: string; cardNumber: string | null }[]>()
  for (const u of users) {
    const key = u.email.toLowerCase()
    if (!byEmail.has(key)) byEmail.set(key, [])
    byEmail.get(key)!.push({ id: u.id, cardNumber: u.cardNumber })
  }
  const takenCards = new Set(users.map((u) => u.cardNumber).filter(Boolean) as string[])

  // ── 3. План операций ────────────────────────────────────────────────────
  const toUpdate: { userId: string; email: string; prevCardNumber: string | null; cardNumber: string; pk: string | null }[] = []
  const toCreate: Client[] = []

  for (const c of clients) {
    if (takenCards.has(c.code)) {
      skip('карта уже занята в БД')
      continue
    }
    const email = accountEmail(c)
    const matches = byEmail.get(email) ?? []
    if (matches.length > 1) {
      skip('несколько юзеров с этим email (разный регистр)')
      continue
    }
    if (matches.length === 1) {
      const u = matches[0]
      if (u.cardNumber === c.code) {
        skip('карта уже присвоена этому юзеру')
        continue
      }
      if (u.cardNumber) {
        skip('у юзера уже другая карта')
        continue
      }
      toUpdate.push({ userId: u.id, email, prevCardNumber: u.cardNumber, cardNumber: c.code, pk: c.pk })
    } else {
      toCreate.push(c)
    }
    takenCards.add(c.code)
  }

  console.log(`Строк в листе: ${rows.length}`)
  console.log(`Прошло фильтры: ${clients.length}`)
  console.log(`Обновить cardNumber у существующих юзеров: ${toUpdate.length}`)
  console.log(`Создать спящих юзеров: ${toCreate.length}`)
  console.log('Пропущено:', skipped)

  if (!APPLY) {
    console.log('\nDry run. Для записи: npx tsx scripts/import-client-cards.ts --apply')
    return
  }

  // ── 4. Запись ───────────────────────────────────────────────────────────
  // Один хэш случайного пароля на всех спящих: пароль никому не известен,
  // вход по паролю невозможен — активация либо инвайтом (accept ставит свой
  // пароль), либо через register-card (номер карты + последние 3 цифры
  // personal code, если pkLast3 заполнен)
  const sleepingHash = await bcrypt.hash(randomBytes(32).toString('hex'), 10)

  let updated = 0
  for (const u of toUpdate) {
    // Blank pk in the file must never null out a pkLast3 the user already
    // has — only include the field in the update when we actually derived
    // a value (same rule as scripts/backfill-pk-last3.ts).
    const pkLast3 = derivePkLast3(u.pk)
    await prisma.user.update({
      where: { id: u.userId },
      data: { cardNumber: u.cardNumber, ...(pkLast3 ? { pkLast3 } : {}) },
    })
    updated++
    if (updated % 100 === 0) process.stdout.write(`  updated ${updated}/${toUpdate.length}\r`)
  }
  console.log(`  ✓ обновлено ${updated}`)

  const createdIds: string[] = []
  const createRows = toCreate.map((c) => ({
    id: randomUUID(),
    email: accountEmail(c),
    passwordHash: sleepingHash,
    name: c.name,
    phone: c.tel,
    cardNumber: c.code,
    pkLast3: derivePkLast3(c.pk),
    platformRole: 'customer',
    mustChangePassword: true,
  }))
  let created = 0
  for (let i = 0; i < createRows.length; i += BATCH) {
    const batch = createRows.slice(i, i + BATCH)
    await prisma.user.createMany({ data: batch, skipDuplicates: true })
    createdIds.push(...batch.map((b) => b.id))
    created += batch.length
    process.stdout.write(`  created ${created}/${createRows.length}\r`)
  }
  console.log(`  ✓ создано ${created}`)

  const reportPath = `C:/Temp/client-cards-import-${Date.now()}.json`
  writeFileSync(
    reportPath,
    JSON.stringify({ updatedUsers: toUpdate, createdUserIds: createdIds, skipped }, null, 2)
  )
  console.log(`Rollback-отчёт: ${reportPath}`)
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
