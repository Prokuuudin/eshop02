'use client';

import { Fragment, useMemo } from 'react';
import { usePathname } from 'next/navigation';

import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { BLOG_POSTS, localizeBlogPost } from '@/data/blog';
import { PRODUCTS } from '@/data/products';
import { useBrandsConfig } from '@/lib/use-brands-config';
import { useTranslation } from '@/lib/use-translation';

interface Crumb {
    href: string;
    label: string;
}

const segmentLabelKeys: Record<string, string> = {
    catalog: 'nav.catalog',
    categories: 'categories.title',
    blog: 'nav.blog',
    about: 'nav.about',
    contact: 'nav.contact',
    account: 'nav.account',
    analytics: 'account.analyticsTitle',
    invoices: 'account.invoicesTitle',
    wishlist: 'nav.wishlist',
    cart: 'nav.cart',
    admin: 'nav.admin',
    products: 'admin.products',
    checkout: 'checkout.title',
    order: 'order.title',
    product: 'common.product',
    brand: 'nav.brands',
    auth: 'common.auth',
    login: 'auth.login',
    register: 'auth.register',
    'delivery-payment': 'deliveryPayment.title',
};

function normalizeSegment(segment: string): string {
    return decodeURIComponent(segment).replace(/-/g, ' ');
}

function getProductTitle(
    segment: string,
    t: (key: string, defaultValue?: string) => string,
    language: string
): string | null {
    const product = PRODUCTS.find((item) => item.id === decodeURIComponent(segment));
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

function getBlogPostTitle(segment: string, language: 'ru' | 'en' | 'lv'): string | null {
    const post = BLOG_POSTS.find((item) => item.slug === decodeURIComponent(segment));

    if (!post) {
        return null;
    }

    return localizeBlogPost(post, language).title;
}

export default function AppBreadcrumbs() {
    const pathname = usePathname();
    const { t, language } = useTranslation();
    const { brands } = useBrandsConfig();

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
                ? getProductTitle(segment, t, language)
                : isBrandIdSegment
                ? getBrandName(segment, brands)
                : isBlogSlugSegment
                ? getBlogPostTitle(segment, language)
                : null;
            const label =
                resolvedEntityLabel ??
                (key ? t(key, normalizeSegment(segment)) : normalizeSegment(segment));

            return { href, label };
        });
    }, [brands, language, pathname, t]);

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
