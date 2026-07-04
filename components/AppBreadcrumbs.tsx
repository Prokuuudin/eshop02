'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';

import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import type { BlogPost } from '@/data/blog';
import type { Product } from '@/data/products';
import { useBrandsConfig } from '@/lib/use-brands-config';
import { useTranslation } from '@/lib/use-translation';

interface Crumb {
    href: string;
    label: string;
}

const segmentLabelKeys: Record<string, string> = {
    // Public navigation
    catalog: 'nav.catalog',
    categories: 'categories.title',
    blog: 'nav.blog',
    about: 'nav.about',
    contact: 'breadcrumb.contact',
    wishlist: 'nav.wishlist',
    cart: 'nav.cart',
    checkout: 'checkout.title',
    order: 'order.title',
    product: 'common.product',
    brand: 'nav.brands',
    'delivery-payment': 'deliveryPayment.title',
    // Auth
    auth: 'common.auth',
    login: 'auth.login',
    register: 'auth.register',
    // Account
    account: 'nav.account',
    profile: 'account.profile',
    invoices: 'account.invoicesTitle',
    addresses: 'breadcrumb.addresses',
    templates: 'breadcrumb.templates',
    integrations: 'breadcrumb.integrations',
    webhooks: 'breadcrumb.webhooks',
    'audit-logs': 'breadcrumb.auditLogs',
    // Admin — top level
    admin: 'nav.admin',
    // Admin — catalog
    products: 'admin.products',
    brands: 'nav.brands',
    import: 'breadcrumb.import',
    reviews: 'breadcrumb.reviews',
    'stock-alerts': 'breadcrumb.stockAlerts',
    'bulk-price': 'breadcrumb.bulkPrice',
    // Admin — sales
    sales: 'breadcrumb.sales',
    orders: 'breadcrumb.orders',
    rfq: 'breadcrumb.rfq',
    returns: 'breadcrumb.returns',
    // Admin — customers
    customers: 'breadcrumb.customers',
    accounts: 'breadcrumb.accounts',
    'client-barcodes': 'breadcrumb.clientBarcodes',
    segments: 'breadcrumb.segments',
    history: 'breadcrumb.history',
    // Admin — marketing
    marketing: 'breadcrumb.marketing',
    campaigns: 'breadcrumb.campaigns',
    discounts: 'breadcrumb.discounts',
    showcases: 'breadcrumb.showcases',
    analytics: 'breadcrumb.analytics',
    'price-groups': 'breadcrumb.priceGroups',
    // Admin — content
    content: 'breadcrumb.content',
    media: 'breadcrumb.media',
    banners: 'breadcrumb.banners',
    // Admin — config
    config: 'breadcrumb.config',
    shipping: 'breadcrumb.shipping',
    bonus: 'breadcrumb.bonus',
    locale: 'breadcrumb.locale',
    'email-templates': 'breadcrumb.emailTemplates',
    // Admin — system
    system: 'breadcrumb.system',
    users: 'breadcrumb.users',
    logs: 'breadcrumb.logs',
    backup: 'breadcrumb.backup',
    // Admin — help
    help: 'breadcrumb.help',
    knowledge: 'breadcrumb.knowledge',
    onboarding: 'breadcrumb.onboarding',
    faq: 'breadcrumb.faq',
    support: 'breadcrumb.support',
};

function normalizeSegment(segment: string): string {
    return decodeURIComponent(segment).replace(/-/g, ' ');
}

function getProductTitle(
    product: Product | undefined,
    t: (key: string, defaultValue?: string) => string,
    language: string
): string | null {
    if (!product) {
        return null;
    }

    return language === 'en' && product.titleEn
        ? product.titleEn
        : language === 'lv' && product.titleLv
        ? product.titleLv
        : t(product.titleKey ?? `products.${product.id}.title`, product.title);
}

function getBrandName(segment: string, brands: Array<{ id: string; name: string }>): string | null {
    const brand = brands.find((item) => item.id === decodeURIComponent(segment));
    return brand?.name ?? null;
}

type BlogCrumbPost = Pick<BlogPost, 'slug' | 'title' | 'translations'>;

