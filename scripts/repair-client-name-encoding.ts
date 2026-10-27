/**
 * BUG-001: восстановление имён клиентских карт, испорченных экспортом
 * GrinS → «Klienti 2026.xlsx» (cp1257 прочитан как cp1251:
 * «Bērziņa» → «Bзrziтa»). Правила распознавания — lib/name-encoding.ts.
 *
 * Автоматически исправляет только однозначные имена владельцев карт, которые
 * символ в символ совпадают с «Наименование» в файле (имя не менялось после
 * импорта). Неоднозначные (П → Ļ/Ž), не-латышские буквы, cp775, имя не из
 * файла — только в список ручной проверки, без записи. Имена целиком на
 * кириллице и пользователи без карты не трогаются вообще.
 *
 * Usage:
 *   npx tsx scripts/repair-client-name-encoding.ts                 # dry run: CSV + сводка
 *   npx tsx scripts/repair-client-name-encoding.ts --apply --expect-host=<db host>
 *   npx tsx scripts/repair-client-name-encoding.ts --rollback=<rollback.json> --expect-host=<db host>
 *   npx tsx scripts/repair-client-name-encoding.ts --apply-file=<changes.json> --expect-host=<db host>
 *     применяет утверждённые вручную замены (формат rollback-файла: host, rows[id, cardNumber, oldName, newName]);
 *     откат — тот же файл через --rollback; dry run — --check-file=<changes.json> (только SELECT)
 *   --out-dir=<dir>   куда писать отчёты (по умолчанию C:/Temp/bug001-name-repair-<ts>)
 *
 * Запись требует --expect-host, равный хосту из DATABASE_URL: .env.local
 * смотрит в прод, и без явного хоста скрипт не пишет никуда. Перед --apply
 * пишет rollback-файл; UPDATE — одна транзакция, только по строкам, чьё имя
 * всё ещё равно старому, и откатывается целиком, если число строк не сошлось.
 */
import { config } from 'dotenv'
config({ path: '.env.local', quiet: true })
import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import * as XLSX from 'xlsx'
import { normalizeCardNumber } from '../lib/card-number'
import { classifyNameEncoding, type NameEncodingIssue } from '../lib/name-encoding'

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3)
const APPLY = process.argv.includes('--apply')
const ROLLBACK = arg('rollback')
const APPLY_FILE = arg('apply-file')
const CHECK_FILE = arg('check-file')
const EXPECT_HOST = arg('expect-host')
const OUT_DIR = arg('out-dir') ?? `C:/Temp/bug001-name-repair-${Date.now()}`

type Confidence = 'high' | 'medium' | 'low'
type Row = {
  cardNumber: string
  id: string
  oldName: string
  proposedName: string
  reason: string
  confidence: Confidence
}
type RollbackFile = { host: string; createdAt: string; rows: { id: string; cardNumber: string; oldName: string; newName: string }[] }

// DOS cp775 (Baltic Rim), bytes 0x80–0xFF. TextDecoder has no cp775; used
// only to suggest a value for manual review, never applied automatically.
const CP775_HIGH =
  'ĆüéāäģåćłēŖŗīŹÄÅÉæÆōöĢ¢ŚśÖÜø£Ø×¤ĀĪóŻżź”¦©®¬½¼Ł«»░▒▓│┤ĄČĘĖ╣║╗╝ĮŠ┐└┴┬├─┼ŲŪ╚╔╩╦╠═╬Žąčęėįšųūž┘┌█▄▌▐▀ÓßŌŃõÕµńĶķĻļņĒŅ’\u00ad±“¾¶§÷„°∙·¹³²■\u00a0'
const CP1251_HIGH = [...new TextDecoder('windows-1251').decode(Uint8Array.from({ length: 128 }, (_, i) => i + 128))]
const LATVIAN = /^[āčēģīķļņšūžĀČĒĢĪĶĻŅŠŪŽ]$/

function cp775Suggestion(value: string): string | null {
  const chars = [...value].map((ch) => {
    if (!/[\u0400-\u04FF]/.test(ch)) return ch
    const byte = CP1251_HIGH.indexOf(ch)
    return byte < 0 ? null : [...CP775_HIGH][byte]
  })
  if (chars.some((ch) => ch === null || (ch.codePointAt(0)! > 127 && !LATVIAN.test(ch)))) return null
  const out = chars as string[]
  if (out.some((ch, i) => i > 0 && LATVIAN.test(ch) && ch === ch.toUpperCase() && /\p{Ll}/u.test(out[i - 1]))) return null
  return out.join('')
}

