'use client';
import React from 'react';
import AdminGate from '@/components/admin/AdminGate';
import { useProductsAdmin } from '@/hooks/admin/products/useProductsAdmin';
import ProductList from '@/components/admin/products/ProductList';
import ProductTable from '@/components/admin/products/ProductTable';
import ProductsToolbar from '@/components/admin/products/ProductsToolbar';
import { DialogContent } from '@/components/ui/dialog';
import { useI18n } from '@/lib/i18n-context';
import { useTranslation } from '@/lib/i18n-context';
import ArchivePanel from '@/components/admin/products/ArchivePanel';
import NewProductForm from '@/components/admin/products/NewProductForm';

export default function AdminProductsPage() {
    const admin = useProductsAdmin();
    const { language } = useI18n();
    const { t } = useTranslation();
    const [archiveOpen, setArchiveOpen] = React.useState(false);
    return (
        <AdminGate>
            <main className="admin-products w-full space-y-3 text-gray-900 dark:text-gray-100">
                <div className="admin-products__panel rounded-lg bg-white p-4 dark:bg-gray-900">
                    <h1 className="text-2xl font-bold">
                        {t('admin.productsPage.title') || 'Товары: управление'}
                    </h1>
                    <div className="space-y-6">
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
                            onDeleteArchive={admin.handlePurgeArchivedProduct}
                        />
                        {/* ArchivePanel теперь рендерится только внутри Dialog через ProductsToolbar */}
                        <NewProductForm title={t('admin.productsPage.addBtn')} />
                        <hr className="my-8 border-t border-gray-200 dark:border-gray-700" />
                        <div>
                            <h2 className="text-xl font-semibold mb-4">
                                {admin.viewMode === 'cards'
                                    ? t('admin.productsPage.cardsTitle')
                                    : t('admin.productsPage.listTitle')}
                            </h2>
                            {admin.viewMode === 'cards' ? (
                                <ProductList
                                    products={admin.products}
                                    onEditProduct={() => {}}
                                    onDeleteProduct={admin.handleDeleteProduct}
                                />
                            ) : (
                                <ProductTable
                                    products={admin.products}
                                    onEditProduct={() => {}}
                                    onDeleteProduct={admin.handleDeleteProduct}
                                />
                            )}
                        </div>
                    </div>
                </div>
            </main>
        </AdminGate>
    );
}
