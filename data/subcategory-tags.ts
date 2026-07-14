import { SUBCATEGORIES_BY_ID } from './categories'

/**
 * MSSQL taxonomy leaf (hairshop.lv nopCommerce category name, uppercase)
 * → storefront subcategory slug from SUBCATEGORIES_BY_ID.
 *
 * Same source of truth as scripts/recategorize-products.ts: the recovered
 * Product_Category_Mapping export (C:/Temp/product_category_map.json).
 * scripts/generate-product-subcategories.ts bakes the per-product result
 * into data/product-subcategories.json — rerun it after changing this map.
 * Brand-as-category tags (CERA, ORLY, ...) and promo tags (AKCIJAS) are
 * intentionally absent: they carry no subcategory signal.
 */
export const TAG_TO_SUBCATEGORY = new Map<string, string>([
  // hair
  ['ŠAMPŪNI', 'shampoos'],
  ['SHAMPOO', 'shampoos'],
  ['KONDICIONIERI', 'conditioners'],
  ['KONDICIONERI', 'conditioners'],
  ['KONDICIONIERIS', 'conditioners'],
  ['CONDITIONER', 'conditioners'],
  ['MATU MASKAS', 'masks'],
  ['MASKAS', 'masks'],
  ['HAIR MASKS', 'masks'],
  ['MATU KRĀSOŠANAI UN BALINĀŠANAI', 'coloring'],
  ['MATU KRĀSOŠANA UN BALINĀŠANA', 'coloring'],
  ['MATU KOPŠANAI UN BALINĀŠANAI', 'coloring'],
  ['MATU PAPILDKOPŠANA', 'extra-care'],
  ['ADDITIONAL CARE', 'extra-care'],
  ['EXTRA CARE', 'extra-care'],
  ['AMPOULES', 'extra-care'],
  ['VEIDOŠANAS LĪDZEKĻI', 'styling'],
  ['MATU VEIDOŠANA', 'styling'],
  ['BARBERSHOP KOSMĒTIKA', 'barbershop-products'],
  ['BARBERSHOP', 'barbershop-products'],
  // face
  ['SEJAI', 'face-care'],
  ['ĀDAS KOPŠANA', 'face-care'],
  ['SKROPSTU UN UZACU KOPŠANA', 'lashes-brows-care'],
  ['DEKORATĪVĀ KOSMĒTIKA', 'decorative-cosmetics'],
  ['DEKORATĪVA KOSMĒTIKA', 'decorative-cosmetics'],
  ['SKROPSTU TUŠA', 'decorative-cosmetics'],
  ['LŪPĀM', 'decorative-cosmetics'],
  ['GRIMA PAMATS', 'decorative-cosmetics'],
  ['PŪDERI', 'decorative-cosmetics'],
  ['KOREKTORI', 'decorative-cosmetics'],
  ['MAKE UP BLENDER', 'decorative-cosmetics'],
  ['MAKE-UP AKSESUĀRI', 'decorative-cosmetics'],
  // body
  ['SOLĀRIJU KOSMĒTIKA', 'solarium-cosmetics'],
  ['ĶERMEŅA KOSMĒTIKA', 'body-cosmetics'],
  ['ĶERMEŅA KOSMETIKA', 'body-cosmetics'],
  ['ĶERMENIM', 'body-cosmetics'],
  ['VAKSĀCIJA', 'waxing'],
  ['DEPILĀCIJAS PAPĪRS', 'waxing'],
  ['EĻĻAS', 'oils'],
  ['SIEVIEŠU SMARŽAS', 'perfumery'],
  ['VĪRIEŠU SMARŽAS', 'perfumery'],
  ['KĀJĀM', 'leg-care'],
  ['ROKĀM', 'hand-care'],
  // nails
  ['GĒLA TEHNOLOĢIJAS PALĪGLĪDZEKĻI', 'gel-tech-products'],
  ['UV ŽELEJAS', 'uv-gel'],
  ['MANIKĪRA UN PEDIKĪRA PIEDERUMI', 'manicure-pedicure-tools'],
  ['MANIKĪRA UN PEDIKĪRA KNAIBLES', 'manicure-pedicure-tools'],
  ['MANIKĪRA UN PEDIKĪRA VĪLES', 'manicure-pedicure-tools'],
  ['MANIKĪRA ŠĶĒRES', 'manicure-pedicure-tools'],
  ['MANIKĪRA PIEDERUMI', 'manicure-pedicure-tools'],
  ['PUŠERI', 'manicure-pedicure-tools'],
  ['NAGU ĀRSTĒŠANA', 'treatment-recovery'],
  ['NAGU LAKAS', 'nail-polishes'],
  ['GĒLA LAKAS', 'gel-polishes'],
  ['NAGU KOPŠANA', 'nail-care'],
  // equipment
  ['MĒBELES', 'furniture'],
  ['INSTRUMENTI', 'tools'],
  ['ELEKTROPRECES', 'electrical-goods'],
  ['FĒNI', 'electrical-goods'],
  ['MATU GRIEŽAMĀ MAŠĪNA', 'electrical-goods'],
  ['MATU GRIEŽAMĀS MAŠĪNAS', 'electrical-goods'],
  ['MATU VEIDOTĀJI', 'electrical-goods'],
  ['STYLING TOOLS', 'electrical-goods'],
  ['ROBOTIZĒTIE PUTEKĻU SŪCĒJI', 'electrical-goods'],
  ['ROKAS PUTEKĻU SŪCĒJI', 'electrical-goods'],
  ['PUTEKĻU SŪCĒJI', 'electrical-goods'],
  ['PUTEKĻU SŪCĒJI MITRAI UN SAUSAI TĪRĪŠANAI', 'electrical-goods'],
  ['TĒJKANNAS', 'electrical-goods'],
  ['TOSTERI', 'electrical-goods'],
  ['CEPEŠKRĀSNIS', 'electrical-goods'],
  ['ELEKTRISKIE GRILI', 'electrical-goods'],
  ['BLENDERI', 'electrical-goods'],
  ['SOUS VIDE IERĪCES', 'electrical-goods'],
  ['VIRTUVES ROBOTI', 'electrical-goods'],
  ['ZOBU STARPU IRIGATORI', 'electrical-goods'],
  ['ZOBU BIRSTES', 'electrical-goods'],
  ['ĶERMEŅA SVARI', 'electrical-goods'],
  ['TVAIKA MOPI', 'electrical-goods'],
  ['APĢĒRBU TVAICĒTĀJI', 'electrical-goods'],
  ['DEZINFEKCIJA', 'disinfection'],
  ['EKO-HIGIENA', 'disinfection'],
  ['PALĪGMATERIĀLI', 'consumables'],
  ['CIMDI', 'consumables'],
  ['VIENREIZĒJIE APMETŅI UN APKAKLĪTES', 'consumables'],
  ['FOLIJA', 'consumables'],
  ['FLIZELĪNS', 'consumables'],
  ['APMETŅI UN PRIEKŠAUTI', 'aprons-capes'],
  ['TUNIKA', 'aprons-capes'],
  ['KLEITA', 'aprons-capes'],
  ['SVĀRKI', 'aprons-capes'],
  ['BIKSES UN  LEGINSI', 'aprons-capes'],
  ['ĶEMMES UN MATU SUKAS', 'hair-accessories'],
  ['MATU SUKAS', 'hair-accessories'],
  ['MATU ĶEMMES', 'hair-accessories'],
  ['AKSESUĀRI MATIEM', 'hair-accessories'],
  ['AKSESUĀRI', 'hair-accessories'],
  ['BARBERSHOP  AKSESUĀRI', 'salon-products'],
  ['PĀRTIKAS UN SAIMNIECĪBAS PRECES SALONIEM', 'salon-products'],
  ['VIRTUVEI', 'salon-products'],
  ['VESELĪBAI', 'salon-products'],
])

