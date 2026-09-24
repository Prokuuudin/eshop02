import fs from 'node:fs/promises'
import crypto from 'node:crypto'

const SOURCE_URL = 'https://www.omniva.ee/locations.json'
const TARGET = new URL('../data/delivery-locations.json', import.meta.url)

const response = await fetch(SOURCE_URL, { headers: { 'User-Agent': 'HairshopPro delivery directory updater' } })
if (!response.ok) throw new Error(`Omniva locations download failed: HTTP ${response.status}`)
const sourceText = await response.text()
const rows = JSON.parse(sourceText)
if (!Array.isArray(rows)) throw new Error('Omniva response is not an array')

const countryValues = new Set(['LV', 'LT', 'EE'])
const omniva = rows
  .filter(row => row.TYPE === '0' && countryValues.has(row.A0_NAME) && row.ZIP && row.NAME)
  .map(row => {
    const city = row.A3_NAME || row.A2_NAME || row.A1_NAME
    const address = [row.A5_NAME || row.A6_NAME, row.A7_NAME].filter(Boolean).join(' ').trim() || city
    return {
      id: String(row.ZIP), provider: 'omniva', type: 'locker', country: row.A0_NAME,
      name: String(row.NAME), address, city: String(city), postalCode: String(row.ZIP),
      latitude: Number(row.Y_COORDINATE), longitude: Number(row.X_COORDINATE),
      comment: String(row[`comment_${row.A0_NAME === 'LV' ? 'lav' : row.A0_NAME === 'LT' ? 'lit' : 'est'}`] || ''),
    }
  })

if (omniva.length < 500) throw new Error(`Unexpectedly small Omniva directory: ${omniva.length}`)
const existing = JSON.parse(await fs.readFile(TARGET, 'utf8'))
const locations = [...existing.locations.filter(location => location.provider !== 'omniva'), ...omniva]
locations.sort((a, b) => `${a.provider}:${a.country}:${a.id}`.localeCompare(`${b.provider}:${b.country}:${b.id}`))
const keys = new Set()
for (const location of locations) {
  const key = `${location.provider}:${location.country}:${location.id}`
  if (keys.has(key)) throw new Error(`Duplicate delivery location: ${key}`)
  keys.add(key)
}

const updated = {
  ...existing,
  sources: {
    ...(existing.sources ?? {}),
    omniva: { url: SOURCE_URL, fetchedAt: new Date().toISOString(), sha256: crypto.createHash('sha256').update(sourceText).digest('hex') },
  },
  locations,
}
await fs.writeFile(TARGET, `${JSON.stringify(updated, null, 2)}\n`)
console.log(`Stored ${omniva.length} Omniva lockers (${locations.length} total delivery locations)`)
