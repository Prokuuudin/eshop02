import { brandSlug } from '@/lib/brand-slug'

// Policy limits, not data: a line may sit at most this many levels below its brand.
export const MAX_LINE_DEPTH = 4
// A root category is treated as the "brands" root when at least this share of its
// present children resolve to Hairshop Pro brands.
export const BRANDS_ROOT_MIN_SHARE = 0.6
const BRANDS_ROOT_MIN_CHILDREN = 5
// A category name used directly under at least this many brands is a product type
// (for example "Shampoos"), not a product line.
export const GENERIC_CATEGORY_MIN_BRANDS = 2

export type LocalizedNames = { default: string; ru?: string; lv?: string; en?: string }

export type SourceCategory = { id: string; parentId: string | null; names: LocalizedNames; published: boolean; isPresent: boolean }
export type SourceManufacturer = { id: string; names: LocalizedNames; isPresent: boolean }
export type SourceCategoryEdge = { productId: string; categoryId: string; isPresent: boolean }
export type SourceManufacturerEdge = { productId: string; manufacturerId: string; isPresent: boolean }
export type ProBrand = { key: string; name: string }
export type ProProduct = { id: string; brand: string; isDeleted: boolean }

export type LineKind = 'line' | 'series' | 'subbrand'
export type ExistingLine = {
  id: string; key: string; brandKey: string; parentId: string | null; slug: string
  names: LocalizedNames; kind: LineKind; status: 'active' | 'archived'; origin: 'source_sync' | 'admin'
  adminLocked: boolean; depth: number
}
export type ExistingCategoryMapping = {
  sourceCategoryId: string; targetType: 'brand' | 'brand_line' | 'ignore'
  brandKey: string | null; brandLineId: string | null; status: 'confirmed' | 'rejected'; origin: string
}
export type ExistingManufacturerMapping = { sourceManufacturerId: string; brandKey: string | null; status: 'confirmed' | 'rejected'; origin: string }
export type ExistingLink = {
  productId: string; brandLineId: string; origin: 'source_sync' | 'admin'; status: 'active' | 'excluded'
  sourceCategoryId: string | null; isPresentInSource: boolean; missingSnapshotCount: number
  lastCheckedSnapshotId?: string | null
}

// Approved line definitions (for example from a reviewed audit). They name the
// source categories; resolution to stable source IDs happens here.
export type LineSeed = {
  key: string; brandKey: string; kind: LineKind; parentKey: string | null
  // Exact source category names. Empty for a node that exists only as the common
  // parent of its seeded children.
  categoryNames: string[]
}
export type BrandAlias = { sourceName: string; brandKey: string }

export type PlanInput = {
  // Applied taxonomy snapshot the plan is computed from.
  snapshotId?: string
  categories: SourceCategory[]
  manufacturers: SourceManufacturer[]
  categoryEdges: SourceCategoryEdge[]
  manufacturerEdges: SourceManufacturerEdge[]
  brands: ProBrand[]
  aliases: BrandAlias[]
  products: ProProduct[]
  seeds: LineSeed[]
  existing: {
    lines: ExistingLine[]
    categoryMappings: ExistingCategoryMapping[]
    manufacturerMappings: ExistingManufacturerMapping[]
    links: ExistingLink[]
  }
}

export type ReviewReason =
  | 'unknown_manufacturer' | 'unknown_brand_category' | 'seed_unresolved' | 'seed_brand_mismatch'
  | 'hierarchy_divergence' | 'unknown_root_line' | 'brand_vs_line_conflict' | 'ambiguous_new_series'
  | 'new_series_too_deep' | 'line_key_conflict' | 'product_brand_mismatch' | 'product_brand_unknown'
  | 'product_identity_ambiguous' | 'line_parent_changed'
export type ReviewItem = { reason: ReviewReason; subjectKey: string; details: Record<string, unknown> }

