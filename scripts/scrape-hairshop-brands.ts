/**
 * Scrapes manufacturer/distributor info from hairshop.lv per BRAND.
 * Strategy: /lv/razotaji → brand pages → try multiple products → manufacturer/distributor info.
 * Saves to brands-config KeyValueSetting.
 *
 * Usage:
 *   npx dotenv-cli -e .env.local -- tsx scripts/scrape-hairshop-brands.ts [--dry-run] [--brand=andis]
 */

import { Pool } from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient, Prisma } from '../generated/prisma/client'
import type { BrandManufacturerInfo, BrandsConfigPayload } from '../lib/brands-config'

const ARGS = process.argv.slice(2)
const DRY_RUN = ARGS.includes('--dry-run')
const ONLY_BRAND = ARGS.find(a => a.startsWith('--brand='))?.split('=')[1]
const HAIRSHOP = 'https://www.hairshop.lv'
const DELAY_MS = 900

const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_PRISMA_URL || process.env.POSTGRES_URL
if (!dbUrl) throw new Error('No DATABASE_URL env var')
const pool = new Pool({ connectionString: dbUrl })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })
const BRANDS_CONFIG_KEY = 'brands-config'

// Manual overrides: our brand id → hairshop path (for brands with completely different slugs)
const MANUAL_BRAND_PATHS: Record<string, string> = {
  'babyliss-pro': '/lv/babyllispro',
  'refectocil': '/lv/reflectocil',
  'dr-kadir': '/lv/dkkadir',
  'l-oreal-paris-makeup': '/lv/loreal-paris-makeup-2',
  'l-oreal-professionnel': '/lv/loreal-professionnel',
  'wella-professionals': '/lv/wella-professionals-2-2',
  'childs-farm': '/lv/childs-farm-2',
  'st-tropez': '/lv/sttropez',
  'dsd-de-luxe': '/lv/dsd-de-luxe-2',
  'subrina': '/lv/subrina-professional',
  'stapiz': '/lv/stapiz-professional',
  'j-maki': '/lv/jmaki',
  'janssen-cosmetics': '/lv/janssen-cosmetics-3',
  'jrl': '/lv/jrl-2',
  'sanctuary-spa': '/lv/sanctuary-spa-2',
  'kevin-murphy': '/lv/kevinmurphy',
  'k18': '/lv/k18-2',
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept-Language': 'lv,en;q=0.9',
        'Accept': 'text/html',
      },
      signal: AbortSignal.timeout(12000),
    })
    if (!res.ok) return null
    return res.text()
  } catch { return null }
}

// Get brand pages from /lv/razotaji, normalizing slugs by stripping all trailing numbers
async function getBrandPagePaths(): Promise<{ slug: string; path: string }[]> {
  const html = await fetchHtml(`${HAIRSHOP}/lv/razotaji`)
  if (!html) return []
  const results: { slug: string; path: string }[] = []
  for (const m of html.matchAll(/href="(\/lv\/[a-z0-9][a-z0-9-]*)"/g)) {
    const path = m[1]
    if (path === '/lv/razotaji') continue
    // Strip ALL trailing number suffixes: -2, -2-2, -3 etc
    const slug = path.replace('/lv/', '').replace(/(-\d+)+$/, '')
    results.push({ slug, path })
  }
  return [...new Map(results.map(r => [r.path, r])).values()]
}

// Flexible brand matching: handles hyphens, suffixes, partial matches
function brandMatches(hairshopSlug: string, ourId: string): boolean {
  if (hairshopSlug === ourId) return true
  // hairshop slug has our id as prefix (e.g. black-professional-line vs black-professional)
  if (hairshopSlug.startsWith(ourId + '-')) return true
  // our id has hairshop slug as prefix (e.g. kallos-cosmetics vs kallos, keune-haircosmetics vs keune)
  if (ourId.startsWith(hairshopSlug + '-')) return true
  // Compare without hyphens (e.g. kevinmurphy vs kevin-murphy, loreal vs l-oreal)
  const h = hairshopSlug.replace(/-/g, '')
  const o = ourId.replace(/-/g, '')
  if (h === o) return true
  // Prefix match without hyphens (min 5 chars to avoid false positives like chi/childs)
  if (h.length >= 5 && o.startsWith(h)) return true
  if (o.length >= 5 && h.startsWith(o)) return true
  return false
}

// Category/non-product path patterns to skip
const NON_PRODUCT_PREFIXES = [
  '/lv/matu-krasosanai', '/lv/matu-krasosanas', '/lv/matu-papildkopsana',
  '/lv/veidosanas-lidzekli', '/lv/manikira-un-pedikira', '/lv/papildkopsana',
  '/lv/manikira-piederumi', '/lv/nagu-', '/lv/kondicionieri', '/lv/maskas',
  '/lv/sampuni', '/lv/kategorijas', '/lv/razotaji', '/lv/par-mums',
  '/lv/akcijas', '/lv/blog', '/lv/profesionaliem', '/lv/kontakti',
  '/lv/barbershop', '/lv/sejai', '/lv/kermena', '/lv/solariju',
  '/lv/feni', '/lv/matu-masinites', '/lv/matu-veidotaji',
]

