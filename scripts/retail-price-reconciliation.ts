/**
 * READ-ONLY retail price reconciliation: hairshop.lv (nopCommerce) vs GrinS price1/price2.
 *
 * Inputs are files only — no database or network connection is opened:
 *   --grins <export.xml>   GrinS export (price1, price2 per SKU)
 *   --nop <nop-prices.tsv> output of scripts/sql/nop-retail-price-export.sql
 *   --out <dir>            where the report is written (created if missing)
 *   --pro-links <tsv>      optional: Hairshop Pro "id<TAB>externalId" of linked products,
 *                          exported read-only (SELECT id, "externalId" FROM "Product"
 *                          WHERE "externalId" IS NOT NULL). Matches nopCommerce products
 *                          that have no or a duplicated SKU via the Pro product
 *                          ("<nopId>" or "nop390-<nopId>") and its GrinS externalId.
 *
 *   npx tsx scripts/retail-price-reconciliation.ts --grins export.xml --nop nop-prices.tsv --out <dir>
 *
 * Output: <dir>/retail-price-reconciliation.csv (one row per nopCommerce product) and
 * <dir>/retail-price-reconciliation-summary.json. Product data only (SKU, name, prices,
 * discount ids); no customer data is read or written. Nothing is migrated: the
 * "preserveBasePrice" column is a proposal for the owner's review.
 *
 * The report is only as current as its inputs: re-run with a fresh nopCommerce export
 * and a fresh GrinS export immediately before the B2C cutover.
 */
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { readGrinsXmlItems } from '../lib/sync/grins-xml-parser'
import { parseNopExport, parseProLinks, reconcile, toCsv, type GrinsPriceRow } from '../lib/retail-pricing/price-reconciliation'

function argument(name: string): string {
  const index = process.argv.indexOf(`--${name}`)
  const value = index >= 0 ? process.argv[index + 1] : undefined
  if (!value || value.startsWith('--')) {
    console.error(`Missing --${name}. Usage: npx tsx scripts/retail-price-reconciliation.ts --grins <export.xml> --nop <nop-prices.tsv> --out <dir>`)
    process.exit(2)
  }
  return value
}

function optionalArgument(name: string): string | undefined {
  return process.argv.includes(`--${name}`) ? argument(name) : undefined
}

function describeInput(file: string) {
  const content = readFileSync(file)
  return { file: path.resolve(file), bytes: content.length, sha256: createHash('sha256').update(content).digest('hex'), modifiedAt: statSync(file).mtime.toISOString() }
}

function main() {
  const grinsFile = argument('grins')
  const nopFile = argument('nop')
  const outDir = argument('out')

  const grinsRows: GrinsPriceRow[] = readGrinsXmlItems(readFileSync(grinsFile, 'utf8')).map((item) => ({
    sku: String(item.sku ?? '').trim(),
    price1: String(item.price1 ?? ''),
    price2: String(item.price2 ?? ''),
  })).filter((row) => row.sku !== '')
  const nopRows = parseNopExport(readFileSync(nopFile, 'utf8'))
  if (nopRows.length === 0) throw new Error('No nopCommerce rows parsed; check the TSV export (tab-separated, see the SQL header).')
  const proLinksFile = optionalArgument('pro-links')
  const proLinks = proLinksFile ? parseProLinks(readFileSync(proLinksFile, 'utf8')) : new Map<string, string>()

  const { rows, summary } = reconcile(nopRows, grinsRows, proLinks)
  mkdirSync(outDir, { recursive: true })
  const csvFile = path.join(outDir, 'retail-price-reconciliation.csv')
  const summaryFile = path.join(outDir, 'retail-price-reconciliation-summary.json')
  writeFileSync(csvFile, `﻿${toCsv(rows)}`)
  writeFileSync(summaryFile, `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    inputs: { grins: describeInput(grinsFile), nop: describeInput(nopFile), ...(proLinksFile && { proLinks: describeInput(proLinksFile) }) },
    note: 'Read-only proposal. Prices are VAT-inclusive (nopCommerce net x tax rate, half-up cents). Re-run with fresh exports before cutover.',
    ...summary,
  }, null, 2)}\n`)

  console.log(JSON.stringify(summary, null, 2))
  console.log(`Wrote ${csvFile}\nWrote ${summaryFile}`)
}

main()