export type PlannedLine = {
  key: string; brandKey: string; parentKey: string | null; slug: string; names: LocalizedNames
  kind: LineKind; depth: number; sourceCategoryId: string; origin: 'audit_seed' | 'auto_child_series'
}
export type PlannedCategoryMapping = {
  sourceCategoryId: string; targetType: 'brand' | 'brand_line'; brandKey: string | null; lineKey: string | null
  origin: 'exact_name' | 'alias' | 'audit_seed' | 'auto_child_series'
}
export type PlannedLink = { productId: string; lineKey: string; sourceCategoryId: string }

export type BrandLinePlan = {
  brandsRootCategoryIds: string[]
  manufacturerMappings: Array<{ sourceManufacturerId: string; brandKey: string; origin: 'exact_name' | 'alias' }>
  categoryMappings: PlannedCategoryMapping[]
  lines: PlannedLine[]
  links: { create: PlannedLink[]; refresh: PlannedLink[]; markMissing: Array<{ productId: string; brandLineId: string }>; suppressedByAdmin: PlannedLink[] }
  // Effective membership per line key: direct links of the line and its descendants.
  linesByKey: Record<string, { key: string; parentKey: string | null; depth: number; directProducts: string[] }>
  newSeries: Array<{ sourceCategoryId: string; name: string; parentKey: string; status: 'auto' | 'review' | 'skipped_empty' | 'skipped_generic' }>
  genericCategories: { names: number; categories: number }
  reviews: ReviewItem[]
  stats: { skippedDeletedProducts: number; missingProducts: number; multiBranchProducts: number; ancestorLinksAvoided: number }
}

