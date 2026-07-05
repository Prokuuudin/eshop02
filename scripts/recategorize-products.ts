/**
 * Recategorize all live products into the 5 final categories
 * (hair/nails/face/body/equipment), replacing the broken single-tag
 * mapping from scripts/migrate-from-mssql.ts with a multi-tag confident
 * map. See docs/superpowers/specs/2026-07-05-category-consolidation-design.md.
 *
 * Prerequisite: C:/Temp/product_category_map.json must exist — the
 * recovered MSSQL Product_Category_Mapping export (productId + catName,
 * multi-tag per product) from the 2026-06-28 session. There is no script
 * to regenerate it (would require a live MSSQL connection).
 *
 * Usage:
 *   npx tsx scripts/recategorize-products.ts            # dry run, report only
 *   npx tsx scripts/recategorize-products.ts --apply     # writes to DB
 */
import { readFileSync } from 'fs'
import { config } from 'dotenv'
config({ path: '.env.local' })
import { Pool } from 'pg'

type Bucket = 'hair' | 'nails' | 'face' | 'body' | 'equipment'

// Real MSSQL taxonomy leaves + well-known brand-as-functional-signal tags.
// Anything not listed here (pure brand names, promo tags like AKCIJAS/
// DĀVANAS, structural nodes like KATEGORIJAS/DAŽĀDI) is intentionally
// left unmapped: on multi-tag products another tag will resolve it, and
// fully-unresolvable products fall back to `equipment` (see PRIORITY/
// resolveBucket below), not `hair` — the whole point of this rewrite is
// to stop the old broken mapping from dumping everything into hair.
const HAIR: string[] = [
  'ŠAMPŪNI', 'VEIDOŠANAS LĪDZEKĻI', 'KONDICIONIERI', 'KONDICIONERI', 'KONDICIONIERIS',
  'MATU PAPILDKOPŠANA', 'MATU MASKAS', 'MASKAS', 'MATU KRĀSOŠANAI UN BALINĀŠANAI',
  'MATU KRĀSOŠANA UN BALINĀŠANA', 'MATU KOPŠANAI UN BALINĀŠANAI', 'BARBERSHOP KOSMĒTIKA',
  'BARBERSHOP', 'MATU KOSMĒTIKA', 'MATU VEIDOŠANA', 'MATIEM', 'SHAMPOO', 'CONDITIONER',
  'HAIR MASKS', 'DSD DE LUXE', 'INEBRYA', 'REUZEL', 'FRENCHI', 'OLAPLEX', 'KEUNE 1922',
  'PEPTIDE REPAIR RESCUE', 'PH 4.5 COLOR FREEZE', 'HYALURONIC MOISTURE KICK',
  'COLLAGEN VOLUME BOOST', 'FRIZZ AWAY', 'Q10+ TIME RESTORE', 'NOIR REPAIR',
  'TURQUOISE HYDRA COMPLEX', 'BLANC VOLUME UP', 'PLATINUM ABSOLUTE BLOND',
  'KERATIN PROTEIN', 'KERATIN PROTEIN PERLE', 'KERATIN SERIJA', 'ARGAN TREATMENT DORE',
  'ROSE CURLY DREAM', 'ARGENT', 'R-TWO', 'ADDITIONAL CARE', 'EXTRA CARE', 'ILLAMINACTION',
  'AMPOULES', 'DIKSON PRIME HAIR COLOR MASK', 'DIKSON', 'FUDGE URBAN', 'MOROCCANOIL', 'K18',
  'BEARDBURYS', 'DEAR BARBER', 'BY MY BEARD', 'BATISTE', 'GOLDWELL', 'OROFLUIDO',
  'SCHWARZKOPF PROFESSIONAL', 'BLACK PROFESSIONAL LINE', "L`OREAL PROFESSIONNEL",
  "L'OREAL PROFESSIONNEL", "L`OREAL KIDS", 'SUBRINA PROFESSIONAL', 'LAB 35', 'PRO-TOX',
  'KALLOS PLEX BOND BUILDER', 'JADE', 'ROYAL TREATMENT', 'BIOELIXIRE',
  'CHARLES WORTHINGTON', 'HAIR EXPERT', 'KASHŌKI', 'LUMI', 'STAPIZ', 'BARBET MEN', 'DANDY',
]

const NAILS: string[] = [
  'NAGU ĀRSTĒŠANA', 'NAGU KOPŠANA', 'NAGU LAKAS', 'GĒLA LAKAS',
  'GĒLA TEHNOLOĢIJAS PALĪGLĪDZEKĻI', 'UV ŽELEJAS', 'MANIKĪRA UN PEDIKĪRA PIEDERUMI',
  'MANIKĪRA UN PEDIKĪRA KNAIBLES', 'MANIKĪRA UN PEDIKĪRA VĪLES', 'MANIKĪRA ŠĶĒRES',
  'MANIKĪRA PIEDERUMI', 'PUŠERI', 'NAGIEM', 'VICTORIA VYNN', 'SEMILAC', 'SILCARE',
  'NAIL TEK', 'ORLY', 'LACKY NAILS', 'STALEKS', 'TRIND', 'KINETICS', 'RONNEY',
  'BEAUTY IMAGE',
]

