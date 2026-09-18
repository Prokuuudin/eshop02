import { useState, useEffect, useCallback, useRef, type Dispatch, type SetStateAction } from 'react';
import type { Product } from '@/data/products';
import type { ArchivedProductRecord } from '@/lib/product-overrides-store';
import type { NewProductDraft } from '@/types/product-admin';
import { useTranslation } from '@/lib/use-translation';
import { useToast } from '@/lib/toast-context';
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
  handleBulkRestoreArchivedProducts: (ids: string[]) => Promise<boolean>;
  handleBulkPurgeArchivedProducts: (ids: string[]) => Promise<boolean>;
  handleCreateProduct: () => void;
  loading: boolean;
  creating: boolean;
  savingId: string | null;
  restoringId: string | null;
  purgingArchiveId: string | null;
  archiveBulkPending: boolean;
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
  const { showToast } = useToast();
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
  const [archiveBulkPending, setArchiveBulkPending] = useState(false);
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
      const json = (await res.json()) as ApiEnvelope<{ archive: ArchivedProductRecord[] }>;
      if (!res.ok || 'error' in json) throw new Error('failed');
      await loadProducts(1);
      setArchiveItems(json.data.archive);
      const restoredMsg = t('admin.productsPage.msg.restored', 'Product {id} restored', { id });
      setMessage(restoredMsg);
      showToast(restoredMsg, 'success');
    } catch {
      const failedMsg = t('admin.productsPage.msg.restoreByIdFailed', 'Failed to restore product {id}', { id });
      setError(failedMsg);
      showToast(failedMsg, 'error');
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
      const purgedMsg = t('admin.productsPage.msg.deletedForever', 'Product {id} removed from trash permanently', { id });
      setMessage(purgedMsg);
      showToast(purgedMsg, 'success');
    } catch {
      const failedMsg = t('admin.productsPage.msg.deleteTrashByIdFailed', 'Failed to delete product {id} from trash', { id });
      setError(failedMsg);
      showToast(failedMsg, 'error');
    } finally {
      setPurgingArchiveId(null);
    }
  };

  const handleBulkRestoreArchivedProducts = async (ids: string[]): Promise<boolean> => {
    if (ids.length === 0) return false;
    setArchiveBulkPending(true);
    setError('');
    // Fired concurrently: the server serializes the actual writes behind a single
    // advisory lock anyway, so awaiting one id at a time here only stacks up
    // client-to-Neon round-trip latency for no benefit (looked like a hang on 20+ items).
    const results = await Promise.allSettled(ids.map(async (id) => {
      const res = await fetch('/api/admin/products/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const json = (await res.json()) as ApiEnvelope<unknown>;
      if (!res.ok || 'error' in json) throw new Error('failed');
    }));
    const restoredCount = results.filter((r) => r.status === 'fulfilled').length;
    await loadProducts(1);
    await loadArchive();
    setArchiveBulkPending(false);
    if (restoredCount < ids.length) {
      const failedMsg = t('admin.productsPage.msg.bulkRestoreFailed', 'Restored {restored} of {total} products', { restored: restoredCount, total: ids.length });
      setError(failedMsg);
      showToast(failedMsg, restoredCount > 0 ? 'info' : 'error');
      return restoredCount > 0;
    }
    const restoredMsg = t('admin.productsPage.msg.bulkRestored', '{count} products restored', { count: restoredCount });
    setMessage(restoredMsg);
    showToast(restoredMsg, 'success');
    return true;
  };

  const handleBulkPurgeArchivedProducts = async (ids: string[]): Promise<boolean> => {
    if (ids.length === 0) return false;
    setArchiveBulkPending(true);
    setError('');
    const results = await Promise.allSettled(ids.map(async (id) => {
      const res = await fetch('/api/admin/products/archive', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const json = (await res.json()) as ApiEnvelope<unknown>;
      if (!res.ok || 'error' in json) throw new Error('failed');
    }));
    const purgedCount = results.filter((r) => r.status === 'fulfilled').length;
    await loadArchive();
    setArchiveBulkPending(false);
    if (purgedCount < ids.length) {
      const failedMsg = t('admin.productsPage.msg.bulkPurgeFailed', 'Deleted {deleted} of {total} products from trash', { deleted: purgedCount, total: ids.length });
      setError(failedMsg);
      showToast(failedMsg, purgedCount > 0 ? 'info' : 'error');
      return purgedCount > 0;
    }
    const purgedMsg = t('admin.productsPage.msg.bulkDeletedForever', '{count} products permanently removed from trash', { count: purgedCount });
    setMessage(purgedMsg);
    showToast(purgedMsg, 'success');
    return true;
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
    handleBulkRestoreArchivedProducts,
    handleBulkPurgeArchivedProducts,
    handleCreateProduct,
    loading,
    creating,
    savingId,
    restoringId,
    purgingArchiveId,
    archiveBulkPending,
    message,
    error,
    reload: () => loadProducts(1),
    loadMore: () => loadProducts(page + 1, true),
    hasMore: baseProducts.length < total,
    loadingMore,
    total,
  };
}
