import { cache } from 'react';
import { type Product } from '@/data/products';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@/generated/prisma/client';

export type ProductOverride = Partial<Omit<Product, 'id'>>;

export function applyProductOverride(
    base: Product,
    override: ProductOverride | undefined
): Product {
    return override ? { ...base, ...override } : base;
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

const getDbProducts = cache(async (): Promise<Product[]> => {
    const [rows, overrides] = await Promise.all([
        prisma.product.findMany({
            where: { isDeleted: false, isActive: true },
            orderBy: { createdAt: 'desc' },
        }),
        getProductOverrides().catch(() => ({})),
    ]);
    return mergeProductsWithOverrides(rows.map(mapDbToProduct), overrides);
});

// Примечание: category-фильтр ниже сравнивается с базовым (пред-override) значением
// Product.category на уровне SQL. Если admin когда-нибудь переопределит category
// конкретного товара через override, для пагинированного по категории списка он
// продолжит фильтроваться по старой базовой категории. Известное ограничение,
// не решается здесь — переопределение category встречается на практике крайне редко.
export async function getDbProductsPaginated(opts: {
    category?: string;
    skip?: number;
    take?: number;
}): Promise<{ products: Product[]; total: number }> {
    const where = {
        isDeleted: false,
        isActive: true,
        ...(opts.category ? { category: opts.category } : {}),
    };
    const [rows, total, overrides] = await Promise.all([
        prisma.product.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            skip: opts.skip,
            take: opts.take,
        }),
        prisma.product.count({ where }),
        getProductOverrides().catch(() => ({})),
    ]);

    return { products: mergeProductsWithOverrides(rows.map(mapDbToProduct), overrides), total };
}

export const getMergedProducts = cache(async (): Promise<Product[]> => {
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

const writeDeletedProductsArchive = async (records: ArchivedProductRecord[]): Promise<void> => {
    await prisma.keyValueSetting.upsert({
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

export const deleteProductAny = async (
    productId: string
): Promise<{ success: true; products: Product[] } | { success: false; error: string }> => {
    const nextId = productId.trim();
    if (!nextId) return { success: false, error: 'ID товара обязателен' };

    const dbProduct = await prisma.product.findUnique({ where: { id: nextId } });
    if (!dbProduct || dbProduct.isDeleted) return { success: false, error: 'Товар не найден' };

    const targetProduct = mapDbToProduct(dbProduct);

    const archive = await getDeletedProductsArchive();
    const nextArchive = archive.filter((e) => e.id !== nextId);
    nextArchive.unshift({
        id: nextId,
        product: targetProduct,
        source: dbProduct.isCustom ? 'custom' : 'base',
        deletedAt: new Date().toISOString(),
    });
    await writeDeletedProductsArchive(nextArchive);

    if (dbProduct.isCustom) {
        await prisma.product.delete({ where: { id: nextId } });
    } else {
        await prisma.product.update({ where: { id: nextId }, data: { isDeleted: true } });
    }

    return { success: true, products: await getAdminProducts() };
};

export const restoreDeletedProduct = async (
    productId: string
): Promise<{ success: true; products: Product[] } | { success: false; error: string }> => {
    const nextId = productId.trim();
    if (!nextId) return { success: false, error: 'ID товара обязателен' };

    const archive = await getDeletedProductsArchive();
    const archived = archive.find((e) => e.id === nextId);
    if (!archived) return { success: false, error: 'Товар не найден в архиве' };

    if (archived.source === 'custom') {
        await prisma.product.create({ data: mapProductToDbCreate(archived.product, true) });
    } else {
        await prisma.product.update({ where: { id: nextId }, data: { isDeleted: false } });

        const dbProduct = await prisma.product.findUnique({ where: { id: nextId } });
        if (dbProduct) {
            const baseProduct = mapDbToProduct(dbProduct);
            const overridePatch = buildOverrideFromSnapshot(baseProduct, archived.product);
            // Stock is never restored as an override — live inventory always wins,
            // regardless of what the archived snapshot happened to hold.
            delete overridePatch.stock;
            if (Object.keys(overridePatch).length > 0) {
                await upsertProductOverride(nextId, overridePatch);
            }
        }
    }

    const nextArchive = archive.filter((e) => e.id !== nextId);
    await writeDeletedProductsArchive(nextArchive);

    return { success: true, products: await getAdminProducts() };
};

export const purgeDeletedProductArchive = async (
    productId: string
): Promise<
    { success: true; archive: ArchivedProductRecord[] } | { success: false; error: string }
> => {
    const nextId = productId.trim();
    if (!nextId) return { success: false, error: 'ID товара обязателен' };

    const archive = await getDeletedProductsArchive();
    if (!archive.some((e) => e.id === nextId))
        return { success: false, error: 'Товар не найден в архиве' };

    const nextArchive = archive.filter((e) => e.id !== nextId);
    await writeDeletedProductsArchive(nextArchive);
    return { success: true, archive: nextArchive };
};
import { mapDbToProduct, mapProductToDbCreate } from '@/lib/product-overrides-mapping';

export { mapDbToProduct } from '@/lib/product-overrides-mapping';
