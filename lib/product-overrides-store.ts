import { cache } from 'react';
import { type Product } from '@/data/products';
import { prisma, type ExtendedTransactionClient } from '@/lib/prisma';
import { Prisma } from '@/generated/prisma/client';
import { attachCampaignOffers, readPromoCampaigns } from '@/lib/promo-campaigns';
import { ERP_PRICE_LOCKED_OVERRIDE_FIELDS, toStorefrontProducts } from '@/lib/product-sellability';
import {
    mapDbToProduct,
    mapProductToDbCreate,
    STOREFRONT_PRODUCT_SELECT,
    type StorefrontProductRow,
} from '@/lib/product-overrides-mapping';
import {
    mapStorefrontCardRow,
    mapStorefrontFacetRow,
    mapStorefrontFilterIndexRow,
    STOREFRONT_CARD_SELECT,
    STOREFRONT_FACET_SELECT,
    STOREFRONT_FILTER_INDEX_SELECT,
    STOREFRONT_WHERE,
    type StorefrontCardRow,
    type StorefrontFilterIndexRow,
} from '@/lib/product-storefront-rows';

export type ProductOverride = Partial<Omit<Product, 'id'>>;

export function applyProductOverride(
    base: Product,
    override: ProductOverride | undefined
): Product {
    if (!override) return base;
    // Sellability state is DB-derived only; a stored override can never re-enable a price.
    const { priceUnavailable: _unavailable, erpPriceMissing: _missing, manualPriceApproved: _approved, manualApprovedPrice: _approvedPrice, ...safeOverride } = override;
    // Without an ERP price the only sellable price is the approved Product.price, which is
    // also what checkout charges — an override must not show a different one.
    if (base.erpPriceMissing) {
        for (const field of ERP_PRICE_LOCKED_OVERRIDE_FIELDS) delete (safeOverride as Record<string, unknown>)[field];
    }
    return { ...base, ...safeOverride };
}

export function mergeProductsWithOverrides(
    products: Product[],
    overrides: Record<string, ProductOverride>
): Product[] {
    return products.map((p) => applyProductOverride(p, overrides[p.id]));
}

export type ArchivedProductRecord = {
    id: string;
    product: Product;
    source: 'base' | 'custom';
    deletedAt: string;
};

const DELETED_ARCHIVE_KEY = 'deleted-products-archive';

async function normalizeMergedRows(
    rows: StorefrontProductRow[],
    overrides?: Record<string, ProductOverride>,
): Promise<Product[]> {
    const [resolvedOverrides, campaigns] = await Promise.all([
        overrides ?? getProductOverrides().catch(() => ({})),
        readPromoCampaigns(prisma),
    ]);
    const merged = mergeProductsWithOverrides(rows.map(mapDbToProduct), resolvedOverrides);
    return attachCampaignOffers(merged, campaigns);
}

async function normalizeStorefrontRows(
    rows: StorefrontProductRow[],
    overrides?: Record<string, ProductOverride>,
): Promise<Product[]> {
    return toStorefrontProducts(await normalizeMergedRows(rows, overrides));
}

async function normalizeStorefrontCardRows(
    rows: StorefrontCardRow[],
    existingOverrides?: Record<string, ProductOverride>,
): Promise<Product[]> {
    const [overrides, campaigns] = await Promise.all([
        existingOverrides ?? getProductOverrides().catch(() => ({})),
        readPromoCampaigns(prisma),
    ]);
    const products = rows.map(mapStorefrontCardRow);
    return toStorefrontProducts(attachCampaignOffers(mergeProductsWithOverrides(products, overrides), campaigns));
}

function normalizeStorefrontFilterIndexRows(
    rows: StorefrontFilterIndexRow[],
    overrides: Record<string, ProductOverride>,
): Product[] {
    return toStorefrontProducts(mergeProductsWithOverrides(rows.map(mapStorefrontFilterIndexRow), overrides));
}