const FACE: string[] = [
  'SEJAI', 'ĀDAS KOPŠANA', 'DEKORATĪVĀ KOSMĒTIKA', 'DEKORATĪVA KOSMĒTIKA',
  'MAKE-UP AKSESUĀRI', 'SKROPSTU TUŠA', 'SKROPSTU UN UZACU KOPŠANA', 'LŪPĀM',
  'GRIMA PAMATS', 'PŪDERI', 'KOREKTORI', 'MAKE UP BLENDER', "L`OREAL PARIS MAKEUP",
  'MAYBELLINE', 'MAX FACTOR', 'VIVIENNE SABO', 'BOURJOIS', 'GOSH', 'PAYOT', 'YON-KA',
  'JANSSEN COSMETICS', 'DR.KADIR', 'MATIS', 'LANCOME', 'HOLIKA HOLIKA', 'KOREAN BEAUTY',
  'PUREDERM', 'CHILDS FARM', 'SNAILS', 'BIODERMA', 'EOS', 'LONG 4 LASHES', 'PILATEN',
  'HISKIN', 'CETTUA', 'LOVASKIN', 'JEUNESSE',
]

const BODY: string[] = [
  'KĀJĀM', 'ROKĀM', 'GEHWOL', 'SIEVIEŠU SMARŽAS', 'VĪRIEŠU SMARŽAS', 'ĶERMEŅA KOSMĒTIKA',
  'ĶERMEŅA KOSMETIKA', 'VAKSĀCIJA', 'EĻĻAS', 'ĶERMENIM', 'SOLĀRIJU KOSMĒTIKA', 'RICA',
  'FEETCALM', 'CARELIKA', 'ST.TROPEZ', 'DEPILEVE', 'SANCTUARY SPA', 'YOPE', 'LATTAFA',
  'JAMES READ', 'ART OF SUN', 'SECRET SUN', 'MERCEDES BENZ', 'DEPILĀCIJAS PAPĪRS',
]

const EQUIPMENT: string[] = [
  'INSTRUMENTI', 'ĶEMMES UN MATU SUKAS', 'MATU GRIEŽAMĀ MAŠĪNA', 'MATU GRIEŽAMĀS MAŠĪNAS',
  'STYLING TOOLS', 'AKSESUĀRI MATIEM', 'FĒNI', 'MATU SUKAS', 'MATU ĶEMMES',
  'ELEKTROPRECES', 'MĒBELES', 'AKSESUĀRI', 'EKO-HIGIENA', 'DEZINFEKCIJA', 'TANGLE TEEZER',
  'TANGLE ANGEL', 'GHD', 'BABYLISS', 'BABYLISS PRO', 'WAHL', 'ANDIS', 'GA.MA', 'CERA',
  'VALERA', 'OLIVIA GARDEN', 'FRAMAR', 'CERIOTTI', 'JAGUAR', 'JRL', 'EUROSTIL PROFESSIONAL',
  'PHILIPS', 'OSTER', 'DYSON', 'REMINGTON', 'DREAME', 'LANAFORM', 'SIBEL', 'LABOR', 'ETI',
  'HAKURO PROFESSIONAL', 'O! TOOLS', 'TOOLS FOR BEAUTY', 'RAZORPIT', 'SKAISTUMAM',
  'PALĪGMATERIĀLI', 'CIMDI', 'VIENREIZĒJIE APMETŅI UN APKAKLĪTES', 'FOLIJA', 'FLIZELĪNS',
  'APMETŅI UN PRIEKŠAUTI', 'BARBERSHOP  AKSESUĀRI', 'TUNIKA', 'KLEITA', 'SVĀRKI',
  'BIKSES UN  LEGINSI', 'PĀRTIKAS UN SAIMNIECĪBAS PRECES SALONIEM', 'VESELĪBAI', 'VIRTUVEI',
  'PUTEKĻU SŪCĒJI', 'ROBOTIZĒTIE PUTEKĻU SŪCĒJI', 'ROKAS PUTEKĻU SŪCĒJI',
  'PUTEKĻU SŪCĒJI MITRAI UN SAUSAI TĪRĪŠANAI', 'TĒJKANNAS', 'TOSTERI', 'CEPEŠKRĀSNIS',
  'ELEKTRISKIE GRILI', 'BLENDERI', 'SOUS VIDE IERĪCES', 'VIRTUVES ROBOTI',
  'ZOBU STARPU IRIGATORI', 'ZOBU BIRSTES', 'ĶERMEŅA SVARI', 'TVAIKA MOPI',
  'APĢĒRBU TVAICĒTĀJI', 'MATU VEIDOTĀJI', 'AENO', 'PERFECT BEAUTY',
]

