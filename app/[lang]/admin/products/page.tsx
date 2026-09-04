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
import { useAdminConfirm } from '@/components/admin/AdminConfirmProvider';
import type { Product } from '@/data/products';
import { useAdminLocale } from '@/lib/use-admin-locale';
import { writeProductsListReturnState } from '@/lib/admin/products/list-return-state';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';

export default function AdminProductsPage(): React.ReactElement {
    const confirmAction = useAdminConfirm();
    const router = useRouter();
    const admin = useProductsAdmin();
    const { language } = useI18n();
    const { t } = useTranslation();
    const { l } = useAdminLocale();
    const [archiveOpen, setArchiveOpen] = React.useState(false);
    const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
    const bulkMode = admin.visibility === 'hidden';
    const allLoadedSelected = admin.products.length > 0 && admin.products.every((product) => selectedIds.has(product.id));
    const toggleSelected = (id: string, selected: boolean) => {
        setSelectedIds((current) => {
            const next = new Set(current);
            if (selected) next.add(id);
            else next.delete(id);
            return next;
        });
    };
    React.useEffect(() => {
        setSelectedIds(new Set());
    }, [admin.visibility, admin.searchQuery]);
    const handleEditProduct = (product: Product) => {
        writeProductsListReturnState({
            productId: product.id,
            searchQuery: admin.searchQuery,
            viewMode: admin.viewMode,
            visibility: admin.visibility,
            loadedCount: admin.products.length,
        });
        router.push(`/admin/products/${product.id}`);
    };
    return (
        <AdminGate>
            <main className="admin-products w-full space-y-3 text-foreground">
                <div className="admin-products__panel rounded-lg bg-white p-4 dark:bg-gray-900">
                    <h1 className="text-2xl font-bold mb-6">
                        {t('admin.productsPage.title') || l('Товары: управление', 'Product management', 'Produktu pārvaldība')}
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
                            visibility={admin.visibility}
                            onVisibilityChange={admin.setVisibility}
                            viewMode={admin.viewMode}
                            setViewMode={(mode) => admin.setViewMode(mode as 'cards' | 'list')}
                            language={language}
                            archiveCount={admin.archiveItems.length}
                            onToggleArchive={setArchiveOpen}
                            archiveOpen={archiveOpen}
                            archiveItems={admin.archiveItems}
                            onRestoreArchive={admin.handleRestoreProduct}
                            onDeleteArchive={async (id) => {
                                const decision = await confirmAction({ title: t('admin.productsPage.confirm.deleteForever').replace('{id}', id), description: l('Товар будет окончательно удалён из архива без возможности восстановления.', 'The product will be permanently deleted from the archive.', 'Produkts tiks neatgriezeniski dzēsts no arhīva.'), confirmText: id, destructive: true });
                                if (decision.confirmed) admin.handlePurgeArchivedProduct(id);
                            }}
                        />
                        {bulkMode && !admin.loading && admin.products.length > 0 && (
                            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/40 px-4 py-3">
                                <Checkbox
                                    checked={allLoadedSelected}
                                    onCheckedChange={(checked) => setSelectedIds(checked ? new Set(admin.products.map((product) => product.id)) : new Set())}
                                    label={l('Выбрать все загруженные', 'Select all loaded', 'Atlasīt visus ielādētos')}
                                />
                                <span className="text-sm text-muted-foreground">
                                    {l(`Выбрано: ${selectedIds.size}`, `Selected: ${selectedIds.size}`, `Atlasīti: ${selectedIds.size}`)}
                                </span>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="destructive"
                                    className="sm:ml-auto"
                                    disabled={selectedIds.size === 0 || admin.savingId === 'bulk'}
                                    onClick={async () => {
                                        const ids = [...selectedIds];
                                        const decision = await confirmAction({
                                            title: l('Переместить выбранные товары в корзину?', 'Move selected products to trash?', 'Pārvietot atlasītos produktus uz atkritni?'),
                                            description: l('Они исчезнут из списка скрытых товаров. При необходимости их можно будет восстановить из корзины.', 'They will disappear from the hidden products list and can be restored from trash later.', 'Tie pazudīs no paslēpto produktu saraksta, un vēlāk tos varēs atjaunot no atkritnes.'),
                                            affected: admin.products.filter((product) => selectedIds.has(product.id)).map((product) => `${product.id} — ${product.title}`),
                                            destructive: true,
                                            confirmLabel: l(`В корзину (${ids.length})`, `Move to trash (${ids.length})`, `Uz atkritni (${ids.length})`),
                                        });
                                        if (!decision.confirmed) return;
                                        if (await admin.handleBulkDeleteProducts(ids)) setSelectedIds(new Set());
                                    }}
                                >
                                    {admin.savingId === 'bulk'
                                        ? l('Удаление…', 'Deleting…', 'Dzēšana…')
                                        : l(`Удалить выбранные (${selectedIds.size})`, `Delete selected (${selectedIds.size})`, `Dzēst atlasītos (${selectedIds.size})`)}
                                </Button>
                            </div>
                        )}
                        <hr className="my-8 border-t border-border" />
                        <div>
                            <h2 className="text-xl font-semibold mb-4">
                                {admin.viewMode === 'cards'
                                    ? t('admin.productsPage.cardsTitle')
                                    : t('admin.productsPage.listTitle')}
                            </h2>
                            {admin.loading ? (
                                <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground" role="status">
                                    {l('Загрузка товаров…', 'Loading products…', 'Produktu ielāde…')}
                                </div>
                            ) : admin.viewMode === 'cards' ? (
                                <ProductList
                                    products={admin.products}
                                    onEditProduct={handleEditProduct}
                                    onDeleteProduct={async (product: Product) => {
                                        const decision = await confirmAction({ title: t('admin.productsPage.confirm.moveToTrash').replace('{id}', product.id), description: l('Товар исчезнет с витрины и будет перемещён в архив.', 'The product will disappear from the storefront and move to the archive.', 'Produkts pazudīs no veikala un tiks pārvietots uz arhīvu.'), affected: [`${product.id} — ${product.title}`], destructive: true });
                                        if (!decision.confirmed) return;
                                        admin.handleDeleteProduct(product)
                                        logAdminAction('product.deleted', {
                                            type: 'product', id: product.id, title: product.title,
                                        }, { before: { price: product.price, stock: product.stock } })
                                    }}
                                    selectedIds={bulkMode ? selectedIds : undefined}
                                    onToggleSelected={bulkMode ? toggleSelected : undefined}
                                />
                            ) : (
                                <ProductTable
                                    products={admin.products}
                                    onEditProduct={handleEditProduct}
                                    onDeleteProduct={async (product: Product) => {
                                        const decision = await confirmAction({ title: t('admin.productsPage.confirm.moveToTrash').replace('{id}', product.id), description: l('Товар исчезнет с витрины и будет перемещён в архив.', 'The product will disappear from the storefront and move to the archive.', 'Produkts pazudīs no veikala un tiks pārvietots uz arhīvu.'), affected: [`${product.id} — ${product.title}`], destructive: true });
                                        if (!decision.confirmed) return;
                                        admin.handleDeleteProduct(product)
                                        logAdminAction('product.deleted', {
                                            type: 'product', id: product.id, title: product.title,
                                        }, { before: { price: product.price, stock: product.stock } })
                                    }}
                                    onQuickSave={async (id, changes) => {
                                        const product = admin.products.find((p) => p.id === id)
                                        if (!product?.revision) {
                                            throw new Error(l('Не удалось определить версию товара', 'Failed to determine the product version', 'Neizdevās noteikt produkta versiju'))
                                        }
                                        const response = await fetch('/api/admin/products', {
                                            method: 'PUT',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ id, revision: product.revision, changes }),
                                        })
                                        if (!response.ok) {
                                            throw new Error(l('Не удалось сохранить изменения товара', 'Failed to save product changes', 'Neizdevās saglabāt produkta izmaiņas'))
                                        }
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
                                    selectedIds={bulkMode ? selectedIds : undefined}
                                    onToggleSelected={bulkMode ? toggleSelected : undefined}
                                />
                            )}
                            {!admin.loading && admin.hasMore && (
                                <div className="mt-6 flex justify-center">
                                    <button
                                        type="button"
                                        onClick={() => void admin.loadMore()}
                                        disabled={admin.loadingMore}
                                        className="rounded-md border border-border bg-card px-5 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:cursor-wait disabled:opacity-60"
                                    >
                                        {admin.loadingMore ? l('Загрузка…', 'Loading…', 'Ielāde…') : l(`Показать ещё (${admin.products.length} из ${admin.total})`, `Show more (${admin.products.length} of ${admin.total})`, `Rādīt vairāk (${admin.products.length} no ${admin.total})`)}
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </main>
        </AdminGate>
    );
}
