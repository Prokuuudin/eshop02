/**
 * Imports Физ/Юр and the full legal registration number from Klienti 2026.xlsx.
 * Read-only by default; pass --apply to update matching User rows by cardNumber.
 */
import { config } from 'dotenv'
config({ path: '.env.local' })
import * as XLSX from 'xlsx'
import { Prisma } from '../generated/prisma/client'
import { mapClientTypeRow } from '../lib/client-type-import'
import { normalizeCardNumber } from '../lib/card-number'

const APPLY = process.argv.includes('--apply')
const clean = (value: unknown): string | null => {
  if (value === null || value === undefined) return null
  const result = String(value).trim()
  return result || null
}

const main = async () => {
  const workbook = XLSX.readFile('Klienti 2026.xlsx')
  const sheet = workbook.Sheets['Klienti 2026']
  if (!sheet) throw new Error('Worksheet "Klienti 2026" was not found')
  const source = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null })
  const mapped = source.flatMap((row) => {
    const result = mapClientTypeRow({
      cardNumber: normalizeCardNumber(clean(row['Код']) ?? ''),
      sourceType: clean(row['Тип']),
      registrationNumber: clean(row.pk),
    })
    return result ? [result] : []
  })
  const counts = mapped.reduce<Map<string, number>>((result, row) => {
    result.set(row.cardNumber, (result.get(row.cardNumber) ?? 0) + 1)
    return result
  }, new Map())
  const duplicateCards = new Set([...counts].filter(([, count]) => count > 1).map(([card]) => card))
  const rows = mapped.filter((row) => !duplicateCards.has(row.cardNumber))
  const legal = rows.filter((row) => row.customerType === 'company')
  const validLatvianRegistration = legal.filter((row) => row.registrationNumber?.length === 11)

  console.log(JSON.stringify({
    mode: APPLY ? 'apply' : 'dry-run',
    sourceRows: source.length,
    uniqueCardsReady: rows.length,
    individuals: rows.length - legal.length,
    legalEntities: legal.length,
    legalWithRegistrationNumber: legal.filter((row) => row.registrationNumber).length,
    legalWithElevenDigitNumber: validLatvianRegistration.length,
    duplicateCardsSkipped: duplicateCards.size,
  }, null, 2))
  if (!APPLY) return

  const { prisma } = await import('../lib/prisma')
  let updated = 0
  let missing = 0
  const batchSize = 2_000
  for (let index = 0; index < rows.length; index += batchSize) {
    const batch = rows.slice(index, index + batchSize)
    const values = Prisma.join(batch.map((row) => Prisma.sql`(${row.cardNumber}, ${row.customerType}, ${row.registrationNumber})`))
    const count = await prisma.$executeRaw(Prisma.sql`
      UPDATE "User" AS target
      SET "customerType" = source.customer_type,
          "registrationNumber" = source.registration_number
      FROM (VALUES ${values}) AS source(card_number, customer_type, registration_number)
      WHERE target."cardNumber" = source.card_number
    `)
    updated += count
    missing += batch.length - count
  }
  console.log(JSON.stringify({ updated, missing }, null, 2))
}

main().then(() => process.exit(0)).catch((error) => {
  console.error(error)
  process.exit(1)
})
