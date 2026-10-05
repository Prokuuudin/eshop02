import type { Product } from '@/data/products';
import type { AddProductFormValues } from '@/components/admin/products/productFormSchema';
import { getVariantGroups } from '@/lib/product-variants';
import { getProductIngredients, isIngredientKey } from '@/lib/product-ingredients';

// Форма редактирует один минимум заказа; на странице действует минимум из значений записи
// (см. getMinimumOrderQuantity). При сохранении значение уходит в minOrderQuantities.default.
const minOrderFromQuantities = (quantities: Record<string, number> | undefined): number => {
    const values = Object.values(quantities ?? {}).filter(
        (v): v is number => typeof v === 'number' && v >= 1
    );
    return values.length > 0 ? Math.min(...values) : 1;
};

export function mapProductToFormValues(product: Product): AddProductFormValues {
    return {
        id: product.id,
        sku: product.sku ?? '',
        barcode: product.barcode ?? '',
        brand: product.brand,
        category: product.category,
        status: product.isActive === false ? 'hidden' : 'active',

        title: product.title,
        titleEn: product.titleEn ?? '',
        titleLv: product.titleLv ?? '',

        description: product.description ?? '',
        descriptionEn: product.technicalSpecs?.__descriptionEn ?? '',
        descriptionLv: product.technicalSpecs?.__descriptionLv ?? '',
        ingredients: getProductIngredients(product),
        ingredientsKey:
            Object.keys(product.technicalSpecs ?? {}).find(
                (key) => !key.startsWith('__') && isIngredientKey(key)
            ) ?? 'INGREDIENTS',
        application: product.technicalSpecs?.__application ?? '',
        applicationEn: product.technicalSpecs?.__applicationEn ?? '',
        applicationLv: product.technicalSpecs?.__applicationLv ?? '',
        warnings: product.technicalSpecs?.__warnings ?? '',
        warningsEn: product.technicalSpecs?.__warningsEn ?? '',
        warningsLv: product.technicalSpecs?.__warningsLv ?? '',

        price: product.price,
        oldPrice: product.oldPrice ?? 0,
        bulkPricingTiers: product.bulkPricingTiers ?? [],

        stock: product.stock,
        minOrder: minOrderFromQuantities(product.minOrderQuantities),

        image: product.image ?? '',
        images: product.images ?? [],

        badges: product.badges ?? [],

        technicalSpecs: Object.entries(product.technicalSpecs ?? {})
            .filter(([key]) => !key.startsWith('__') && !isIngredientKey(key))
            .map(([key, value]) => ({ key, value })),
        reservedTechSpecs: Object.fromEntries(
            Object.entries(product.technicalSpecs ?? {}).filter(
                ([key]) =>
                    key.startsWith('__') &&
                    ![
                        '__variantGroupsJson',
                        '__descriptionEn',
                        '__descriptionLv',
                        '__application',
                        '__applicationEn',
                        '__applicationLv',
                        '__warnings',
                        '__warningsEn',
                        '__warningsLv',
                    ].includes(key)
            )
        ),
        variantGroups: getVariantGroups(product) ?? [],
        compatibleEquipment: product.compatibleEquipment ?? [],
        certificates: product.certificates ?? [],
        relatedProductIds: product.relatedProductIds ?? [],
        oftenBoughtTogether: product.oftenBoughtTogether ?? [],
        demoVideo: product.demoVideo ?? [],

        metaTitle: product.metaTitle ?? '',
        metaDescription: product.metaDescription ?? '',
        ogImage: product.ogImage ?? '',
        ogAlt: product.ogAlt ?? '',

        manufacturerName: product.manufacturerName ?? '',
        manufacturerAddress: product.manufacturerAddress ?? '',
        manufacturerEmail: product.manufacturerEmail ?? '',
        distributorName: product.distributorName ?? { ru: '', en: '', lv: '' },
        distributorAddress: product.distributorAddress ?? { ru: '', en: '', lv: '' },
        distributorEmail: product.distributorEmail ?? '',

        bonusRate: product.bonusRate,
        rating: product.rating,

        feature1: product.feature1 ?? '',
        feature1En: product.feature1En ?? '',
        feature1Lv: product.feature1Lv ?? '',
        feature2: product.feature2 ?? '',
        feature2En: product.feature2En ?? '',
        feature2Lv: product.feature2Lv ?? '',
        feature3: product.feature3 ?? '',
        feature3En: product.feature3En ?? '',
        feature3Lv: product.feature3Lv ?? '',
        feature4: product.feature4 ?? '',
        feature4En: product.feature4En ?? '',
        feature4Lv: product.feature4Lv ?? '',
    };
}