function getBlogPostTitle(
    segment: string,
    language: 'ru' | 'en' | 'lv',
    posts: Record<string, BlogCrumbPost>
): string | null {
    const post = posts[decodeURIComponent(segment)];

    if (!post) {
        return null;
    }

    return post.translations?.[language]?.title ?? post.title;
}

export default function AppBreadcrumbs() {
    const pathname = usePathname();
    const { t, language } = useTranslation();
    const { brands } = useBrandsConfig();
    const [productCache, setProductCache] = useState<Record<string, Product>>({});
    const [blogPostCache, setBlogPostCache] = useState<Record<string, BlogCrumbPost>>({});

    useEffect(() => {
        if (!pathname) return;
        const segments = pathname.split('/').filter(Boolean);
        const blogIndex = segments.findIndex((s) => s === 'blog');
        const slug = blogIndex >= 0 ? segments[blogIndex + 1] : undefined;
        if (!slug || blogPostCache[decodeURIComponent(slug)]) return;

        fetch('/api/blog')
            .then((r) => (r.ok ? r.json() : null))
            .then((data: { posts?: BlogCrumbPost[] } | null) => {
                if (data?.posts?.length) {
                    setBlogPostCache((prev) => {
                        const next = { ...prev };
                        for (const post of data.posts as BlogCrumbPost[]) {
                            next[post.slug] = post;
                        }
                        return next;
                    });
                }
            })
            .catch(() => {});
    }, [pathname, blogPostCache]);

    useEffect(() => {
        if (!pathname) return;
        const segments = pathname.split('/').filter(Boolean);
        const productIdIndex = segments.findIndex((s) => s === 'product');
        const productId = productIdIndex >= 0 ? segments[productIdIndex + 1] : undefined;
        if (!productId || productCache[productId]) return;

        fetch(`/api/products/${encodeURIComponent(productId)}`)
            .then((r) => (r.ok ? r.json() : null))
            .then((data: { product?: Product } | null) => {
                if (data?.product) {
                    setProductCache((prev) => ({ ...prev, [productId]: data.product as Product }));
                }
            })
            .catch(() => {});
    }, [pathname, productCache]);

    const crumbs = useMemo<Crumb[]>(() => {
        if (!pathname || pathname === '/') return [];

        const segments = pathname.split('/').filter(Boolean);
        return segments.map((segment, index) => {
            const href = `/${segments.slice(0, index + 1).join('/')}`;
            const key = segmentLabelKeys[segment];
            const isProductIdSegment = segments[index - 1] === 'product';
            const isBrandIdSegment = segments[index - 1] === 'brand';
            const isBlogSlugSegment = segments[index - 1] === 'blog';
            const resolvedEntityLabel = isProductIdSegment
                ? getProductTitle(productCache[decodeURIComponent(segment)], t, language)
                : isBrandIdSegment
                ? getBrandName(segment, brands)
                : isBlogSlugSegment
                ? getBlogPostTitle(segment, language, blogPostCache)
                : null;
            const label =
                resolvedEntityLabel ??
                (key ? t(key, normalizeSegment(segment)) : normalizeSegment(segment));

            return { href, label };
        });
    }, [brands, language, pathname, t, productCache, blogPostCache]);

    return (
        <Breadcrumb
            aria-label={t('breadcrumbs.aria')}
            className="mb-4 border-b border-gray-200 pb-2 dark:border-gray-800"
        >
            <BreadcrumbList>
                <BreadcrumbItem>
                    <BreadcrumbLink href="/">{t('nav.home')}</BreadcrumbLink>
                </BreadcrumbItem>

                {crumbs.map((crumb, index) => {
                    const isLast = index === crumbs.length - 1;

                    return (
                        <Fragment key={crumb.href}>
                            <BreadcrumbSeparator />
                            <BreadcrumbItem>
                                {isLast ? (
                                    <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                                ) : (
                                    <BreadcrumbLink href={crumb.href}>{crumb.label}</BreadcrumbLink>
                                )}
                            </BreadcrumbItem>
                        </Fragment>
                    );
                })}
            </BreadcrumbList>
        </Breadcrumb>
    );
}
