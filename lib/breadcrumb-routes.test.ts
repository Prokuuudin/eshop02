import { readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { hasPageRoute, PAGE_ROUTES } from './breadcrumb-routes';

const LANG_ROOT = path.resolve(__dirname, '..', 'app', '[lang]');

function collectPageRoutes(dir: string, prefix: string): string[] {
    const routes: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.isFile() && entry.name === 'page.tsx' && prefix) {
            routes.push(prefix);
        }
        if (!entry.isDirectory()) continue;
        // Catch-all [...rest] is the localized 404, route groups do not add a segment.
        if (entry.name.startsWith('[...') || entry.name.startsWith('_')) continue;
        const segment = entry.name.startsWith('(') ? '' : `/${entry.name}`;
        routes.push(...collectPageRoutes(path.join(dir, entry.name), `${prefix}${segment}`));
    }
    return routes;
}

describe('PAGE_ROUTES', () => {
    it('совпадает со страницами в app/[lang]', () => {
        const actual = collectPageRoutes(LANG_ROOT, '').sort();
        expect([...PAGE_ROUTES].sort()).toEqual(actual);
    });
});

describe('hasPageRoute', () => {
    it('узнаёт существующие страницы и динамические сегменты', () => {
        expect(hasPageRoute('/')).toBe(true);
        expect(hasPageRoute('/admin')).toBe(true);
        expect(hasPageRoute('/admin/system/logs')).toBe(true);
        expect(hasPageRoute('/admin/products/abc-123')).toBe(true);
        expect(hasPageRoute('/product/42')).toBe(true);
        expect(hasPageRoute('/catalog?cat=hair')).toBe(true);
    });

    it('отклоняет промежуточные сегменты без страницы', () => {
        for (const href of [
            '/admin/system',
            '/admin/config',
            '/admin/customers',
            '/admin/help',
            '/admin/marketing',
            '/admin/notifications',
            '/account/integrations',
            '/auth',
            '/product',
            '/brand',
            '/order',
        ]) {
            expect(hasPageRoute(href), href).toBe(false);
        }
    });
});
