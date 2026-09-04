import { useState, useEffect, useCallback, useRef, type Dispatch, type SetStateAction } from 'react';
import type { Product } from '@/data/products';
import type { ArchivedProductRecord } from '@/lib/product-overrides-store';
import type { NewProductDraft } from '@/types/product-admin';
import { useTranslation } from '@/lib/use-translation';
import { CATEGORY_OPTIONS } from '@/lib/admin/products/constants';
import { consumeProductsListReturnState } from '@/lib/admin/products/list-return-state';
import { usePersistentViewMode } from '@/hooks/usePersistentViewMode';

type ApiEnvelope<T> = { success: true; data: T } | { error: string };

type ProductsAdminResult = {
  products: Product[];
  viewMode: 'cards' | 'list';
  setViewMode: Dispatch<SetStateAction<'cards' | 'list'>>;
  searchQuery: string;
  setSearchQuery: Dispatch<SetStateAction<string>>;
  visibility: 'all' | 'active' | 'hidden';
  setVisibility: Dispatch<SetStateAction<'all' | 'active' | 'hidden'>>;
  newProduct: NewProductDraft;
  setNewProduct: Dispatch<SetStateAction<NewProductDraft>>;
  archiveItems: ArchivedProductRecord[];
  handleDeleteProduct: (product: Product) => Promise<void>;
  handleBulkDeleteProducts: (ids: string[]) => Promise<boolean>;
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
  loadMore: () => Promise<void>;
  hasMore: boolean;
  loadingMore: boolean;
  total: number;
};

const PRODUCTS_PAGE_SIZE = 24;
const VIEW_MODE_STORAGE_KEY = 'admin:products:viewMode';
const PRODUCT_VIEW_MODES = ['cards', 'list'] as const;

export function useProductsAdmin(): ProductsAdminResult {
  const { t } = useTranslation();
  const [initialReturn] = useState(() => consumeProductsListReturnState());
  const didInitialLoadRef = useRef(false);
  const [baseProducts, setBaseProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [creating] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [purgingArchiveId, setPurgingArchiveId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState(initialReturn?.searchQuery ?? '');
  const [visibility, setVisibility] = useState<'all' | 'active' | 'hidden'>(initialReturn?.visibility ?? 'all');
  const [viewMode, setViewMode] = usePersistentViewMode(VIEW_MODE_STORAGE_KEY, initialReturn?.viewMode ?? 'cards', PRODUCT_VIEW_MODES);
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
  const requestSequence = useRef(0);

  const loadProducts = useCallback(async (pageToLoad = 1, append = false) => {
    const requestId = ++requestSequence.current;
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        page: String(pageToLoad),
        limit: String(PRODUCTS_PAGE_SIZE),
      });
      if (searchQuery.trim()) params.set('q', searchQuery.trim());
      if (visibility !== 'all') params.set('visibility', visibility);
      const res = await fetch(`/api/admin/products?${params}`, { cache: 'no-store' });
      const json = (await res.json()) as ApiEnvelope<{ products: Product[]; total: number }>;
      if (!res.ok || 'error' in json) throw new Error('failed_to_load_products');
      if (requestId !== requestSequence.current) return;
      setBaseProducts((current) => append ? [...current, ...json.data.products] : json.data.products);
      setTotal(json.data.total);
      setPage(pageToLoad);
    } catch {
      if (requestId !== requestSequence.current) return;
      setError(t('admin.productsPage.msg.loadApiFailed', 'Failed to load products from API'));
    } finally {
      if (requestId !== requestSequence.current) return;
      if (append) setLoadingMore(false);
      else setLoading(false);
    }
  }, [searchQuery, visibility, t]);

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
    if (didInitialLoadRef.current) {
      queueMicrotask(() => void loadProducts());
      return;
    }
    didInitialLoadRef.current = true;
    if (!initialReturn) {
      queueMicrotask(() => void loadProducts());
      return;
    }
    let cancelled = false;
    (async () => {
      const pagesNeeded = Math.max(1, Math.ceil(initialReturn.loadedCount / PRODUCTS_PAGE_SIZE));
      for (let p = 1; p <= pagesNeeded && !cancelled; p += 1) {
        await loadProducts(p, p > 1);
      }
      if (cancelled) return;
      requestAnimationFrame(() => {
        document.getElementById(`admin-product-row-${initialReturn.productId}`)?.scrollIntoView({ block: 'center' });
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [loadProducts, initialReturn]);

  useEffect(() => {
    queueMicrotask(() => void loadArchive());
  }, [loadArchive]);

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
      await loadProducts(1);
      await loadArchive();
      setMessage(t('admin.productsPage.msg.movedToTrash', 'Product {id} moved to trash', { id: product.id }));
    } catch {
      setError(t('admin.productsPage.msg.deleteByIdFailed', 'Failed to delete product {id}', { id: product.id }));
    } finally {
      setSavingId(null);
    }
  };

  const handleBulkDeleteProducts = async (ids: string[]): Promise<boolean> => {
    if (ids.length === 0) return false;
    setSavingId('bulk');
    setError('');
    try {
      const res = await fetch('/api/admin/products', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, permanently: true }),
      });
      const json = (await res.json()) as ApiEnvelope<{ deletedCount: number }>;
      if (!res.ok || 'error' in json) throw new Error('failed');
      await loadProducts(1);
      await loadArchive();
      setMessage(t('admin.productsPage.msg.bulkMovedToTrash', '{count} products moved to trash', { count: ids.length }));
      return true;
    } catch {
      setError(t('admin.productsPage.msg.bulkDeleteFailed', 'Failed to delete selected products'));
      return false;
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
      await loadProducts(1);
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
    products: baseProducts,
    viewMode,
    setViewMode,
    searchQuery,
    setSearchQuery,
    visibility,
    setVisibility,
    newProduct,
    setNewProduct,
    archiveItems,
    handleDeleteProduct,
    handleBulkDeleteProducts,
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
    reload: () => loadProducts(1),
    loadMore: () => loadProducts(page + 1, true),
    hasMore: baseProducts.length < total,
    loadingMore,
    total,
  };
}