const getDbProducts = cache(async (): Promise<Product[]> => {
    const [rows, overrides] = await Promise.all([
        prisma.product.findMany({
            where: STOREFRONT_WHERE,
            orderBy: { createdAt: 'desc' },
            select: STOREFRONT_PRODUCT_SELECT,
        }),
        getProductOverrides().catch(() => ({})),
    ]);
    return normalizeMergedRows(rows, overrides);
});

// Fast path uses SQL filters and pagination. If an override changes a field used by
// the current filter, the fallback scans only filter-index columns and still fetches
// full storefront data for the bounded result page, preserving override semantics.
export async function getDbProductsPaginated(opts: {
    category?: string;
    skip?: number;
    take?: number;
    ids?: string[];
    search?: string;
    searchLocalizedTitles?: boolean;
    searchLanguage?: 'ru' | 'en' | 'lv';
    searchExtendedFields?: boolean;
    minPrice?: number;
    maxPrice?: number;
    brandNames?: string[];
    orderBy?: Prisma.ProductOrderByWithRelationInput | Prisma.ProductOrderByWithRelationInput[];
    projection?: 'full' | 'card';
}): Promise<{ products: Product[]; total: number }> {
    const search = opts.search?.trim();
    const localizedSearchFields = opts.searchLanguage !== undefined
        ? opts.searchLanguage === 'en' ? ['titleEn' as const] : opts.searchLanguage === 'lv' ? ['titleLv' as const] : []
        : opts.searchLocalizedTitles ? ['titleEn' as const, 'titleLv' as const] : [];
    const price = opts.minPrice !== undefined || opts.maxPrice !== undefined
        ? { ...(opts.minPrice !== undefined ? { gte: opts.minPrice } : {}), ...(opts.maxPrice !== undefined ? { lte: opts.maxPrice } : {}) }
        : undefined;
    const where: Prisma.ProductWhereInput = {
        isDeleted: false,
        isActive: true,
        ...(opts.category ? { category: opts.category } : {}),
        ...(opts.ids ? { id: { in: opts.ids } } : {}),
        ...(opts.brandNames ? { brand: { in: opts.brandNames } } : {}),
        ...(price ? { price } : {}),
        ...(search ? {
            OR: [
                { title: { contains: search, mode: 'insensitive' } },
                ...localizedSearchFields.map((field) => ({ [field]: { contains: search, mode: 'insensitive' as const } })),
                { brand: { contains: search, mode: 'insensitive' } },
                ...(opts.searchExtendedFields === false ? [] : [
                    { sku: { contains: search, mode: 'insensitive' as const } },
                    { description: { contains: search, mode: 'insensitive' as const } },
                ]),
            ],
        } : {}),
    };
    const overrides = await getProductOverrides().catch(() => ({}));
    const relevantOverrideFields = new Set<string>();
    if (opts.category) relevantOverrideFields.add('category');
    if (opts.brandNames) relevantOverrideFields.add('brand');
    if (opts.minPrice !== undefined || opts.maxPrice !== undefined) relevantOverrideFields.add('price');
    if (search) {
        relevantOverrideFields.add('title');
        relevantOverrideFields.add('brand');
        for (const field of localizedSearchFields) relevantOverrideFields.add(field);
        if (opts.searchExtendedFields !== false) {
            relevantOverrideFields.add('sku');
            relevantOverrideFields.add('description');
        }
    }
    const needsOverrideFallback = relevantOverrideFields.size > 0 && Object.values(overrides).some((override) =>
        Object.keys(override).some((field) => relevantOverrideFields.has(field))
    );

    if (needsOverrideFallback) {
        const indexRows = await prisma.product.findMany({
            where: STOREFRONT_WHERE,
            orderBy: { createdAt: 'desc' },
            select: STOREFRONT_FILTER_INDEX_SELECT,
        });
        const query = search?.toLocaleLowerCase();
        const filtered = normalizeStorefrontFilterIndexRows(indexRows, overrides).filter((product) => {
            if (opts.ids && !opts.ids.includes(product.id)) return false;
            if (opts.category && product.category !== opts.category) return false;
            if (opts.brandNames && !opts.brandNames.includes(product.brand)) return false;
            if (opts.minPrice !== undefined && !(product.price >= opts.minPrice)) return false;
            if (opts.maxPrice !== undefined && !(product.price <= opts.maxPrice)) return false;
            if (query) {
                const fields = [
                    product.title,
                    product.brand,
                    ...localizedSearchFields.map((field) => product[field]),
                    ...(opts.searchExtendedFields === false ? [] : [product.sku, product.description]),
                ];
                if (!fields.some((field) => field?.toLocaleLowerCase().includes(query))) return false;
            }
            return true;
        });
        const pageIds = filtered.slice(opts.skip ?? 0, opts.take === undefined ? undefined : (opts.skip ?? 0) + opts.take)
            .map((product) => product.id);
        if (!pageIds.length) return { products: [], total: filtered.length };
        const pageProducts = opts.projection === 'card'
            ? await prisma.product.findMany({
                where: { id: { in: pageIds }, ...STOREFRONT_WHERE },
                select: STOREFRONT_CARD_SELECT,
            }).then((rows) => normalizeStorefrontCardRows(rows, overrides))
            : await prisma.product.findMany({
                where: { id: { in: pageIds }, ...STOREFRONT_WHERE },
                select: STOREFRONT_PRODUCT_SELECT,
            }).then((rows) => normalizeStorefrontRows(rows, overrides));
        const byId = new Map(pageProducts.map((product) => [product.id, product]));
        return {
            products: pageIds.flatMap((id) => byId.get(id) ? [byId.get(id)!] : []),
            total: filtered.length,
        };
    }

    if (opts.projection === 'card') {
        const [rows, total] = await Promise.all([
            prisma.product.findMany({
                where,
                orderBy: opts.orderBy ?? { createdAt: 'desc' },
                skip: opts.skip,
                take: opts.take,
                select: STOREFRONT_CARD_SELECT,
            }),
            prisma.product.count({ where }),
        ]);
        return { products: await normalizeStorefrontCardRows(rows, overrides), total };
    }

    const [rows, total] = await Promise.all([
        prisma.product.findMany({
            where,
            orderBy: opts.orderBy ?? { createdAt: 'desc' },
            skip: opts.skip,
            take: opts.take,
            select: STOREFRONT_PRODUCT_SELECT,
        }),
        prisma.product.count({ where }),
    ]);
    return { products: await normalizeStorefrontRows(rows, overrides), total };
}