const csvCell = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
function writeCsv(path: string, rows: Row[]) {
  const header = ['cardNumber', 'id', 'oldName', 'proposedName', 'reason', 'confidence'] as const
  const lines = [header.join(','), ...rows.map((r) => header.map((h) => csvCell(r[h])).join(','))]
  // BOM — чтобы Excel открыл диакритики как UTF-8
  writeFileSync(path, '\uFEFF' + lines.join('\r\n') + '\r\n', 'utf8')
}

function databaseHost(): string {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL не задан')
  return new URL(url).hostname.toLowerCase()
}

function assertWriteTarget(host: string) {
  if (!EXPECT_HOST) throw new Error('Запись без --expect-host=<host> запрещена')
  if (EXPECT_HOST.toLowerCase() !== host) throw new Error(`DATABASE_URL указывает на ${host}, а не на ${EXPECT_HOST}`)
}

/** Наименование по коду карты из того же листа и с той же чисткой, что import-client-cards.ts. */
function loadSourceNames(): Map<string, Set<string>> {
  const wb = XLSX.readFile('Klienti 2026.xlsx')
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets['Klienti 2026'], { defval: null })
  const byCode = new Map<string, Set<string>>()
  for (const r of rows) {
    const code = String(r['Код'] ?? '').trim()
    const name = String(r['Наименование'] ?? '').trim()
    if (!code || !name || name === 'null') continue
    const key = normalizeCardNumber(code)
    if (!byCode.has(key)) byCode.set(key, new Set())
    byCode.get(key)!.add(name)
  }
  return byCode
}

const MANUAL_CONFIDENCE: Record<NameEncodingIssue | 'provenance', Confidence> = {
  'ambiguous-ļ-or-ž': 'medium',
  'non-latvian-letter': 'low',
  'mid-word-capital': 'low',
  'mixed-cyrillic-words': 'low',
  undecodable: 'low',
  provenance: 'medium',
}

/** Dry run для --apply-file: сколько строк файла сейчас готово к применению и к откату. Только SELECT. */
async function checkFile(file: string) {
  const { prisma } = await import('../lib/prisma')
  const host = databaseHost()
  const data = JSON.parse(readFileSync(file, 'utf8')) as RollbackFile
  const ids = data.rows.map((r) => r.id)
  const current = new Map(
    (await prisma.$queryRaw<{ id: string; cardNumber: string | null; name: string | null }[]>`
      SELECT id, "cardNumber", name FROM "User" WHERE id = ANY(${ids}::text[])`).map((u) => [u.id, u]),
  )
  let ready = 0, alreadyApplied = 0
  const mismatches: string[] = []
  for (const r of data.rows) {
    const u = current.get(r.id)
    if (u && u.cardNumber === r.cardNumber && u.name === r.oldName) ready++
    else if (u && u.cardNumber === r.cardNumber && u.name === r.newName) alreadyApplied++
    else mismatches.push(`${r.cardNumber}\t${r.id}`)
  }
  console.log({ host, fileHost: data.host, hostMatches: data.host === host, rows: data.rows.length, uniqueIds: new Set(ids).size, ready, alreadyApplied, mismatches: mismatches.length })
  for (const m of mismatches) console.log(`  расхождение: ${m}`)
}

/**
 * Переименовывает строки файла oldName → newName (forward) или обратно
 * (back) одной транзакцией: только если текущее имя равно исходному и
 * совпали все строки, иначе не меняет ничего.
 */
async function applyFile(file: string, direction: 'forward' | 'back') {
  const { prisma } = await import('../lib/prisma')
  const host = databaseHost()
  assertWriteTarget(host)
  const data = JSON.parse(readFileSync(file, 'utf8')) as RollbackFile
  if (data.host !== host) throw new Error(`файл ${file} записан для ${data.host}, а не для ${host}`)
  const from = data.rows.map((r) => (direction === 'forward' ? r.oldName : r.newName))
  const to = data.rows.map((r) => (direction === 'forward' ? r.newName : r.oldName))
  const label = direction === 'forward' ? 'Применение' : 'Откат'
  if (direction === 'forward') {
    // Для применения файл и есть rollback-файл: копия рядом с отчётами до записи
    mkdirSync(OUT_DIR, { recursive: true })
    const rollbackPath = join(OUT_DIR, `rollback-${Date.now()}.json`)
    writeFileSync(rollbackPath, JSON.stringify(data, null, 2))
    console.log(`Rollback-файл: ${rollbackPath}`)
  }
  const changed = await prisma.$transaction(
    async (tx) => {
      const n = await tx.$executeRaw`
        UPDATE "User" u SET name = v.to_name
        FROM unnest(${data.rows.map((r) => r.id)}::text[], ${from}::text[], ${to}::text[])
          AS v(id, from_name, to_name)
        WHERE u.id = v.id AND u.name = v.from_name`
      if (n !== data.rows.length) throw new Error(`${label}: совпало ${n} из ${data.rows.length} строк — ничего не изменено`)
      return n
    },
    { timeout: 120_000 },
  )
  console.log(`✓ ${label}: изменено ${changed} имён на ${host}`)
}