const isEmptyMultilang = (obj: { ru: string; en: string; lv: string }): boolean =>
    !obj.ru && !obj.en && !obj.lv;

export function mapFormValuesToProductPatch(
    values: AddProductFormValues
): Omit<Partial<Omit<Product, 'id'>>, 'oldPrice'> & { oldPrice?: number | null } {
    const techSpecs = values.technicalSpecs
        .filter((s) => s.key.trim() && !s.key.trim().startsWith('__'))
        .reduce<Record<string, string>>((acc, { key, value }) => {
            acc[key] = value;
            return acc;
        }, {});
    Object.assign(techSpecs, values.reservedTechSpecs ?? {});
    if (values.variantGroups.length > 0) {
        techSpecs['__variantGroupsJson'] = JSON.stringify(values.variantGroups);
    }
    if (values.descriptionEn?.trim()) {
        techSpecs['__descriptionEn'] = values.descriptionEn;
    }
    if (values.descriptionLv?.trim()) {
        techSpecs['__descriptionLv'] = values.descriptionLv;
    }
    const reservedI18n: Array<[string, string | undefined]> = [
        ['__application', values.application],
        ['__applicationEn', values.applicationEn],
        ['__applicationLv', values.applicationLv],
        ['__warnings', values.warnings],
        ['__warningsEn', values.warningsEn],
        ['__warningsLv', values.warningsLv],
    ];
    for (const [key, value] of reservedI18n) {
        if (value?.trim()) techSpecs[key] = value.trim();
    }
    // Состав пишется последним — выигрывает у вручную добавленной строки с тем же ключом;
    // пустое поле = состав удалён из товара
    if (values.ingredients?.trim()) {
        techSpecs[values.ingredientsKey?.trim() || 'INGREDIENTS'] = values.ingredients.trim();
    }

    const cleanArray = (arr: string[]) => arr.map((s) => s.trim()).filter(Boolean);

    return {
        sku: values.sku || undefined,
        barcode: values.barcode || undefined,
        brand: values.brand,
        category: values.category as Product['category'],
        isActive: values.status !== 'hidden',
        // {} (а не undefined): undefined-ключи теряются при JSON-передаче в API,
        // и сброшенный минимум иначе невозможно было бы очистить в БД
        minOrderQuantities:
            values.minOrder > 1 ? { default: values.minOrder } : {},
        title: values.title,
        titleEn: values.titleEn || undefined,
        titleLv: values.titleLv || undefined,
        description: values.description || undefined,
        price: values.price,
        // null is intentional: unlike undefined it survives JSON serialization
        // and tells the update API to remove an accidentally set old price.
        oldPrice: values.oldPrice && values.oldPrice > 0 ? values.oldPrice : null,
        bulkPricingTiers:
            values.bulkPricingTiers.length > 0 ? values.bulkPricingTiers : undefined,
        stock: values.stock,
        image: values.image || undefined,
        images: cleanArray(values.images).length > 0 ? cleanArray(values.images) : undefined,
        badges: values.badges.length > 0 ? values.badges : undefined,
        technicalSpecs: Object.keys(techSpecs).length > 0 ? techSpecs : undefined,
        compatibleEquipment:
            cleanArray(values.compatibleEquipment).length > 0
                ? cleanArray(values.compatibleEquipment)
                : undefined,
        certificates:
            cleanArray(values.certificates).length > 0
                ? cleanArray(values.certificates)
                : undefined,
        // Всегда массив (не undefined) — иначе удаление последней ссылки не доехало бы до БД,
        // а пустой список включает автоподбор блока на странице товара
        relatedProductIds: cleanArray(values.relatedProductIds),
        oftenBoughtTogether: cleanArray(values.oftenBoughtTogether),
        // Всегда массив (не undefined) — иначе удаление последнего видео не доехало бы до БД
        demoVideo: values.demoVideo
            .filter((v) => v.src.trim())
            .map((v) => ({ src: v.src.trim(), ...(v.poster?.trim() ? { poster: v.poster.trim() } : {}) })),
        metaTitle: values.metaTitle || undefined,
        metaDescription: values.metaDescription || undefined,
        ogImage: values.ogImage || undefined,
        ogAlt: values.ogAlt || undefined,
        manufacturerName: values.manufacturerName || undefined,
        manufacturerAddress: values.manufacturerAddress || undefined,
        manufacturerEmail: values.manufacturerEmail || undefined,
        distributorName:
            values.distributorName && !isEmptyMultilang(values.distributorName)
                ? values.distributorName
                : undefined,
        distributorAddress:
            values.distributorAddress && !isEmptyMultilang(values.distributorAddress)
                ? values.distributorAddress
                : undefined,
        distributorEmail: values.distributorEmail || undefined,
        bonusRate: values.bonusRate,
        rating: values.rating,

        feature1: values.feature1 || undefined,
        feature1En: values.feature1En || undefined,
        feature1Lv: values.feature1Lv || undefined,
        feature2: values.feature2 || undefined,
        feature2En: values.feature2En || undefined,
        feature2Lv: values.feature2Lv || undefined,
        feature3: values.feature3 || undefined,
        feature3En: values.feature3En || undefined,
        feature3Lv: values.feature3Lv || undefined,
        feature4: values.feature4 || undefined,
        feature4En: values.feature4En || undefined,
        feature4Lv: values.feature4Lv || undefined,
    };
}