/** One public Product row; memoized across metadata and page rendering. */
export const getMergedProductById = cache(async (productId: string): Promise<Product | null> => {
    const id = productId.trim();
    if (!id) return null;
    const row = await prisma.product.findFirst({
        where: { id, ...STOREFRONT_WHERE },
        select: STOREFRONT_PRODUCT_SELECT,
    });
    if (!row) return null;
    return (await normalizeStorefrontRows([row]))[0] ?? null;
});

/** Bounded batch lookup. Result order follows `ids`, not database order. */
export async function getMergedProductsByIds(ids: string[]): Promise<Product[]> {
    const boundedIds = [...new Set(ids.map((id) => id.trim()).filter(Boolean))].slice(0, 100);
    if (!boundedIds.length) return [];
    const rows = await prisma.product.findMany({
        where: { id: { in: boundedIds }, ...STOREFRONT_WHERE },
        select: STOREFRONT_CARD_SELECT,
    });
    const products = await normalizeStorefrontCardRows(rows);
    const byId = new Map(products.map((product) => [product.id, product]));
    return boundedIds.flatMap((id) => byId.get(id) ? [byId.get(id)!] : []);
}

export async function getRelatedStorefrontProducts(product: Product, take = 4): Promise<Product[]> {
    const explicit = await getMergedProductsByIds(product.relatedProductIds ?? []);
    if (explicit.length) return explicit.filter((candidate) => candidate.id !== product.id).slice(0, take);

    const groups = await Promise.all([
        prisma.product.findMany({
            where: { ...STOREFRONT_WHERE, id: { not: product.id }, brand: product.brand, category: product.category },
            orderBy: { createdAt: 'desc' }, take, select: STOREFRONT_CARD_SELECT,
        }),
        prisma.product.findMany({
            where: { ...STOREFRONT_WHERE, id: { not: product.id }, brand: product.brand, category: { not: product.category } },
            orderBy: { createdAt: 'desc' }, take, select: STOREFRONT_CARD_SELECT,
        }),
        prisma.product.findMany({
            where: { ...STOREFRONT_WHERE, id: { not: product.id }, category: product.category, brand: { not: product.brand } },
            orderBy: { createdAt: 'desc' }, take, select: STOREFRONT_CARD_SELECT,
        }),
    ]);
    const normalized = await normalizeStorefrontCardRows(groups.flat());
    return [...new Map(normalized.map((candidate) => [candidate.id, candidate])).values()].slice(0, take);
}

