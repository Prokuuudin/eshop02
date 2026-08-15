export type Product = {
    id: string;
    title: string;
    brand: string;
    category: string;
    stock: number;
    sku?: string;
    price: number;
};

/**
 * A stock-alerts table row: the raw product plus whether its `stock` number is
 * backed by real ERP data.
 *
 * `synced` mirrors the `Product.externalId !== null` check that
 * lib/product-overrides-store.ts already uses to block manual stock edits on
 * ERP-managed products, and that lib/warehouse-availability.ts uses to look up
 * real per-warehouse quantities. A product with `synced: false` has never been
 * touched by the ERP sync, so its `stock` is whatever was set at import time —
 * most commonly the nopCommerce `10000` placeholder present on ~80% of the
 * catalog, but any other unconfirmed value is equally untrustworthy.
 */
export type StockAlertRow = Product & { synced: boolean };

/** Fetches the admin product list. The route wraps its payload as `{ data: { products } }`. */
export async function fetchStockAlertProducts(): Promise<Product[]> {
    const res = await fetch('/api/admin/products');
    const body = (await res.json()) as { data?: { products?: Product[] } };
    return Array.isArray(body.data?.products) ? (body.data!.products as Product[]) : [];
}

/** Fetches the set of product ids that carry a real (ERP-synced) `Product.externalId`. */
export async function fetchSyncedProductIds(): Promise<Set<string>> {
    const res = await fetch('/api/admin/products/sync-status');
    const body = (await res.json()) as { syncedIds?: string[] };
    return new Set(Array.isArray(body.syncedIds) ? body.syncedIds : []);
}

/**
 * Combines the raw product list with the ERP sync-status set so the UI can tell,
 * per row, whether an alert is backed by trustworthy stock data or is noise from
 * an unconfirmed placeholder.
 */
export function deriveStockAlertRows(products: Product[], syncedIds: Set<string>): StockAlertRow[] {
    return products.map((p) => ({ ...p, synced: syncedIds.has(p.id) }));
}