async function main() {
  if (CHECK_FILE) return checkFile(CHECK_FILE)
  if (ROLLBACK) return applyFile(ROLLBACK, 'back')
  if (APPLY_FILE) return applyFile(APPLY_FILE, 'forward')
  const { prisma } = await import('../lib/prisma')
  const host = databaseHost()
  if (APPLY) assertWriteTarget(host)
  console.log(`База: ${host}${APPLY ? ' — ЗАПИСЬ' : ' — dry run'}`)

  const source = loadSourceNames()
  const users = await prisma.$queryRaw<{ id: string; cardNumber: string; name: string }[]>`
    SELECT id, "cardNumber", name FROM "User"
    WHERE "cardNumber" IS NOT NULL AND name ~ '[\u0400-\u04FF]'
    ORDER BY id`

  const auto: Row[] = []
  const manual: Row[] = []
  let genuineCyrillic = 0
  for (const u of users) {
    const verdict = classifyNameEncoding(u.name)
    if (verdict.kind === 'clean' || verdict.kind === 'cyrillic') {
      genuineCyrillic++
      continue
    }
    const base = { cardNumber: u.cardNumber, id: u.id, oldName: u.name }
    if (verdict.kind === 'suspicious') {
      const cp775 = verdict.reason === 'ambiguous-ļ-or-ž' ? null : cp775Suggestion(u.name)
      manual.push({
        ...base,
        proposedName: cp775 ?? verdict.proposed ?? '',
        reason: cp775 ? `${verdict.reason}; cp775-suspected` : verdict.reason,
        confidence: cp775 ? 'medium' : MANUAL_CONFIDENCE[verdict.reason],
      })
      continue
    }
    const names = source.get(normalizeCardNumber(u.cardNumber))
    if (!names || names.size !== 1 || !names.has(u.name)) {
      manual.push({
        ...base,
        proposedName: verdict.repaired,
        reason: names ? 'provenance: имя в БД отличается от xlsx' : 'provenance: карты нет в xlsx',
        confidence: MANUAL_CONFIDENCE.provenance,
      })
      continue
    }
    auto.push({ ...base, proposedName: verdict.repaired, reason: 'cp1257-read-as-cp1251', confidence: 'high' })
  }

  mkdirSync(OUT_DIR, { recursive: true })
  writeCsv(join(OUT_DIR, 'auto-repair.csv'), auto)
  writeCsv(join(OUT_DIR, 'manual-review.csv'), manual)
  const byReason: Record<string, number> = {}
  for (const m of manual) byReason[m.reason] = (byReason[m.reason] ?? 0) + 1
  const summary = {
    host,
    mode: APPLY ? 'apply' : 'dry-run',
    cardholdersWithCyrillic: users.length,
    genuineCyrillicSkipped: genuineCyrillic,
    autoRepair: auto.length,
    manualReview: manual.length,
    manualByReason: byReason,
  }
  writeFileSync(join(OUT_DIR, 'summary.json'), JSON.stringify(summary, null, 2))
  console.log(summary)
  console.log(`Отчёты: ${OUT_DIR}`)

  if (!APPLY) {
    console.log('\nDry run. Для записи: --apply --expect-host=<host>')
    return
  }

  const rollbackPath = join(OUT_DIR, `rollback-${Date.now()}.json`)
  const rollbackFile: RollbackFile = {
    host,
    createdAt: new Date().toISOString(),
    rows: auto.map((r) => ({ id: r.id, cardNumber: r.cardNumber, oldName: r.oldName, newName: r.proposedName })),
  }
  writeFileSync(rollbackPath, JSON.stringify(rollbackFile, null, 2))
  console.log(`Rollback-файл: ${rollbackPath}`)

  const updated = await prisma.$transaction(
    async (tx) => {
      const n = await tx.$executeRaw`
        UPDATE "User" u SET name = v.new_name
        FROM unnest(${auto.map((r) => r.id)}::text[], ${auto.map((r) => r.oldName)}::text[], ${auto.map((r) => r.proposedName)}::text[])
          AS v(id, old_name, new_name)
        WHERE u.id = v.id AND u.name = v.old_name AND u."cardNumber" IS NOT NULL`
      if (n !== auto.length) throw new Error(`Совпало ${n} из ${auto.length} строк — транзакция отменена`)
      return n
    },
    { timeout: 120_000 },
  )
  console.log(`✓ Исправлено ${updated} имён`)
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
