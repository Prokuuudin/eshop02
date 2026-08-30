import { describe, expect, it } from 'vitest';
import type { CategoryConfigItem } from '@/lib/categories-config';
import {
    normalizeCategoryLabels,
    sanitizeCategorySlug,
    updateCategoryImage,
    updateCategoryLabels,
    updateNewSubcategoryDraft,
    updateSubcategoryLabels,
} from './category-model';

const category: CategoryConfigItem = {
    id: 'hair-care',
    href: '/catalog/hair-care',
    image: '/categories/hair-care.jpg',
    labels: { ru: 'Волосы', en: 'Hair', lv: 'Mati' },
    subcategories: [{ slug: 'shampoo', search: 'shampoo', labels: { ru: 'Шампунь', en: 'Shampoo', lv: 'Šampūns' } }],
};

describe('category model', () => {
    it('sanitizes slugs and fills missing translations from Russian', () => {
        expect(sanitizeCategorySlug('  Hair & Care  ')).toBe('hair-care');
        expect(normalizeCategoryLabels(' Новое ', '', '', 'fallback')).toEqual({ ru: 'Новое', en: 'Новое', lv: 'Новое' });
    });

    it('updates category and subcategory labels without mutating the source', () => {
        const categories = [category];
        const renamed = updateCategoryLabels(categories, category.id, { en: 'Hair care' });
        const withSubcategory = updateSubcategoryLabels(renamed, category.id, 'shampoo', { lv: 'Šampūni' });

        expect(withSubcategory[0].labels.en).toBe('Hair care');
        expect(withSubcategory[0].subcategories[0].labels.lv).toBe('Šampūni');
        expect(categories[0].labels.en).toBe('Hair');
        expect(categories[0].subcategories[0].labels.lv).toBe('Šampūns');
    });

    it('updates a category image without changing the source category', () => {
        const categories = [category];
        const updated = updateCategoryImage(categories, category.id, '/categories/new.jpg');

        expect(updated[0].image).toBe('/categories/new.jpg');
        expect(categories[0].image).toBe('/categories/hair-care.jpg');
    });

    it('merges subcategory draft fields without losing previous input', () => {
        const withSlug = updateNewSubcategoryDraft({}, category.id, { slug: 'masks' });
        const withLabel = updateNewSubcategoryDraft(withSlug, category.id, { en: 'Masks' });

        expect(withLabel[category.id]).toEqual({
            slug: 'masks',
            search: '',
            ru: '',
            en: 'Masks',
            lv: '',
        });
        expect(withSlug[category.id].en).toBe('');
    });
});