export async function getBoughtTogetherStorefrontProducts(
    product: Product,
    copurchaseIds: string[],
    take = 4,
): Promise<Product[]> {
    const explicit = await getMergedProductsByIds(product.oftenBoughtTogether ?? []);
    if (explicit.length) return explicit.filter((candidate) => candidate.id !== product.id).slice(0, take);
    return (await getMergedProductsByIds(copurchaseIds)).filter((candidate) => candidate.id !== product.id).slice(0, take);
}

/** Whole-catalog row count is intentional: facets need it, but heavy columns never leave Neon. */
export const getStorefrontFacetProducts = cache(async (): Promise<Product[]> => {
    const [rows, overrides, campaigns] = await Promise.all([
        prisma.product.findMany({ where: STOREFRONT_WHERE, orderBy: { createdAt: 'desc' }, select: STOREFRONT_FACET_SELECT }),
        getProductOverrides().catch(() => ({})),
        readPromoCampaigns(prisma),
    ]);
    const products = rows.map(mapStorefrontFacetRow);
    return toStorefrontProducts(attachCampaignOffers(mergeProductsWithOverrides(products, overrides), campaigns));
});

export async function getStorefrontBrandNames(): Promise<string[]> {
    const [rows, overrides] = await Promise.all([prisma.product.findMany({
        where: STOREFRONT_WHERE,
        distinct: ['brand'],
        select: { brand: true },
    }), getProductOverrides().catch(() => ({} as Record<string, ProductOverride>))]);
    // Candidate names include override-only brands. The paginated helper checks
    // effective brands against active products before counting or returning them.
    return [...new Set([
        ...rows.map((row) => row.brand),
        ...Object.values(overrides).flatMap((override) => typeof override.brand === 'string' ? [override.brand] : []),
    ])];
}

export async function getPublicProductSitemapRows(): Promise<Array<{ id: string; updatedAt: Date }>> {
    return prisma.product.findMany({
        where: STOREFRONT_WHERE,
        orderBy: { id: 'asc' },
        select: { id: true, updatedAt: true },
    });
}

export async function getPublicProductCategories(): Promise<string[]> {
    const rows = await prisma.product.findMany({
        where: STOREFRONT_WHERE,
        distinct: ['category'],
        orderBy: { category: 'asc' },
        select: { category: true },
    });
    return rows.map((row) => row.category);
}

export async function getActiveProductIds(): Promise<string[]> {
    const rows = await prisma.product.findMany({
        where: STOREFRONT_WHERE,
        select: { id: true },
    });
    return rows.map((row) => row.id);
}

export async function getInvoiceProductTitlesByIds(
    productIds: string[],
): Promise<Array<{ id: string; titleEn?: string; titleLv?: string }>> {
    const ids = [...new Set(productIds.map((id) => id.trim()).filter(Boolean))];
    if (!ids.length) return [];
    const overrides = await getProductOverrides().catch(() => ({} as Record<string, ProductOverride>));
    const rows: Array<{ id: string; titleEn: string | null; titleLv: string | null }> = [];
    // Admin orders allow up to 500 lines: retain every ID, bounding each query
    // to 100 translations and keeping only one batch in flight.
    for (let offset = 0; offset < ids.length; offset += 100) {
        rows.push(...await prisma.product.findMany({
            where: { id: { in: ids.slice(offset, offset + 100) }, ...STOREFRONT_WHERE },
            select: { id: true, titleEn: true, titleLv: true },
        }));
    }
    return rows.map((row) => ({
        id: row.id,
        titleEn: overrides[row.id]?.titleEn ?? row.titleEn ?? undefined,
        titleLv: overrides[row.id]?.titleLv ?? row.titleLv ?? undefined,
    }));
}

