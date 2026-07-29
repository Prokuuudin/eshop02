import { useState, useEffect, useCallback, useMemo, type Dispatch, type SetStateAction } from 'react';
import type { Product } from '@/data/products';
import type { ArchivedProductRecord } from '@/lib/product-overrides-store';
import type { NewProductDraft } from '@/types/product-admin';
import { useTranslation } from '@/lib/use-translation';
import { CATEGORY_OPTIONS } from '@/lib/admin/products/constants';

type ApiEnvelope<T> = { success: true; data: T } | { error: string };

type ProductsAdminResult = {
  products: Product[];
  viewMode: 'cards' | 'list';
  setViewMode: Dispatch<SetStateAction<'cards' | 'list'>>;
  searchQuery: string;
  setSearchQuery: Dispatch<SetStateAction<string>>;
  newProduct: NewProductDraft;
  setNewProduct: Dispatch<SetStateAction<NewProductDraft>>;
  archiveItems: ArchivedProductRecord[];
  handleDeleteProduct: (product: Product) => Promise<void>;
  handleRestoreProduct: (id: string) => Promise<void>;
  handlePurgeArchivedProduct: (id: string) => Promise<void>;
  handleCreateProduct: () => void;
  loading: boolean;
  creating: boolean;
  savingId: string | null;
  restoringId: string | null;
  purgingArchiveId: string | null;
  message: string;
  error: string;
  reload: () => Promise<void>;
};

export function useProductsAdmin(): ProductsAdminResult {
  const { t } = useTranslation();
  const [baseProducts, setBaseProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [purgingArchiveId, setPurgingArchiveId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'cards' | 'list'>('cards');
  const [newProduct, setNewProduct] = useState<NewProductDraft>({
    id: '',
    title: '',
    brand: '',
    category: CATEGORY_OPTIONS[0] as import('@/data/products').CategoryType,
    price: '',
    badges: [],
    stock: '',
    image: '',
  });
  const [archiveItems, setArchiveItems] = useState<ArchivedProductRecord[]>([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const loadProducts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/products', { cache: 'no-store' });
      const json = (await res.json()) as ApiEnvelope<{ products: Product[] }>;
      if (!res.ok || 'error' in json) throw new Error('failed_to_load_products');
      setBaseProducts(json.data.products);
    } catch {
      setError(t('admin.productsPage.msg.loadApiFailed', 'Failed to load products from API'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  const loadArchive = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/products/archive', { cache: 'no-store' });
      const json = (await res.json()) as ApiEnvelope<{ archive: ArchivedProductRecord[] }>;
      if (!res.ok || 'error' in json) throw new Error('failed_to_load_archive');
      setArchiveItems(json.data.archive);
    } catch {
      // Archive is secondary — a failed fetch shouldn't block the main product list.
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void loadProducts();
      void loadArchive();
    });
  }, [loadProducts, loadArchive]);

  const filteredProducts = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    if (!normalizedQuery) return baseProducts;
    return baseProducts.filter((product) => {
      const values = [
        product.id,
        product.sku,
        product.title,
        product.brand,
        product.category,
        ...Object.values(
          Object.fromEntries(
            Object.entries(product.technicalSpecs || {}).filter(([key]) => key !== '__variantGroupsJson')
          )
        ),
      ]
        .filter(Boolean)
        .map((v) => String(v).toLowerCase());
      return values.some((v) => v.includes(normalizedQuery));
    });
  }, [searchQuery, baseProducts]);

  const handleDeleteProduct = async (product: Product) => {
    setSavingId(product.id);
    setError('');
    try {
      const res = await fetch('/api/admin/products', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: product.id, permanently: true }),
      });
      const json = (await res.json()) as ApiEnvelope<{ products: Product[] }>;
      if (!res.ok || 'error' in json) throw new Error('failed');
      setBaseProducts(json.data.products);
      await loadArchive();
      setMessage(t('admin.productsPage.msg.movedToTrash', 'Product {id} moved to trash', { id: product.id }));
    } catch {
      setError(t('admin.productsPage.msg.deleteByIdFailed', 'Failed to delete product {id}', { id: product.id }));
    } finally {
      setSavingId(null);
    }
  };

  const handleRestoreProduct = async (id: string) => {
    setRestoringId(id);
    setError('');
    try {
      const res = await fetch('/api/admin/products/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const json = (await res.json()) as ApiEnvelope<{ products: Product[]; archive: ArchivedProductRecord[] }>;
      if (!res.ok || 'error' in json) throw new Error('failed');
      setBaseProducts(json.data.products);
      setArchiveItems(json.data.archive);
      setMessage(t('admin.productsPage.msg.restored', 'Product {id} restored', { id }));
    } catch {
      setError(t('admin.productsPage.msg.restoreByIdFailed', 'Failed to restore product {id}', { id }));
    } finally {
      setRestoringId(null);
    }
  };

  const handlePurgeArchivedProduct = async (id: string) => {
    setPurgingArchiveId(id);
    setError('');
    try {
      const res = await fetch('/api/admin/products/archive', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const json = (await res.json()) as ApiEnvelope<{ archive: ArchivedProductRecord[] }>;
      if (!res.ok || 'error' in json) throw new Error('failed');
      setArchiveItems(json.data.archive);
      setMessage(t('admin.productsPage.msg.deletedForever', 'Product {id} removed from trash permanently', { id }));
    } catch {
      setError(t('admin.productsPage.msg.deleteTrashByIdFailed', 'Failed to delete product {id} from trash', { id }));
    } finally {
      setPurgingArchiveId(null);
    }
  };

  const handleCreateProduct = () => {};

  return {
    products: filteredProducts,
    viewMode,
    setViewMode,
    searchQuery,
    setSearchQuery,
    newProduct,
    setNewProduct,
    archiveItems,
    handleDeleteProduct,
    handleRestoreProduct,
    handlePurgeArchivedProduct,
    handleCreateProduct,
    loading,
    creating,
    savingId,
    restoringId,
    purgingArchiveId,
    message,
    error,
    reload: loadProducts,
  };
}