function isNonProduct(path: string): boolean {
  return NON_PRODUCT_PREFIXES.some(p => path.startsWith(p))
}

// Get candidate product paths from brand page, prioritised:
// 1. Branded paths (start with brand slug) with most hyphens first (most specific)
// 2. Other long paths
function extractProductPaths(html: string, brandPagePath: string, brandId: string): string[] {
  const seen = new Set<string>()
  const branded: string[] = []
  const others: string[] = []

  for (const m of html.matchAll(/href="(\/lv\/[a-z0-9][a-z0-9-]*)"/g)) {
    const path = m[1]
    if (seen.has(path) || path === brandPagePath || isNonProduct(path)) continue
    seen.add(path)
    const slug = path.replace('/lv/', '')
    if (slug.startsWith(brandId + '-')) {
      branded.push(path)
    } else {
      others.push(path)
    }
  }

  // Sort branded by hyphen count desc (more hyphens = more specific product name)
  branded.sort((a, b) => b.split('-').length - a.split('-').length)
  // Sort others by length desc
  others.sort((a, b) => b.length - a.length)

  return [...branded, ...others]
}

interface ManufacturerData {
  manufacturer: BrandManufacturerInfo
  distributor: BrandManufacturerInfo
}

function decodeHtml(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .trim()
}