// Storefront/public catalog: products without a valid B2B price carry no monetary fields.
export const getMergedProducts = cache(async (): Promise<Product[]> => {
    return toStorefrontProducts(await getDbProducts());
});

// Admin-only full export that must see the stored local price for every active product.
export const getMergedProductsWithPrices = cache(async (): Promise<Product[]> => {
    return getDbProducts();
});

// Для админки: без фильтра isActive, иначе скрытые товары нельзя ни увидеть, ни включить обратно.
export const getAdminProducts = cache(async (): Promise<Product[]> => {
    const [rows, overrides] = await Promise.all([
        prisma.product.findMany({ where: { isDeleted: false }, orderBy: { createdAt: 'desc' } }),
        getProductOverrides().catch(() => ({})),
    ]);
    return mergeProductsWithOverrides(rows.map(mapDbToProduct), overrides);
});

export async function getAdminProductById(productId: string): Promise<Product | null> {
    const id = productId.trim();
    if (!id) return null;
    const [row, overrides]: [StorefrontProductRow | null, Record<string, ProductOverride>] = await Promise.all([
        prisma.product.findFirst({
            where: { id, isDeleted: false },
            select: STOREFRONT_PRODUCT_SELECT,
        }),
        getProductOverrides().catch(() => ({})),
    ]);
    if (!row) return null;
    return applyProductOverride(mapDbToProduct(row), overrides[id]);
}

export async function getDuplicateProductMetadataFlags(
    productId: string,
    metaTitle?: string | null,
    metaDescription?: string | null,
): Promise<{ duplicateMetaTitle: boolean; duplicateMetaDescription: boolean }> {
    const normalize = (value: string | null | undefined): string => value?.trim().toLocaleLowerCase() ?? '';
    const normalizedTitle = normalize(metaTitle);
    const normalizedDescription = normalize(metaDescription);
    if (!normalizedTitle && !normalizedDescription) {
        return { duplicateMetaTitle: false, duplicateMetaDescription: false };
    }
    const rows = await prisma.product.findMany({
        where: { isDeleted: false, id: { not: productId } },
        select: { id: true, metaTitle: true, metaDescription: true },
    });
    return {
        duplicateMetaTitle: Boolean(normalizedTitle && rows.some((row) => normalize(row.metaTitle) === normalizedTitle)),
        duplicateMetaDescription: Boolean(normalizedDescription && rows.some((row) => normalize(row.metaDescription) === normalizedDescription)),
    };
}

export async function getAdminProductsPaginated(opts: {
    search?: string;
    category?: string;
    visibility?: 'active' | 'hidden';
    skip: number;
    take: number;
}): Promise<{ products: Product[]; total: number }> {
    const search = opts.search?.trim();
    const category = opts.category?.trim();
    const where: Prisma.ProductWhereInput = {
        isDeleted: false,
        ...(opts.visibility ? { isActive: opts.visibility === 'active' } : {}),
        ...(category ? { category } : {}),
        ...(search
            ? {
                OR: [
                    { id: { contains: search, mode: 'insensitive' } },
                    { sku: { contains: search, mode: 'insensitive' } },
                    { title: { contains: search, mode: 'insensitive' } },
                    { brand: { contains: search, mode: 'insensitive' } },
                    { category: { contains: search, mode: 'insensitive' } },
                ],
            }
            : {}),
    };
    const [rows, total, overrides] = await Promise.all([
        prisma.product.findMany({
            where,
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            skip: opts.skip,
            take: opts.take,
        }),
        prisma.product.count({ where }),
        getProductOverrides().catch(() => ({})),
    ]);
    return { products: mergeProductsWithOverrides(rows.map(mapDbToProduct), overrides), total };
}

const OVERRIDES_KEY = 'product-overrides';

