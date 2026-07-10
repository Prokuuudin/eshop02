/**
 * Анализ Klienti 2026.xlsx перед импортом карт клиентов.
 * Read-only: считает качество данных и матчинг с юзерами Neon по email.
 *
 * Usage: npx tsx scripts/analyze-clients-xlsx.ts
 */
import { config } from 'dotenv'
config({ path: '.env.local' })
import * as XLSX from 'xlsx'

type Row = Record<string, unknown>

const clean = (v: unknown): string | null => {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s.length > 0 ? s : null
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

async function main() {
  const { prisma } = await import('../lib/prisma')
  const wb = XLSX.readFile('Klienti 2026.xlsx')
  const rows = XLSX.utils.sheet_to_json<Row>(wb.Sheets['Klienti 2026'], { defval: null })

  const clients = rows
    .map((r) => ({
      code: clean(r['Код']),
      name: clean(r['Наименование']),
      pk: clean(r['pk']),
      tel: clean(r['tel']),
      email: clean(r['mail'])?.toLowerCase() ?? null,
      type: clean(r['Тип']),
    }))
    .filter((c) => c.code !== null && c.name !== null)

  console.log('Всего строк листа:', rows.length)
  console.log('Клиентов с кодом и именем:', clients.length)

  // Типы
  const byType = new Map<string, number>()
  for (const c of clients) byType.set(c.type ?? '(нет)', (byType.get(c.type ?? '(нет)') ?? 0) + 1)
  console.log('Типы:', Object.fromEntries(byType))

  // Коды
  const codeCount = new Map<string, number>()
  for (const c of clients) codeCount.set(c.code!, (codeCount.get(c.code!) ?? 0) + 1)
  const dupCodes = [...codeCount.entries()].filter(([, n]) => n > 1)
  console.log('Уникальных кодов:', codeCount.size, '| дубликатов кодов:', dupCodes.length)
  if (dupCodes.length) console.log('Примеры дубликатов кодов:', dupCodes.slice(0, 5))

  const nonNumericCodes = clients.filter((c) => !/^\d+$/.test(c.code!))
  console.log('Нечисловых кодов:', nonNumericCodes.length, nonNumericCodes.slice(0, 3).map((c) => c.code))

  const lenHist = new Map<number, number>()
  for (const c of clients) if (/^\d+$/.test(c.code!)) lenHist.set(c.code!.length, (lenHist.get(c.code!.length) ?? 0) + 1)
  console.log('Длина кода (цифр) → количество:', Object.fromEntries([...lenHist.entries()].sort((a, b) => a[0] - b[0])))

  // Email
  const withEmail = clients.filter((c) => c.email)
  const validEmail = withEmail.filter((c) => EMAIL_RE.test(c.email!))
  console.log('С email:', withEmail.length, '| валидный формат:', validEmail.length)

  const emailCount = new Map<string, number>()
  for (const c of validEmail) emailCount.set(c.email!, (emailCount.get(c.email!) ?? 0) + 1)
  const dupEmails = [...emailCount.entries()].filter(([, n]) => n > 1)
  console.log('Уникальных email:', emailCount.size, '| email у нескольких клиентов:', dupEmails.length)
  if (dupEmails.length) console.log('Примеры дублей email:', dupEmails.slice(0, 5))

  // Матчинг с Neon
  const users = await prisma.user.findMany({ select: { email: true, cardNumber: true } })
  console.log('\nЮзеров в Neon:', users.length)
  const dbEmails = new Set(users.map((u) => u.email.toLowerCase()))
  const matched = [...emailCount.keys()].filter((e) => dbEmails.has(e))
  console.log('Excel-email найден среди юзеров Neon:', matched.length)
  console.log('Excel-email без юзера в Neon:', emailCount.size - matched.length)
  const withCard = users.filter((u) => u.cardNumber !== null)
  console.log('Юзеров с cardNumber уже сейчас:', withCard.length)
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
