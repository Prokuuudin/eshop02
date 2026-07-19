'use client';
import React from 'react';
import { useRouter } from 'next/navigation';
import AdminGate from '@/components/admin/AdminGate';
import { useProductsAdmin } from '@/hooks/admin/products/useProductsAdmin';
import ProductList from '@/components/admin/products/ProductList';
import ProductTable from '@/components/admin/products/ProductTable';
import ProductsToolbar from '@/components/admin/products/ProductsToolbar';
import { useI18n } from '@/lib/i18n-context';
import { useTranslation } from '@/lib/i18n-context';
import NewProductForm from '@/components/admin/products/NewProductForm';
import { logAdminAction } from '@/lib/admin-log-store';
import type { Product } from '@/data/products';

export default function AdminProductsPage() {
    const router = useRouter();
    const admin = useProductsAdmin();
    const { language } = useI18n();
    const { t } = useTranslation();
    const [archiveOpen, setArchiveOpen] = React.useState(false);
    return (
        <AdminGate>
            <main className="admin-products w-full space-y-3 text-foreground">
                <div className="admin-products__panel rounded-lg bg-white p-4 dark:bg-gray-900">
                    <h1 className="text-2xl font-bold mb-6">
                        {t('admin.productsPage.title') || 'Товары: управление'}
                    </h1>
                    {admin.message && (
                        <p className="mb-4 rounded-md border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-800 dark:border-green-700 dark:bg-green-900/30 dark:text-green-200">
                            {admin.message}
                        </p>
                    )}
                    {admin.error && (
                        <p className="mb-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-700 dark:bg-red-900/30 dark:text-red-200">
                            {admin.error}
                        </p>
                    )}
                    <div className="space-y-6">
                        <NewProductForm title={t('admin.productsPage.addBtn')} />
                        <ProductsToolbar
                            searchQuery={admin.searchQuery}
                            onSearchChange={admin.setSearchQuery}
                            viewMode={admin.viewMode}
                            setViewMode={(mode) => admin.setViewMode(mode as 'cards' | 'list')}
                            language={language}
                            archiveCount={admin.archiveItems.length}
                            onToggleArchive={() => setArchiveOpen((v) => !v)}
                            archiveOpen={archiveOpen}
                            archiveItems={admin.archiveItems}
                            onRestoreArchive={admin.handleRestoreProduct}
                            onDeleteArchive={(id) => {
                                if (window.confirm(t('admin.productsPage.confirm.deleteForever').replace('{id}', id))) {
                                    admin.handlePurgeArchivedProduct(id);
                                }
                            }}
                        />
                        <hr className="my-8 border-t border-border" />
                        <div>
                            <h2 className="text-xl font-semibold mb-4">
                                {admin.viewMode === 'cards'
                                    ? t('admin.productsPage.cardsTitle')
                                    : t('admin.productsPage.listTitle')}
                            </h2>
                            {admin.viewMode === 'cards' ? (
                                <ProductList
                                    products={admin.products}
                                    onEditProduct={(product) => router.push(`/admin/products/${product.id}`)}
                                    onDeleteProduct={(product: Product) => {
                                        if (!window.confirm(t('admin.productsPage.confirm.moveToTrash').replace('{id}', product.id))) return;
                                        admin.handleDeleteProduct(product)
                                        logAdminAction('product.deleted', {
                                            type: 'product', id: product.id, title: product.title,
                                        }, { before: { price: product.price, stock: product.stock } })
                                    }}
                                />
                            ) : (
                                <ProductTable
                                    products={admin.products}
                                    onEditProduct={(product) => router.push(`/admin/products/${product.id}`)}
                                    onDeleteProduct={(product: Product) => {
                                        if (!window.confirm(t('admin.productsPage.confirm.moveToTrash').replace('{id}', product.id))) return;
                                        admin.handleDeleteProduct(product)
                                        logAdminAction('product.deleted', {
                                            type: 'product', id: product.id, title: product.title,
                                        }, { before: { price: product.price, stock: product.stock } })
                                    }}
                                    onQuickSave={async (id, changes) => {
                                        const product = admin.products.find((p) => p.id === id)
                                        await fetch('/api/admin/products', {
                                            method: 'PUT',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ id, changes }),
                                        })
                                        await admin.reload()
                                        if (changes.price !== undefined) {
                                            logAdminAction('product.price_changed', {
                                                type: 'product', id, title: product?.title,
                                            }, { before: { price: product?.price }, after: { price: changes.price } })
                                        }
                                        if (changes.stock !== undefined) {
                                            logAdminAction('product.stock_changed', {
                                                type: 'product', id, title: product?.title,
                                            }, { before: { stock: product?.stock }, after: { stock: changes.stock } })
                                        }
                                    }}
                                />
                            )}
                        </div>
                    </div>
                </div>
            </main>
        </AdminGate>
    );
}
