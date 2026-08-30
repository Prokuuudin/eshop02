import type { CategoryConfigItem, LocalizedLabel } from '@/lib/categories-config';

export type NewCategoryDraft = {
    id: string;
    image: string;
    ru: string;
    en: string;
    lv: string;
    firstSubSlug: string;
    firstSubSearch: string;
    firstSubRu: string;
    firstSubEn: string;
    firstSubLv: string;
};

export type NewSubDraft = {
    slug: string;
    search: string;
    ru: string;
    en: string;
    lv: string;
};

export const EMPTY_NEW_CATEGORY: NewCategoryDraft = {
    id: '',
    image: '/categories/new.jpg',
    ru: '',
    en: '',
    lv: '',
    firstSubSlug: '',
    firstSubSearch: '',
    firstSubRu: '',
    firstSubEn: '',
    firstSubLv: '',
};

export const sanitizeCategorySlug = (value: string): string =>
    value.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-{2,}/g, '-').replace(/^-|-$/g, '');

export function normalizeCategoryLabels(ru: string, en: string, lv: string, fallback: string): LocalizedLabel {
    const normalizedRu = ru.trim() || fallback;
    return {
        ru: normalizedRu,
        en: en.trim() || normalizedRu,
        lv: lv.trim() || normalizedRu,
    };
}

export function updateCategoryLabels(
    categories: CategoryConfigItem[],
    categoryId: string,
    nextLabels: Partial<LocalizedLabel>
): CategoryConfigItem[] {
    return categories.map((category) => category.id === categoryId
        ? { ...category, labels: { ...category.labels, ...nextLabels } }
        : category);
}

export function updateSubcategoryLabels(
    categories: CategoryConfigItem[],
    categoryId: string,
    slug: string,
    nextLabels: Partial<LocalizedLabel>
): CategoryConfigItem[] {
    return categories.map((category) => category.id !== categoryId ? category : {
        ...category,
        subcategories: category.subcategories.map((subcategory) => subcategory.slug === slug
            ? { ...subcategory, labels: { ...subcategory.labels, ...nextLabels } }
            : subcategory),
    });
}
