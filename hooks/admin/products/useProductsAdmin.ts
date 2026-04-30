import { useState, useEffect, useMemo } from 'react';
import { PRODUCTS, type Product } from '@/data/products';
import type { ArchivedProductRecord } from '@/lib/product-overrides-store';
import type { DraftValues, NewProductDraft } from '@/types/product-admin';
import { useTranslation } from '@/lib/use-translation';
import { useSiteContent } from '@/lib/use-site-content';
import { CATEGORY_OPTIONS } from '@/lib/admin/products/constants';

export function useProductsAdmin() {
  const { t } = useTranslation();
  const { overrides, setText } = useSiteContent();
  const [baseProducts, setBaseProducts] = useState<Product[]>(PRODUCTS);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [purgingArchiveId, setPurgingArchiveId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'cards' | 'list'>('cards');
  const [newProduct, setNewProduct] = useState<NewProductDraft>({
    id: '',
    title: '',
    brand: '',
    category: CATEGORY_OPTIONS[0],
    price: '',
    badges: [],
    stock: '',
    image: '',
  });
  const [archiveItems, setArchiveItems] = useState<ArchivedProductRecord[]>([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(false);
  }, []);

  const filteredProducts = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    return baseProducts.filter((product) => {
      const values = [
        product.id,
        product.sku,
        product.title,
        product.brand,
        product.category,
        product.purpose,
        ...Object.values(product.technicalSpecs || {}),
      ]
        .filter(Boolean)
        .map((v) => String(v).toLowerCase());
      return values.some((v) => v.includes(normalizedQuery));
    });
  }, [searchQuery, baseProducts]);

  // Заглушки для обработчиков (реализуйте по необходимости)
  const handleDeleteProduct = (product: Product) => {};
  const handleRestoreProduct = (id: string) => {};
  const handlePurgeArchivedProduct = (id: string) => {};
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
    message,
    error,
  };
}
