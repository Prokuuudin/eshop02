import { describe, expect, it } from 'vitest';
import {
    filterAdminNavSections,
    findActiveAdminNavSection,
    isAdminNavItemActive,
} from '@/components/admin/admin-header-nav-model';

const sections = [
    {
        title: 'catalog',
        items: [
            { title: 'products', href: '/admin/products' },
            { title: 'categories', href: '/admin/categories' },
        ],
    },
    {
        title: 'settings',
        items: [{ title: 'integrations', href: '/account/integrations/webhooks' }],
    },
];

describe('admin header navigation model', () => {
    it('matches exact and nested paths without matching sibling prefixes', () => {
        expect(isAdminNavItemActive('/admin/products', '/admin/products')).toBe(true);
        expect(isAdminNavItemActive('/admin/products/new', '/admin/products')).toBe(true);
        expect(isAdminNavItemActive('/admin/products-old', '/admin/products')).toBe(false);
    });

    it('ignores URL fragments when matching an item', () => {
        expect(isAdminNavItemActive('/admin/products', '/admin/products#stock')).toBe(true);
    });

    it('filters inaccessible items and removes empty sections', () => {
        expect(filterAdminNavSections(sections, (href) => href === '/admin/categories')).toEqual([
            { title: 'catalog', items: [{ title: 'categories', href: '/admin/categories' }] },
        ]);
    });

    it('finds the section containing the active nested route', () => {
        expect(findActiveAdminNavSection('/admin/categories/new', sections)).toBe('catalog');
        expect(findActiveAdminNavSection('/admin/orders', sections)).toBeUndefined();
    });
});