const TAG_TO_BUCKET = new Map<string, Bucket>()
for (const name of HAIR) TAG_TO_BUCKET.set(name.toUpperCase(), 'hair')
for (const name of NAILS) TAG_TO_BUCKET.set(name.toUpperCase(), 'nails')
for (const name of FACE) TAG_TO_BUCKET.set(name.toUpperCase(), 'face')
for (const name of BODY) TAG_TO_BUCKET.set(name.toUpperCase(), 'body')
for (const name of EQUIPMENT) TAG_TO_BUCKET.set(name.toUpperCase(), 'equipment')

// Conflict priority when a product's tags resolve to more than one bucket
// (e.g. shampoo + men's perfume on the same product) — matches the order
// proven in the 2026-06-28 fix.
const PRIORITY: Bucket[] = ['body', 'face', 'nails', 'equipment', 'hair']

function loadJsonLenient(path: string): unknown {
  let raw = readFileSync(path, 'utf8')
  if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1)
  let out = ''
  for (let i = 0; i < raw.length; i++) {
    const code = raw.charCodeAt(i)
    if (code <= 0x1F) continue
    out += raw[i]
  }
  return JSON.parse(out)
}

function resolveBucket(tagNames: string[]): Bucket {
  const matched = new Set<Bucket>()
  for (const name of tagNames) {
    const bucket = TAG_TO_BUCKET.get(name.trim().toUpperCase())
    if (bucket) matched.add(bucket)
  }
  for (const bucket of PRIORITY) {
    if (matched.has(bucket)) return bucket
  }
  return 'equipment'
}

async function main() {
  const apply = process.argv.includes('--apply')
  const MAP_PATH = 'C:/Temp/product_category_map.json'

  let rows: { productId: number; catName: string }[]
  try {
    rows = loadJsonLenient(MAP_PATH) as { productId: number; catName: string }[]
  } catch (e) {
    console.error(`Failed to load ${MAP_PATH}: ${(e as Error).message}`)
    console.error(
      'This file is the recovered MSSQL Product_Category_Mapping export from the ' +
      '2026-06-28 session — it must be present at this path, there is no regeneration script.'
    )
    process.exit(1)
  }

  const tagsByProductId = new Map<string, string[]>()
  for (const row of rows) {
    const id = String(row.productId)
    const list = tagsByProductId.get(id) ?? []
    list.push(row.catName)
    tagsByProductId.set(id, list)
  }
  console.log(`Loaded ${rows.length} tag rows for ${tagsByProductId.size} distinct products`)

  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const client = await pool.connect()
  try {
    const current = await client.query<{ id: string; category: string }>(
      'SELECT id, category FROM "Product" WHERE "isDeleted" = false'
    )
    console.log(`Live products in DB: ${current.rows.length}`)

    const nextByBucket: Record<Bucket, string[]> = {
      hair: [], nails: [], face: [], body: [], equipment: [],
    }
    const beforeCounts: Record<string, number> = {}
    let matchedFromMap = 0
    let untouched = 0

    for (const product of current.rows) {
      beforeCounts[product.category] = (beforeCounts[product.category] ?? 0) + 1
      const tags = tagsByProductId.get(product.id)

      if (tags) {
        nextByBucket[resolveBucket(tags)].push(product.id)
        matchedFromMap++
      } else if (product.category === 'new') {
        nextByBucket.equipment.push(product.id)
      } else {
        untouched++
      }
    }

    console.log('BEFORE:', beforeCounts)
    console.log(
      'AFTER (planned):',
      Object.fromEntries(Object.entries(nextByBucket).map(([bucket, ids]) => [bucket, ids.length]))
    )
    console.log(`Matched via MSSQL tag map: ${matchedFromMap}`)
    console.log(`Left untouched (no tag data, category already valid, not 'new'): ${untouched}`)

    if (!apply) {
      console.log('\nDry run only — pass --apply to write these changes to the database.')
      return
    }

    await client.query('BEGIN')
    let total = 0
    for (const [bucket, ids] of Object.entries(nextByBucket)) {
      if (ids.length === 0) continue
      const result = await client.query('UPDATE "Product" SET category = $1 WHERE id = ANY($2)', [bucket, ids])
      console.log(`  ${bucket}: ${result.rowCount}`)
      total += result.rowCount ?? 0
    }
    await client.query('COMMIT')
    console.log(`Committed. Rows updated: ${total}`)
  } catch (e) {
    await client.query('ROLLBACK')
    console.error('Rolled back:', e)
    throw e
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
