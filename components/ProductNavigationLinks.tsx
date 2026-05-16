import React from 'react';
import Link from 'next/link';
import { useTranslation } from '@/lib/use-translation';

interface ProductNavigationLinksProps {
    categoryUrl: string;
    brandUrl: string;
}

export const ProductNavigationLinks: React.FC<ProductNavigationLinksProps> = ({
    categoryUrl,
    brandUrl,
}) => {
    const { t } = useTranslation();
    return (
        <div className="flex flex-wrap gap-2 mb-4 items-center">
            <Link href="/catalog" className="text-indigo-600 inline-block">
                ← {t('product.backToCatalog')}
            </Link>
            <Link
                href={categoryUrl}
                className="inline-block rounded bg-indigo-50 text-indigo-700 px-3 py-1 text-sm font-medium hover:bg-indigo-100 transition"
            >
                {t('product.moreFromCategory', 'Другие товары этой категории')}
            </Link>
            <Link
                href={brandUrl}
                className="inline-block rounded bg-indigo-50 text-indigo-700 px-3 py-1 text-sm font-medium hover:bg-indigo-100 transition"
            >
                {t('product.moreFromBrand', 'Другие товары этого бренда')}
            </Link>
        </div>
    );
};