export const getProductOverrides = async (): Promise<Record<string, ProductOverride>> => {
    const row = await prisma.keyValueSetting.findUnique({ where: { key: OVERRIDES_KEY } });
    if (!row) return {};
    const parsed = row.value as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, ProductOverride>)
        : {};
};

const writeOverridesMap = async (overrides: Record<string, ProductOverride>): Promise<void> => {
    await prisma.keyValueSetting.upsert({
        where: { key: OVERRIDES_KEY },
        create: { key: OVERRIDES_KEY, value: overrides as unknown as Prisma.InputJsonValue },
        update: { value: overrides as unknown as Prisma.InputJsonValue },
    });
};

export const getDeletedProductsArchive = async (): Promise<ArchivedProductRecord[]> => {
    const row = await prisma.keyValueSetting.findUnique({ where: { key: DELETED_ARCHIVE_KEY } });
    if (!row) return [];
    const parsed = row.value as unknown as ArchivedProductRecord[];
    return Array.isArray(parsed) ? parsed : [];
};

type TxClient = ExtendedTransactionClient;

const readDeletedProductsArchiveTx = async (tx: TxClient): Promise<ArchivedProductRecord[]> => {
    const row = await tx.keyValueSetting.findUnique({ where: { key: DELETED_ARCHIVE_KEY } });
    if (!row) return [];
    const parsed = row.value as unknown as ArchivedProductRecord[];
    return Array.isArray(parsed) ? parsed : [];
};

const writeDeletedProductsArchiveTx = async (tx: TxClient, records: ArchivedProductRecord[]): Promise<void> => {
    await tx.keyValueSetting.upsert({
        where: { key: DELETED_ARCHIVE_KEY },
        create: { key: DELETED_ARCHIVE_KEY, value: records as unknown as Prisma.InputJsonValue },
        update: { value: records as unknown as Prisma.InputJsonValue },
    });
};

const normalizeProductPatch = (
    patch: Partial<Omit<Product, 'id'>>
): Partial<Omit<Product, 'id'>> => {
    const normalized = { ...patch };
    if (typeof normalized.price === 'number' && !Number.isFinite(normalized.price))
        delete normalized.price;
    if (typeof normalized.oldPrice === 'number' && !Number.isFinite(normalized.oldPrice))
        delete normalized.oldPrice;
    if (typeof normalized.rating === 'number' && !Number.isFinite(normalized.rating))
        delete normalized.rating;
    if (typeof normalized.ratingCount === 'number' && !Number.isFinite(normalized.ratingCount))
        delete normalized.ratingCount;
    if (typeof normalized.reviewCount === 'number' && !Number.isFinite(normalized.reviewCount))
        delete normalized.reviewCount;
    if (typeof normalized.stock === 'number' && !Number.isFinite(normalized.stock))
        delete normalized.stock;
    if (typeof normalized.packagingSize === 'number' && !Number.isFinite(normalized.packagingSize))
        delete normalized.packagingSize;
    return normalized;
};

const buildOverrideFromSnapshot = (base: Product, snapshot: Partial<Product>): ProductOverride => {
    const nextOverride: ProductOverride = {};
    const snapshotWithoutId = { ...snapshot, id: undefined } as Record<string, unknown>;
    const baseWithoutId = { ...base, id: undefined } as Record<string, unknown>;
    Object.keys(snapshotWithoutId).forEach((key) => {
        if (JSON.stringify(snapshotWithoutId[key]) !== JSON.stringify(baseWithoutId[key])) {
            (nextOverride as Record<string, unknown>)[key] = snapshotWithoutId[key];
        }
    });
    return nextOverride;
};

