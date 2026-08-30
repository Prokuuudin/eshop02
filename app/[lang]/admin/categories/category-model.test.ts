import { describe, expect, it } from 'vitest';
import type { CategoryConfigItem } from '@/lib/categories-config';
import {
    normalizeCategoryLabels,
    sanitizeCategorySlug,
    updateCategoryLabels,
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
});
