'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import ProductCard from '@/components/ProductCard';
import ConfirmActionDialog from '@/components/ConfirmActionDialog';
import { useTranslation } from '@/lib/use-translation';
import BenefitsList from '@/components/BenefitsList';
import { useToast } from '@/lib/toast-context';
import { useWishlist } from '@/lib/wishlist-store';

export default function WishlistPage() {
    const { t } = useTranslation();
    const { showToast } = useToast();
    const items = useWishlist((state) => state.items);
    const clearWishlist = useWishlist((state) => state.clearWishlist);
    const itemsLabel = t('wishlist.items', '{count} items in wishlist', { count: items.length });

    if (items.length === 0) {
        return (
            <main className="w-full px-4 py-12 text-gray-900 dark:text-gray-100">
                <div className="mb-8">
                    <BenefitsList />
                </div>
                <h1 className="text-3xl font-bold mb-4">{t('wishlist.title')}</h1>
                <div className="rounded-xl border border-gray-200 bg-white p-8 text-center dark:border-gray-700 dark:bg-gray-900">
                    <p className="text-lg font-medium">{t('wishlist.empty')}</p>
                    <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                        {t('wishlist.notAdded')}
                    </p>
                    <Link href="/catalog">
                        <Button className="mt-6">{t('wishlist.goToCatalog')}</Button>
                    </Link>
                </div>
            </main>
        );
    }

    return (
        <main className="w-full px-4 py-8 text-gray-900 dark:text-gray-100">
            <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold">{t('wishlist.title')}</h1>
                    <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">{itemsLabel}</p>
                </div>
                <div className="flex flex-wrap gap-3">
                    <ConfirmActionDialog
                        title={t('confirm.title')}
                        description={t('confirm.clearWishlist')}
                        confirmLabel={t('wishlist.clear')}
                        cancelLabel={t('common.cancel')}
                        onConfirm={() => {
                            clearWishlist();
                            showToast(t('toast.wishlistCleared'), 'info');
                        }}
                        trigger={<Button variant="outline">{t('wishlist.clear')}</Button>}
                    />
                    <Link href="/catalog">
                        <Button>{t('wishlist.continue')}</Button>
                    </Link>
                </div>
            </div>

            <div className="flex flex-col lg:flex-row gap-8">
                <div className="flex-1">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3">
                        {items.map((product) => (
                            <ProductCard key={product.id} product={product} />
                        ))}
                    </div>
                </div>
                <aside className="w-full lg:w-80 xl:w-96 shrink-0">
                    <BenefitsList />
                </aside>
            </div>
        </main>
    );
}