export const upsertProductOverride = async (
    productId: string,
    nextValues: Partial<Omit<Product, 'id'>>
): Promise<{ success: true; products: Product[] } | { success: false; error: string }> => {
    const dbProduct = await prisma.product.findUnique({ where: { id: productId } });
    if (!dbProduct || dbProduct.isDeleted) return { success: false, error: 'Товар не найден' };

    const normalizedPatch = normalizeProductPatch(nextValues);
    const overrides = await getProductOverrides();
    // Callers (the admin form) resend a near-full product snapshot on every save, not a
    // per-field diff. Diffing against what the admin currently sees (base + existing
    // override) before storing/guarding means: (1) resubmitting an unchanged field never
    // freezes it as an override, and (2) the stock-guard below only fires on a genuine
    // stock change, not merely because the form happened to include the field.
    const currentMerged = applyProductOverride(mapDbToProduct(dbProduct), overrides[productId]);
    const changedFields = buildOverrideFromSnapshot(currentMerged, normalizedPatch);

    if (dbProduct.externalId !== null && 'stock' in changedFields) {
        return {
            success: false,
            error: 'Остаток синхронизируемого товара нельзя менять вручную — источник истины живая БД',
        };
    }

    if (Object.keys(changedFields).length > 0) {
        overrides[productId] = { ...overrides[productId], ...changedFields };
        await writeOverridesMap(overrides);
    }

    return { success: true, products: await getAdminProducts() };
};

export const resetProductOverride = async (
    productId: string
): Promise<{ success: true; products: Product[] } | { success: false; error: string }> => {
    const dbProduct = await prisma.product.findUnique({ where: { id: productId } });
    if (!dbProduct || dbProduct.isDeleted) return { success: false, error: 'Товар не найден' };

    const overrides = await getProductOverrides();
    if (productId in overrides) {
        delete overrides[productId];
        await writeOverridesMap(overrides);
    }

    return { success: true, products: await getAdminProducts() };
};

export const createProduct = async (
    product: Product
): Promise<{ success: true; products: Product[] } | { success: false; error: string }> => {
    const nextId = product.id.trim();
    if (!nextId) return { success: false, error: 'ID товара обязателен' };

    const existing = await prisma.product.findUnique({ where: { id: nextId } });
    if (existing) return { success: false, error: 'Товар с таким ID уже существует' };

    const normalizedProduct: Product = {
        ...product,
        id: nextId,
        title: product.title.trim(),
        brand: product.brand.trim(),
        image: product.image?.trim() || '',
    };

    await prisma.product.create({ data: mapProductToDbCreate(normalizedProduct, true) });

    return { success: true, products: await getAdminProducts() };
};

export const deleteCustomProduct = async (
    productId: string
): Promise<{ success: true; products: Product[] } | { success: false; error: string }> => {
    const nextId = productId.trim();
    if (!nextId) return { success: false, error: 'ID товара обязателен' };

    const dbProduct = await prisma.product.findUnique({ where: { id: nextId } });
    if (!dbProduct || !dbProduct.isCustom)
        return { success: false, error: 'Пользовательский товар не найден' };

    await prisma.product.delete({ where: { id: nextId } });

    return { success: true, products: await getAdminProducts() };
};

