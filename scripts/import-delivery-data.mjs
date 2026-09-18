import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import XLSX from 'xlsx'

const sourceRoot = process.argv[2]
if (!sourceRoot) throw new Error('Usage: node scripts/import-delivery-data.mjs <materials-directory>')
const read = name => fs.readFileSync(path.join(sourceRoot, name))
const rows = sheet => XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null })
const workbook = XLSX.read(read('перевозка.xlsx'), { type: 'buffer' })
const tariffs = {}
let provider
for (const row of rows(workbook.Sheets[workbook.SheetNames[0]]).slice(2)) {
  if (row[0]) provider = String(row[0]).toLowerCase().replace('vtnipak', 'venipak')
  if (!['omniva', 'venipak', 'expresspasts', 'unisend'].includes(provider)) throw new Error(`Unknown carrier: ${provider}`)
  const country = row[3]
  if (!['LV', 'LT', 'EE'].includes(country)) throw new Error(`Unknown country: ${country}`)
  if (![row[1], row[2]].every(value => typeof value === 'number' && value >= 0)) throw new Error('Invalid tariff')
  tariffs[provider] ??= { locker: {}, courier: {} }
  tariffs[provider].locker[country] = row[1]
  tariffs[provider].courier[country] = row[2]
}
if (Object.keys(tariffs).length !== 4 || Object.values(tariffs).some(t => Object.keys(t.locker).length !== 3)) throw new Error('Incomplete tariff matrix')

const venipak = JSON.parse(read('Venipak/venipak_locations.json').toString('utf8'))
const excelIds = []
for (const name of ['Venipak/pakomāti.xlsx', 'Venipak/Pick-up.xlsx']) {
  const w = XLSX.read(read(name), { type: 'buffer' })
  excelIds.push(...rows(w.Sheets[w.SheetNames[0]]).slice(2).filter(row => row[1] != null).map(row => String(row[1])))
}
if (venipak.locations.length !== venipak.location_count || excelIds.length !== venipak.locations.length || venipak.locations.some(location => !excelIds.includes(location.id))) throw new Error('Venipak JSON and workbooks disagree')
const locations = venipak.locations.map(location => ({
  id: location.id, provider: 'venipak', type: location.type,
  name: location.name, address: location.address, city: location.city,
  postalCode: location.postal_code, country: location.country,
  worktime: location.worktime,
}))
const csvFiles = ['Unisend/terminals-lv.csv', 'Unisend/terminals_lt.csv', 'Unisend/terminals_ee.csv']
const seen = new Map()
for (const name of csvFiles) {
  const content = read(name).toString('utf8').replace(/^\uFEFF/, '')
  const w = XLSX.read(content, { type: 'string', raw: true })
  for (const row of rows(w.Sheets[w.SheetNames[0]]).slice(1)) {
    if (!row[0]) continue
    const location = {
      id: String(row[0]), provider: 'unisend', type: 'locker', country: row[1],
      name: row[2], city: row[3], address: row[4], postalCode: String(row[5]),
      latitude: Number(row[6]), longitude: Number(row[7]),
      comment: row.slice(9).filter(value => value != null).join(','),
    }
    const key = `${location.country}:${location.id}`
    if (seen.has(key) && JSON.stringify(seen.get(key)) !== JSON.stringify(location)) throw new Error(`Conflicting terminal: ${key}`)
    seen.set(key, location)
  }
}
locations.push(...seen.values())
const keys = new Set()
for (const location of locations) {
  const key = `${location.provider}:${location.country}:${location.id}`
  if (keys.has(key) || !location.id || !location.name || !location.address || !['LV', 'LT', 'EE'].includes(location.country)) throw new Error(`Invalid or duplicate location: ${key}`)
  keys.add(key)
}
locations.sort((a, b) => `${a.provider}:${a.country}:${a.id}`.localeCompare(`${b.provider}:${b.country}:${b.id}`))
const metadata = { source: 'Customer materials, 2026-09-18', hashes: Object.fromEntries(['перевозка.xlsx', 'Venipak/venipak_locations.json', ...csvFiles].map(name => [name, crypto.createHash('sha256').update(read(name)).digest('hex')])) }
fs.writeFileSync('data/delivery-tariffs.json', JSON.stringify({ ...metadata, pricesIncludeVat: true, tariffs }, null, 2) + '\n')
fs.writeFileSync('data/delivery-locations.json', JSON.stringify({ ...metadata, locations }, null, 2) + '\n')
console.log(`Imported ${locations.length} locations and tariffs for ${Object.keys(tariffs).length} carriers`)