// When several tags match, the more specific slug wins over the generic
// bucket (face-care, body-cosmetics, tools, ...): a face product tagged
// SEJAI + SKROPSTU UN UZACU KOPŠANA is lashes-brows, not generic face care.
const SLUG_PRIORITY: string[] = [
  'lashes-brows-care', 'decorative-cosmetics',
  'solarium-cosmetics', 'waxing', 'oils', 'perfumery', 'leg-care', 'hand-care',
  'gel-tech-products', 'uv-gel', 'gel-polishes', 'nail-polishes',
  'treatment-recovery', 'manicure-pedicure-tools', 'nail-care',
  'shampoos', 'conditioners', 'masks', 'coloring', 'styling',
  'barbershop-products', 'extra-care',
  'furniture', 'electrical-goods', 'disinfection', 'aprons-capes',
  'consumables', 'hair-accessories', 'tools', 'salon-products',
  'face-care', 'body-cosmetics',
]

const PARENT_BY_SLUG: Record<string, string> = {}
for (const [categoryId, items] of Object.entries(SUBCATEGORIES_BY_ID)) {
  for (const item of items) PARENT_BY_SLUG[item.slug] = categoryId
}

/**
 * Pick the subcategory slug for a product from its MSSQL tag names,
 * constrained to the product's storefront category so cross-category
 * tags (e.g. nails + feet on one product) cannot leak a foreign slug.
 */
export function resolveSubcategorySlug(tagNames: string[], category: string): string | undefined {
  const matched = new Set<string>()
  for (const name of tagNames) {
    const slug = TAG_TO_SUBCATEGORY.get(name.trim().toUpperCase())
    if (slug && PARENT_BY_SLUG[slug] === category) matched.add(slug)
  }
  if (matched.size === 0) return undefined
  return SLUG_PRIORITY.find((slug) => matched.has(slug))
}