type ProductPatch = ReturnType<typeof mapFormValuesToProductPatch>;

// The full patch maps an emptied field to undefined, which JSON.stringify drops, so in
// a changed-only PATCH a clear would be indistinguishable from "unchanged". These are the
// update API's clear values: the server spreads changes over the stored product, so an
// absent key keeps the old value. oldPrice is cleared with null by the full patch already.
// Fields without an entry (bonusRate, rating) have no clear value in the update schema.
const CLEARED_PATCH_VALUES: Partial<Record<keyof ProductPatch, unknown>> = {
    sku: '', barcode: '', titleEn: '', titleLv: '', description: '', image: '',
    metaTitle: '', metaDescription: '', ogImage: '', ogAlt: '',
    manufacturerName: '', manufacturerAddress: '', manufacturerEmail: '', distributorEmail: '',
    feature1: '', feature1En: '', feature1Lv: '', feature2: '', feature2En: '', feature2Lv: '',
    feature3: '', feature3En: '', feature3Lv: '', feature4: '', feature4En: '', feature4Lv: '',
    images: [], badges: [], compatibleEquipment: [], certificates: [], bulkPricingTiers: [],
    technicalSpecs: {},
    distributorName: { ru: '', en: '', lv: '' },
    distributorAddress: { ru: '', en: '', lv: '' },
};

/**
 * Build a PATCH payload for the edit form without resending untouched legacy
 * fields. Some older products can contain values that no longer satisfy the
 * current create/update schema; an unrelated price edit must not be rejected
 * because of one of those fields. A field the admin emptied is sent with its
 * explicit clear value, so every returned key survives JSON serialization.
 */
export function mapChangedFormValuesToProductPatch(
    values: AddProductFormValues,
    initialValues: AddProductFormValues
): ProductPatch {
    const current = mapFormValuesToProductPatch(values);
    const initial = mapFormValuesToProductPatch(initialValues);
    const changes: Record<string, unknown> = {};

    for (const key of Object.keys(current) as Array<keyof ProductPatch>) {
        const value = current[key] === undefined && initial[key] !== undefined
            ? CLEARED_PATCH_VALUES[key]
            : current[key];
        if (value === undefined) continue;
        if (JSON.stringify(value) !== JSON.stringify(initial[key])) changes[key] = value;
    }

    return changes as ProductPatch;
}

export function mapFormValuesToNewProduct(values: AddProductFormValues): Product {
    return {
        id: values.id,
        title: values.title,
        brand: values.brand,
        price: values.price,
        rating: values.rating ?? 0,
        stock: values.stock,
        category: values.category as Product['category'],
        image: values.image || '',
        ...mapFormValuesToProductPatch(values),
        // Create requests do not need the update-only null clearing marker.
        oldPrice: values.oldPrice && values.oldPrice > 0 ? values.oldPrice : undefined,
    };
}
