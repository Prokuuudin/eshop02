// Every page route under app/[lang] (without the language prefix).
// Breadcrumbs only link to paths that match one of these; intermediate URL
// segments without their own page (e.g. /admin/system) would otherwise 404.
// lib/breadcrumb-routes.test.ts keeps this list in sync with the filesystem.
export const PAGE_ROUTES: readonly string[] = [
    '/account',
    '/account/addresses',
    '/account/analytics',
    '/account/audit-logs',
    '/account/integrations/webhooks',
    '/account/invoices',
    '/account/profile',
    '/account/returns',
    '/account/templates',
    '/admin',
    '/admin/accounts',
    '/admin/analytics',
    '/admin/blog',
    '/admin/bonus',
    '/admin/brand-lines',
    '/admin/brands',
    '/admin/categories',
    '/admin/client-barcodes',
    '/admin/client-database',
    '/admin/config/bonus',
    '/admin/config/email-templates',
    '/admin/config/locale',
    '/admin/config/payment',
    '/admin/config/shipping',
    '/admin/contact-messages',
    '/admin/content',
    '/admin/content/banners',
    '/admin/content/media',
    '/admin/customers/history',
    '/admin/customers/profile',
    '/admin/customers/segments',
    '/admin/design-system',
    '/admin/help/faq',
    '/admin/help/knowledge',
    '/admin/help/onboarding',
    '/admin/import',
    '/admin/invitations',
    '/admin/marketing/analytics',
    '/admin/marketing/campaigns',
    '/admin/marketing/discounts',
    '/admin/marketing/price-groups',
    '/admin/notifications/send',
    '/admin/orders',
    '/admin/orders/new',
    '/admin/products',
    '/admin/products/[id]',
    '/admin/products/bulk-price',
    '/admin/products/duplicates',
    '/admin/returns',
    '/admin/reviews',
    '/admin/rfq',
    '/admin/sales',
    '/admin/sales/analytics',
    '/admin/sales/breakdown',
    '/admin/stock-alerts',
    '/admin/system/admin-log',
    '/admin/system/backup',
    '/admin/system/logs',
    '/auth/admin-setup',
    '/auth/confirm-email',
    '/auth/forgot-password',
    '/auth/invite',
    '/auth/login',
    '/auth/register',
    '/auth/reset-password',
    '/blog',
    '/blog/[slug]',
    '/brand/[id]',
    '/cart',
    '/catalog',
    '/category/[slug]',
    '/checkout',
    '/contact',
    '/cookies',
    '/delivery',
    '/delivery-payment',
    '/order/[id]',
    '/payment',
    '/privacy',
    '/product/[id]',
    '/request-quote',
    '/return-policy',
    '/stores',
    '/terms',
    '/wishlist',
];

const routeSegments = PAGE_ROUTES.map((route) => route.split('/').filter(Boolean));

function isDynamicSegment(segment: string): boolean {
    return segment.startsWith('[') && segment.endsWith(']');
}

/** True when `path` (unprefixed, no query) is served by a real page. */
export function hasPageRoute(path: string): boolean {
    const segments = path.split('?')[0].split('/').filter(Boolean);
    if (segments.length === 0) return true;

    return routeSegments.some(
        (route) =>
            route.length === segments.length &&
            route.every((part, index) => isDynamicSegment(part) || part === segments[index])
    );
}