export function normalizeName(value: string): string {
  return value.normalize('NFKD').replace(/[̀-ͯ]/gu, '').replace(/[`´’‘]/gu, "'")
    .replace(/\s+/gu, ' ').trim().toUpperCase()
}

const UNKNOWN_BRAND = new Set(['', 'UNKNOWN', 'NAV', 'N/A'])

function brandResolver(brands: ProBrand[], aliases: BrandAlias[]): (name: string) => string | null {
  const byName = new Map<string, string>()
  for (const brand of brands) {
    byName.set(normalizeName(brand.name), brand.key)
    byName.set(normalizeName(brand.key), brand.key)
  }
  const known = new Set(brands.map(brand => brand.key))
  for (const alias of aliases) if (known.has(alias.brandKey)) byName.set(normalizeName(alias.sourceName), alias.brandKey)
  return name => byName.get(normalizeName(name)) ?? (known.has(brandSlug(name)) ? brandSlug(name) : null)
}

function lastSegment(key: string): string {
  return key.slice(key.lastIndexOf('/') + 1)
}

export function planBrandLines(input: PlanInput): BrandLinePlan {
  const reviews = new Map<string, ReviewItem>()
  const review = (reason: ReviewReason, subjectKey: string, details: Record<string, unknown>): void => {
    reviews.set(`${reason}\u0000${subjectKey}`, { reason, subjectKey, details })
  }
  const resolveBrand = brandResolver(input.brands, input.aliases)
  const aliasNames = new Set(input.aliases.map(alias => normalizeName(alias.sourceName)))

  const category = new Map(input.categories.map(row => [row.id, row]))
  const children = new Map<string, SourceCategory[]>()
  for (const row of input.categories) {
    if (!row.isPresent || row.parentId === null) continue
    const list = children.get(row.parentId) ?? []
    list.push(row)
    children.set(row.parentId, list)
  }
  const existingMapping = new Map(input.existing.categoryMappings.map(row => [row.sourceCategoryId, row]))
  const existingLineById = new Map(input.existing.lines.map(row => [row.id, row]))
  const existingLineByKey = new Map(input.existing.lines.map(row => [row.key, row]))
  const isRejected = (categoryId: string): boolean => {
    const mapping = existingMapping.get(categoryId)
    return mapping !== undefined && (mapping.status === 'rejected' || mapping.targetType === 'ignore')
  }

  // 1. Manufacturers -> brands (stable manufacturer IDs; admin decisions are kept).
  const manufacturerBrand = new Map<string, string>()
  const manufacturerMappings: BrandLinePlan['manufacturerMappings'] = []
  const existingManufacturer = new Map(input.existing.manufacturerMappings.map(row => [row.sourceManufacturerId, row]))
  for (const manufacturer of input.manufacturers) {
    const current = existingManufacturer.get(manufacturer.id)
    if (current) {
      if (current.status === 'confirmed' && current.brandKey) manufacturerBrand.set(manufacturer.id, current.brandKey)
      continue
    }
    if (!manufacturer.isPresent) continue
    const brandKey = resolveBrand(manufacturer.names.default)
    if (brandKey) {
      manufacturerBrand.set(manufacturer.id, brandKey)
      manufacturerMappings.push({ sourceManufacturerId: manufacturer.id, brandKey, origin: aliasNames.has(normalizeName(manufacturer.names.default)) ? 'alias' : 'exact_name' })
    } else {
      review('unknown_manufacturer', manufacturer.id, { name: manufacturer.names.default })
    }
  }
  const productManufacturerBrands = new Map<string, Set<string>>()
  for (const edge of input.manufacturerEdges) {
    const brandKey = edge.isPresent ? manufacturerBrand.get(edge.manufacturerId) : undefined
    if (!brandKey) continue
    const set = productManufacturerBrands.get(edge.productId) ?? new Set<string>()
    set.add(brandKey)
    productManufacturerBrands.set(edge.productId, set)
  }

  // 2. Brand categories: present children of the root(s) whose children are mostly brands.
  const roots = input.categories.filter(row => row.isPresent && row.parentId === null)
  const brandsRootCategoryIds = roots.filter(root => {
    const list = children.get(root.id) ?? []
    return list.length >= BRANDS_ROOT_MIN_CHILDREN
      && list.filter(child => resolveBrand(child.names.default)).length / list.length >= BRANDS_ROOT_MIN_SHARE
  }).map(root => root.id)
  const categoryBrand = new Map<string, string>()
  const categoryMappings: PlannedCategoryMapping[] = []
  for (const rootId of brandsRootCategoryIds) {
    for (const child of children.get(rootId) ?? []) {
      const current = existingMapping.get(child.id)
      if (current) {
        if (current.status === 'confirmed' && current.targetType === 'brand' && current.brandKey) categoryBrand.set(child.id, current.brandKey)
        continue
      }
      const brandKey = resolveBrand(child.names.default)
      if (brandKey) {
        categoryBrand.set(child.id, brandKey)
        categoryMappings.push({
          sourceCategoryId: child.id, targetType: 'brand', brandKey, lineKey: null,
          origin: aliasNames.has(normalizeName(child.names.default)) ? 'alias' : 'exact_name',
        })
      } else {
        review('unknown_brand_category', child.id, { name: child.names.default })
      }
    }
  }
  const brandsPerChildName = new Map<string, Set<string>>()
  for (const [brandCategoryId, brandKey] of categoryBrand) {
    for (const child of children.get(brandCategoryId) ?? []) {
      const name = normalizeName(child.names.default)
      const set = brandsPerChildName.get(name) ?? new Set<string>()
      set.add(brandKey)
      brandsPerChildName.set(name, set)
    }
  }
  const genericNames = new Set([...brandsPerChildName].filter(([, set]) => set.size >= GENERIC_CATEGORY_MIN_BRANDS).map(([name]) => name))
  const isGeneric = (row: SourceCategory): boolean => genericNames.has(normalizeName(row.names.default))
  const genericCategories = { names: genericNames.size, categories: 0 }

  const brandOfCategory = (categoryId: string): string | null => {
    let current = category.get(categoryId)
    for (let guard = 0; current && guard < 32; guard++) {
      const brandKey = categoryBrand.get(current.id)
      if (brandKey) return brandKey
      current = current.parentId ? category.get(current.parentId) : undefined
    }
    return null
  }
  const subtree = (rootId: string): SourceCategory[] => {
    const out: SourceCategory[] = []
    const stack = [...(children.get(rootId) ?? [])]
    while (stack.length) {
      const next = stack.pop()!
      out.push(next)
      stack.push(...(children.get(next.id) ?? []))
    }
    return out
  }

  // 3. Line categories: existing confirmed mappings first, then resolved seeds.
  type LineNode = { key: string; brandKey: string; categoryId: string; existingId: string | null; kind: LineKind; seedParentKey?: string | null; origin: PlannedLine['origin'] | 'existing' }
  const lineByCategory = new Map<string, LineNode>()
  for (const mapping of input.existing.categoryMappings) {
    if (mapping.status !== 'confirmed' || mapping.targetType !== 'brand_line' || !mapping.brandLineId) continue
    const line = existingLineById.get(mapping.brandLineId)
    if (line) lineByCategory.set(mapping.sourceCategoryId, { key: line.key, brandKey: line.brandKey, categoryId: mapping.sourceCategoryId, existingId: line.id, kind: line.kind, origin: 'existing' })
  }
  const mappedLineKeys = new Set([...lineByCategory.values()].map(node => node.key))
  const seedCategory = new Map<string, string>()
  const brandCategoriesOf = (brandKey: string): string[] => [...categoryBrand].filter(([, key]) => key === brandKey).map(([id]) => id)
  for (const seed of input.seeds.filter(row => row.categoryNames.length > 0)) {
    if (mappedLineKeys.has(seed.key)) continue
    const names = new Set(seed.categoryNames.map(normalizeName))
    const matches = brandCategoriesOf(seed.brandKey).flatMap(subtree).filter(row => names.has(normalizeName(row.names.default)))
    if (matches.length !== 1) {
      review('seed_unresolved', seed.key, { matches: matches.map(row => row.id), categoryNames: seed.categoryNames })
      continue
    }
    seedCategory.set(seed.key, matches[0].id)
  }
  for (const seed of input.seeds.filter(row => row.categoryNames.length === 0)) {
    if (mappedLineKeys.has(seed.key)) continue
    const childIds = input.seeds.filter(row => row.parentKey === seed.key).map(row => seedCategory.get(row.key))
    const parents = new Set(childIds.map(id => (id ? category.get(id)?.parentId ?? null : null)))
    const parentId = parents.size === 1 ? [...parents][0] : null
    if (!parentId || childIds.some(id => !id) || brandOfCategory(parentId) !== seed.brandKey || categoryBrand.has(parentId)) {
      review('seed_unresolved', seed.key, { reason: 'derived node has no single common parent category below the brand' })
      continue
    }
    seedCategory.set(seed.key, parentId)
  }
  for (const seed of input.seeds) {
    const categoryId = seedCategory.get(seed.key)
    if (!categoryId) continue
    if (isRejected(categoryId) || lineByCategory.has(categoryId)) continue
    if (brandOfCategory(categoryId) !== seed.brandKey) {
      review('seed_brand_mismatch', seed.key, { sourceCategoryId: categoryId, sourceBrand: brandOfCategory(categoryId) })
      continue
    }
    lineByCategory.set(categoryId, { key: seed.key, brandKey: seed.brandKey, categoryId, existingId: null, kind: seed.kind, seedParentKey: seed.parentKey, origin: 'audit_seed' })
  }

  // 4. Derive each line's parent from the source hierarchy (nearest line ancestor).
  const parentLineCategory = (categoryId: string): string | null => {
    let current = category.get(category.get(categoryId)?.parentId ?? '')
    for (let guard = 0; current && guard < 32; guard++) {
      if (lineByCategory.has(current.id)) return current.id
      if (categoryBrand.has(current.id)) return null
      current = current.parentId ? category.get(current.parentId) : undefined
    }
    return null
  }
  const lines: PlannedLine[] = []
  const linesByKey: BrandLinePlan['linesByKey'] = {}
  const plannedKeys = new Set<string>()
  const ordered = [...lineByCategory.values()]
  const depthOf = new Map<string, number>()
  const resolveDepth = (node: LineNode, guard = 0): number => {
    if (depthOf.has(node.categoryId)) return depthOf.get(node.categoryId)!
    const parentCategory = parentLineCategory(node.categoryId)
    const depth = parentCategory && guard < 32 ? resolveDepth(lineByCategory.get(parentCategory)!, guard + 1) + 1 : 1
    depthOf.set(node.categoryId, depth)
    return depth
  }
  ordered.sort((a, b) => resolveDepth(a) - resolveDepth(b) || a.key.localeCompare(b.key))
  for (const node of ordered) {
    const parentCategory = parentLineCategory(node.categoryId)
    const parentKey = parentCategory ? lineByCategory.get(parentCategory)!.key : null
    const depth = resolveDepth(node)
    linesByKey[node.key] = { key: node.key, parentKey, depth, directProducts: [] }
    if (node.existingId) {
      const existing = existingLineById.get(node.existingId)!
      const existingParentKey = existing.parentId ? existingLineById.get(existing.parentId)?.key ?? null : null
      if (existingParentKey !== parentKey) {
        review('line_parent_changed', node.key, { sourceParentKey: parentKey, currentParentKey: existingParentKey, adminLocked: existing.adminLocked })
        linesByKey[node.key].parentKey = existingParentKey
        linesByKey[node.key].depth = existing.depth
      }
      continue
    }
    if (node.seedParentKey !== undefined && node.seedParentKey !== parentKey) {
      review('hierarchy_divergence', node.key, { seedParentKey: node.seedParentKey, sourceParentKey: parentKey, sourceCategoryId: node.categoryId })
    }
    const taken = existingLineByKey.get(node.key)
    if (taken || plannedKeys.has(node.key)) {
      review('line_key_conflict', node.key, { sourceCategoryId: node.categoryId, existingLineId: taken?.id ?? null })
      lineByCategory.delete(node.categoryId)
      delete linesByKey[node.key]
      continue
    }
    plannedKeys.add(node.key)
    const source = category.get(node.categoryId)!
    lines.push({
      key: node.key, brandKey: node.brandKey, parentKey, slug: lastSegment(node.key), names: source.names,
      kind: node.kind, depth, sourceCategoryId: node.categoryId, origin: node.origin === 'existing' ? 'audit_seed' : node.origin,
    })
    categoryMappings.push({ sourceCategoryId: node.categoryId, targetType: 'brand_line', brandKey: null, lineKey: node.key, origin: node.origin === 'existing' ? 'audit_seed' : node.origin })
  }

  // 5. Product resolution and brand consistency.
  const productById = new Map(input.products.map(row => [row.id, row]))
  const stats = { skippedDeletedProducts: 0, missingProducts: 0, multiBranchProducts: 0, ancestorLinksAvoided: 0 }
  const resolveProduct = (legacyId: string): ProProduct | null | 'ambiguous' => {
    const plain = productById.get(legacyId)
    const prefixed = productById.get(`nop390-${legacyId}`)
    if (plain && prefixed) return 'ambiguous'
    return plain ?? prefixed ?? null
  }
  const productsInCategory = new Map<string, string[]>()
  for (const edge of input.categoryEdges) {
    if (!edge.isPresent) continue
    const list = productsInCategory.get(edge.categoryId) ?? []
    list.push(edge.productId)
    productsInCategory.set(edge.categoryId, list)
  }
  type BrandFit = 'match' | 'unknown' | 'mismatch'
  const brandFit = (legacyId: string, product: ProProduct, brandKey: string): BrandFit => {
    const resolved = resolveBrand(product.brand)
    if (resolved) return resolved === brandKey ? 'match' : 'mismatch'
    if (!UNKNOWN_BRAND.has(normalizeName(product.brand))) return 'mismatch'
    const fromSource = productManufacturerBrands.get(legacyId)
    if (fromSource && fromSource.size > 0 && !fromSource.has(brandKey)) return 'mismatch'
    return 'unknown'
  }

  // 6. New child series of confirmed lines (breadth-first, so series of new series follow).
  const newSeries: BrandLinePlan['newSeries'] = []
  const queue = [...lineByCategory.keys()]
  while (queue.length) {
    const parentCategoryId = queue.shift()!
    const parentNode = lineByCategory.get(parentCategoryId)!
    for (const child of children.get(parentCategoryId) ?? []) {
      if (lineByCategory.has(child.id) || existingMapping.has(child.id)) continue
      const parentInfo = linesByKey[parentNode.key]
      if (!parentInfo) continue
      const name = child.names.default
      const legacyIds = productsInCategory.get(child.id) ?? []
      const fits = legacyIds.map(id => {
        const product = resolveProduct(id)
        return product && product !== 'ambiguous' && !product.isDeleted ? brandFit(id, product, parentNode.brandKey) : null
      }).filter((fit): fit is BrandFit => fit !== null)
      if (isGeneric(child)) {
        newSeries.push({ sourceCategoryId: child.id, name, parentKey: parentNode.key, status: 'skipped_generic' })
        continue
      }
      if (fits.length === 0 && (children.get(child.id) ?? []).length === 0) {
        newSeries.push({ sourceCategoryId: child.id, name, parentKey: parentNode.key, status: 'skipped_empty' })
        continue
      }
      const depth = parentInfo.depth + 1
      const key = `${parentNode.key}/${brandSlug(name)}`
      const otherBrand = resolveBrand(name)
      const siblingClash = plannedKeys.has(key) || existingLineByKey.has(key)
      if (depth > MAX_LINE_DEPTH) {
        review('new_series_too_deep', child.id, { name, parentKey: parentNode.key, depth })
        newSeries.push({ sourceCategoryId: child.id, name, parentKey: parentNode.key, status: 'review' })
        continue
      }
      if (fits.some(fit => fit === 'mismatch') || (otherBrand && otherBrand !== parentNode.brandKey) || siblingClash || !brandSlug(name)) {
        review('ambiguous_new_series', child.id, {
          name, parentKey: parentNode.key, products: legacyIds.length,
          mismatchedProducts: fits.filter(fit => fit === 'mismatch').length, otherBrand, siblingClash,
        })
        newSeries.push({ sourceCategoryId: child.id, name, parentKey: parentNode.key, status: 'review' })
        continue
      }
      plannedKeys.add(key)
      lineByCategory.set(child.id, { key, brandKey: parentNode.brandKey, categoryId: child.id, existingId: null, kind: 'series', origin: 'auto_child_series' })
      linesByKey[key] = { key, parentKey: parentNode.key, depth, directProducts: [] }
      lines.push({ key, brandKey: parentNode.brandKey, parentKey: parentNode.key, slug: lastSegment(key), names: child.names, kind: 'series', depth, sourceCategoryId: child.id, origin: 'auto_child_series' })
      categoryMappings.push({ sourceCategoryId: child.id, targetType: 'brand_line', brandKey: null, lineKey: key, origin: 'auto_child_series' })
      newSeries.push({ sourceCategoryId: child.id, name, parentKey: parentNode.key, status: 'auto' })
      queue.push(child.id)
    }
  }

  // 7. Unmapped categories directly under a brand are possible root lines: review only.
  for (const [brandCategoryId, brandKey] of categoryBrand) {
    for (const child of children.get(brandCategoryId) ?? []) {
      if (lineByCategory.has(child.id) || existingMapping.has(child.id)) continue
      if (isGeneric(child)) { genericCategories.categories++; continue }
      const products = subtree(child.id).concat(child).reduce((sum, row) => sum + (productsInCategory.get(row.id)?.length ?? 0), 0)
      if (products === 0) continue
      const otherBrand = resolveBrand(child.names.default)
      if (otherBrand && otherBrand !== brandKey) review('brand_vs_line_conflict', child.id, { name: child.names.default, brandKey, otherBrand, products })
      else review('unknown_root_line', child.id, { name: child.names.default, brandKey, products })
    }
  }

  // 8. Direct product links: deepest line only; admin decisions win.
  const lineDepth = (key: string): number => linesByKey[key]?.depth ?? 0
  const ancestorsOf = (key: string): Set<string> => {
    const out = new Set<string>()
    let parent = linesByKey[key]?.parentKey ?? null
    for (let guard = 0; parent && guard < 32; guard++) { out.add(parent); parent = linesByKey[parent]?.parentKey ?? null }
    return out
  }
  const candidates = new Map<string, Map<string, string>>() // productId -> lineKey -> sourceCategoryId
  for (const edge of input.categoryEdges) {
    if (!edge.isPresent) continue
    const node = lineByCategory.get(edge.categoryId)
    if (!node || !linesByKey[node.key]) continue
    const product = resolveProduct(edge.productId)
    if (product === 'ambiguous') { review('product_identity_ambiguous', edge.productId, { lineKey: node.key }); continue }
    if (!product) { stats.missingProducts++; continue }
    if (product.isDeleted) { stats.skippedDeletedProducts++; continue }
    const fit = brandFit(edge.productId, product, node.brandKey)
    if (fit === 'mismatch') {
      review('product_brand_mismatch', `${product.id}:${node.key}`, { productId: product.id, lineKey: node.key, productBrand: product.brand })
      continue
    }
    if (fit === 'unknown') review('product_brand_unknown', product.id, { productId: product.id, lineKey: node.key, productBrand: product.brand })
    const map = candidates.get(product.id) ?? new Map<string, string>()
    map.set(node.key, edge.categoryId)
    candidates.set(product.id, map)
  }
  const desired: PlannedLink[] = []
  for (const [productId, map] of candidates) {
    const keys = [...map.keys()]
    const covered = new Set(keys.flatMap(key => [...ancestorsOf(key)]))
    const deepest = keys.filter(key => !covered.has(key))
    stats.ancestorLinksAvoided += keys.length - deepest.length
    const roots = new Set(deepest.map(key => { let top = key; let parent = linesByKey[top].parentKey; while (parent) { top = parent; parent = linesByKey[top].parentKey } return top }))
    if (roots.size > 1) stats.multiBranchProducts++
    for (const key of deepest.sort((a, b) => lineDepth(b) - lineDepth(a) || a.localeCompare(b))) {
      desired.push({ productId, lineKey: key, sourceCategoryId: map.get(key)! })
      linesByKey[key].directProducts.push(productId)
    }
  }
  const lineIdByKey = new Map(input.existing.lines.map(row => [row.key, row.id]))
  const existingLink = new Map(input.existing.links.map(row => [`${row.productId}\u0000${row.brandLineId}`, row]))
  const create: PlannedLink[] = []
  const refresh: PlannedLink[] = []
  const suppressedByAdmin: PlannedLink[] = []
  const desiredExisting = new Set<string>()
  for (const link of desired) {
    const lineId = lineIdByKey.get(link.lineKey)
    const current = lineId ? existingLink.get(`${link.productId}\u0000${lineId}`) : undefined
    if (!current) { create.push(link); continue }
    desiredExisting.add(`${link.productId}\u0000${lineId}`)
    if (current.origin === 'admin') continue
    if (current.status === 'excluded') { suppressedByAdmin.push(link); continue }
    if (!current.isPresentInSource || current.sourceCategoryId !== link.sourceCategoryId) refresh.push(link)
  }
  // A miss is counted once per snapshot: a rerun on the same snapshot changes nothing.
  const markMissing = input.existing.links
    .filter(row => row.origin === 'source_sync' && row.status === 'active' && !desiredExisting.has(`${row.productId}\u0000${row.brandLineId}`))
    .filter(row => input.snapshotId === undefined || row.lastCheckedSnapshotId !== input.snapshotId)
    .map(row => ({ productId: row.productId, brandLineId: row.brandLineId }))

  for (const key of Object.keys(linesByKey)) linesByKey[key].directProducts.sort()
  return {
    brandsRootCategoryIds, manufacturerMappings, categoryMappings, lines,
    links: { create, refresh, markMissing, suppressedByAdmin }, linesByKey, newSeries, genericCategories,
    reviews: [...reviews.values()].sort((a, b) => a.reason.localeCompare(b.reason) || a.subjectKey.localeCompare(b.subjectKey)),
    stats,
  }
}

// Effective membership of a line = its direct products plus those of all descendants.
export function effectiveProducts(plan: Pick<BrandLinePlan, 'linesByKey'>, key: string): string[] {
  const out = new Set(plan.linesByKey[key]?.directProducts ?? [])
  for (const line of Object.values(plan.linesByKey)) {
    let parent = line.parentKey
    for (let guard = 0; parent && guard < 32; guard++) {
      if (parent === key) { for (const id of line.directProducts) out.add(id); break }
      parent = plan.linesByKey[parent]?.parentKey ?? null
    }
  }
  return [...out].sort()
}