// All three functions below share one Postgres advisory lock keyed on the
// archive's KV row: without it, two admins archiving/restoring *different*
// products at nearly the same time can each read the array before either
// writes, and the second write silently clobbers the first — losing an
// archive record for a product that's already isDeleted in Postgres, with no
// way to restore it short of direct DB access.
export const deleteProductAny = async (
    productId: string
): Promise<{ success: true; products: Product[] } | { success: false; error: string }> => {
    const nextId = productId.trim();
    if (!nextId) return { success: false, error: 'ID товара обязателен' };

    const dbProduct = await prisma.product.findUnique({ where: { id: nextId } });
    if (!dbProduct || dbProduct.isDeleted) return { success: false, error: 'Товар не найден' };

    const targetProduct = mapDbToProduct(dbProduct);

    await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${DELETED_ARCHIVE_KEY}))`

        const archive = await readDeletedProductsArchiveTx(tx);
        const nextArchive = archive.filter((e) => e.id !== nextId);
        nextArchive.unshift({
            id: nextId,
            product: targetProduct,
            source: dbProduct.isCustom ? 'custom' : 'base',
            deletedAt: new Date().toISOString(),
        });
        await writeDeletedProductsArchiveTx(tx, nextArchive);

        if (dbProduct.isCustom) {
            await tx.product.delete({ where: { id: nextId } });
        } else {
            await tx.product.update({ where: { id: nextId }, data: { isDeleted: true } });
        }
    });

    return { success: true, products: await getAdminProducts() };
};

export const deleteProductsAny = async (
    productIds: string[]
): Promise<{ success: true; deletedCount: number } | { success: false; error: string }> => {
    const ids = [...new Set(productIds.map((id) => id.trim()).filter(Boolean))];
    if (ids.length === 0) return { success: false, error: 'Не выбраны товары для удаления' };

    return prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${DELETED_ARCHIVE_KEY}))`;

        const rows = await tx.product.findMany({
            where: { id: { in: ids }, isDeleted: false },
        });
        if (rows.length !== ids.length) {
            return { success: false as const, error: 'Один или несколько товаров не найдены' };
        }

        const archive = await readDeletedProductsArchiveTx(tx);
        const idSet = new Set(ids);
        const archivedAt = new Date().toISOString();
        const nextRecords: ArchivedProductRecord[] = rows.map((row) => ({
            id: row.id,
            product: mapDbToProduct(row),
            source: row.isCustom ? 'custom' : 'base',
            deletedAt: archivedAt,
        }));
        await writeDeletedProductsArchiveTx(tx, [
            ...nextRecords,
            ...archive.filter((record) => !idSet.has(record.id)),
        ]);

        const customIds = rows.filter((row) => row.isCustom).map((row) => row.id);
        const baseIds = rows.filter((row) => !row.isCustom).map((row) => row.id);
        if (customIds.length > 0) await tx.product.deleteMany({ where: { id: { in: customIds } } });
        if (baseIds.length > 0) {
            await tx.product.updateMany({ where: { id: { in: baseIds } }, data: { isDeleted: true } });
        }

        return { success: true as const, deletedCount: rows.length };
    });
};

export const restoreDeletedProduct = async (
    productId: string
): Promise<{ success: true } | { success: false; error: string }> => {
    const nextId = productId.trim();
    if (!nextId) return { success: false, error: 'ID товара обязателен' };

    const result = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${DELETED_ARCHIVE_KEY}))`

        const archive = await readDeletedProductsArchiveTx(tx);
        const archived = archive.find((e) => e.id === nextId);
        if (!archived) return { success: false as const, error: 'Товар не найден в архиве' };

        let overridePatch: ProductOverride | null = null;
        if (archived.source === 'custom') {
            await tx.product.create({ data: mapProductToDbCreate(archived.product, true) });
        } else {
            await tx.product.update({ where: { id: nextId }, data: { isDeleted: false } });

            const dbProduct = await tx.product.findUnique({ where: { id: nextId } });
            if (dbProduct) {
                const baseProduct = mapDbToProduct(dbProduct);
                const patch = buildOverrideFromSnapshot(baseProduct, archived.product);
                // Stock is never restored as an override — live inventory always wins,
                // regardless of what the archived snapshot happened to hold.
                delete patch.stock;
                if (Object.keys(patch).length > 0) overridePatch = patch;
            }
        }

        const nextArchive = archive.filter((e) => e.id !== nextId);
        await writeDeletedProductsArchiveTx(tx, nextArchive);

        return { success: true as const, overridePatch };
    });

    if (!result.success) return result;

    if (result.overridePatch) {
        await upsertProductOverride(nextId, result.overridePatch);
    }

    return { success: true };
};

export const purgeDeletedProductArchive = async (
    productId: string
): Promise<
    { success: true; archive: ArchivedProductRecord[] } | { success: false; error: string }
> => {
    const nextId = productId.trim();
    if (!nextId) return { success: false, error: 'ID товара обязателен' };

    return prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${DELETED_ARCHIVE_KEY}))`

        const archive = await readDeletedProductsArchiveTx(tx);
        if (!archive.some((e) => e.id === nextId))
            return { success: false as const, error: 'Товар не найден в архиве' };

        const nextArchive = archive.filter((e) => e.id !== nextId);
        await writeDeletedProductsArchiveTx(tx, nextArchive);
        return { success: true as const, archive: nextArchive };
    });
};
export { mapDbToProduct } from '@/lib/product-overrides-mapping';