function extractEmail(html: string): string | undefined {
  const m = html.match(/mailto:([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/)
  return m ? m[1] : undefined
}

function extractAfterLabel(html: string, labelRe: RegExp): string | undefined {
  const m1 = html.match(new RegExp(labelRe.source + '[^<]*<[^>]+>\\s*([^<]{2,120})'))
  if (m1) return decodeHtml(m1[1])
  const m2 = html.match(new RegExp(labelRe.source + '[^<>]*:\\s*([^<\\n]{2,120})'))
  if (m2) return decodeHtml(m2[1])
  return undefined
}

function parseManufacturerInfo(html: string): ManufacturerData | null {
  const mfgPos = Math.max(
    html.indexOf('Ražotāja pilns nosaukums'),
    html.indexOf('Razotaja pilns nosaukums'),
    html.toLowerCase().indexOf('ražotāja pilns'),
  )
  if (mfgPos < 0) return null

  const distPos = Math.max(
    html.indexOf('Izplatītāja nosaukums'),
    html.indexOf('Izplatitaja nosaukums'),
    html.toLowerCase().indexOf('izplatītāja'),
  )

  const mfgEnd = distPos > mfgPos ? distPos : mfgPos + 3000
  const mfgHtml = html.slice(mfgPos, mfgEnd)
  const distHtml = distPos > mfgPos ? html.slice(distPos, distPos + 3000) : ''

  const manufacturer: BrandManufacturerInfo = {}
  const name = extractAfterLabel(mfgHtml, /pilns nosaukums/i)
  if (name) manufacturer.name = name
  const addr = extractAfterLabel(mfgHtml, /Pasta adrese/i)
  if (addr) manufacturer.address = addr
  const email = extractEmail(mfgHtml)
  if (email) manufacturer.email = email

  const distributor: BrandManufacturerInfo = {}
  if (distHtml) {
    const dname = extractAfterLabel(distHtml, /nosaukums/i)
    if (dname) distributor.name = dname
    const daddr = extractAfterLabel(distHtml, /Pasta adrese/i)
    if (daddr) distributor.address = daddr
    const demail = extractEmail(distHtml)
    if (demail) distributor.email = demail
  }

  if (!manufacturer.name && !manufacturer.address) return null
  return { manufacturer, distributor }
}

async function scrapeOneBrand(brandId: string, brandPagePath: string): Promise<ManufacturerData | null> {
  const brandHtml = await fetchHtml(HAIRSHOP + brandPagePath)
  await sleep(DELAY_MS)
  if (!brandHtml) return null

  const candidates = extractProductPaths(brandHtml, brandPagePath, brandId)

  // Try direct product candidates first (up to 5)
  for (const productPath of candidates.slice(0, 5)) {
    const productHtml = await fetchHtml(HAIRSHOP + productPath)
    await sleep(DELAY_MS)
    if (!productHtml) continue
    const data = parseManufacturerInfo(productHtml)
    if (data) return data
  }

  // If no luck, try going one level deeper via brand-specific sub-category pages.
  // Only collect URLs that are clearly specific to this brand:
  // - contains 'no-{brandId}' (Latvian "no X" = "from/of X")
  // - or starts with brandId (brand-owned sub-pages like /lv/fudge-urban)
  // Intentionally SKIP generic numbered categories (/lv/sampuni-27) to avoid
  // picking up products from other brands.
  const subCats: string[] = []
  const subCatSeen = new Set<string>()
  for (const m of brandHtml.matchAll(/href="(\/lv\/[a-z][a-z0-9-]*)"/g)) {
    const path = m[1]
    if (subCatSeen.has(path) || path === brandPagePath) continue
    const isBrandSpecificCategory =
      path.includes(`-no-${brandId}`) ||
      path.includes(`no-${brandId}`) ||
      (path.startsWith(`/lv/${brandId}-`) && !path.match(/\/lv\/[a-z]+-\d+$/))
    if (isBrandSpecificCategory) {
      subCatSeen.add(path)
      subCats.push(path)
    }
  }

  for (const subCat of subCats.slice(0, 4)) {
    const subHtml = await fetchHtml(HAIRSHOP + subCat)
    await sleep(DELAY_MS)
    if (!subHtml) continue

    // Sub-categories from brand page are brand-specific — take any products from them
    const subCandidates = extractProductPaths(subHtml, subCat, brandId)

    for (const productPath of subCandidates.slice(0, 4)) {
      const productHtml = await fetchHtml(HAIRSHOP + productPath)
      await sleep(DELAY_MS)
      if (!productHtml) continue
      const data = parseManufacturerInfo(productHtml)
      if (data) return data
    }
  }

  return null
}

async function main() {
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}${ONLY_BRAND ? ` | brand: ${ONLY_BRAND}` : ''}`)

  const row = await prisma.keyValueSetting.findUnique({ where: { key: BRANDS_CONFIG_KEY } })
  if (!row) throw new Error('brands-config not found — open the app first')
  const config = row.value as unknown as BrandsConfigPayload
  const brands = config.brands

  const toProcess = brands.filter(b => {
    if (ONLY_BRAND && b.id !== ONLY_BRAND) return false
    // --force: re-scrape even already filled brands (to fix HTML entities etc)
    if (ARGS.includes('--force')) return true
    return !b.manufacturer?.name
  })
  console.log(`Brands to fill: ${toProcess.length}`)

  console.log('\nFetching brand list from hairshop.lv...')
  const brandPages = await getBrandPagePaths()
  console.log(`Found ${brandPages.length} brand pages on hairshop.lv\n`)
  await sleep(DELAY_MS)

  const results = new Map<string, ManufacturerData>()

  for (const ourBrand of toProcess) {
    // 1. Check manual mapping first
    let brandPagePath = MANUAL_BRAND_PATHS[ourBrand.id]

    // 2. Auto-match by slug
    if (!brandPagePath) {
      const match = brandPages.find(bp => brandMatches(bp.slug, ourBrand.id))
      if (match) brandPagePath = match.path
    }

    if (!brandPagePath) {
      console.log(`  ✗ ${ourBrand.id} — not on hairshop.lv`)
      continue
    }

    const data = await scrapeOneBrand(ourBrand.id, brandPagePath)
    if (!data) {
      console.log(`  ✗ ${ourBrand.id} — no manufacturer info found (tried up to 5 products)`)
      continue
    }

    results.set(ourBrand.id, data)
    console.log(`  ✓ ${ourBrand.id}`)
    if (data.manufacturer.name) console.log(`    mfg: ${data.manufacturer.name} | ${data.manufacturer.address || '—'} | ${data.manufacturer.email || '—'}`)
    if (data.distributor.name) console.log(`    dst: ${data.distributor.name} | ${data.distributor.address || '—'} | ${data.distributor.email || '—'}`)
  }

  console.log(`\nScraped: ${results.size}/${toProcess.length}`)

  if (results.size === 0) { console.log('Nothing to save.'); await prisma.$disconnect(); return }

  const updatedBrands = brands.map(b => {
    const d = results.get(b.id)
    if (!d) return b
    return {
      ...b,
      manufacturer: Object.keys(d.manufacturer).length > 0 ? d.manufacturer : b.manufacturer,
      distributor: Object.keys(d.distributor).length > 0 ? d.distributor : b.distributor,
    }
  })

  if (DRY_RUN) {
    const sample = updatedBrands.find(b => results.has(b.id))
    console.log('\n[DRY RUN] Sample:')
    console.log(JSON.stringify({ id: sample?.id, manufacturer: sample?.manufacturer, distributor: sample?.distributor }, null, 2))
  } else {
    await prisma.keyValueSetting.upsert({
      where: { key: BRANDS_CONFIG_KEY },
      create: { key: BRANDS_CONFIG_KEY, value: { brands: updatedBrands } as unknown as Prisma.InputJsonValue },
      update: { value: { brands: updatedBrands } as unknown as Prisma.InputJsonValue },
    })
    console.log('Saved to brands-config.')
  }

  await prisma.$disconnect()
}

main().catch(e => { console.error(e); prisma.$disconnect(); process.exit(1) })
