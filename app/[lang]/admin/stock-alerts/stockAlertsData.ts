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

export type StockAlertsResponse = {
    products: StockAlertRow[];
    total: number;
    productCount: number;
    outCount: number;
    lowCount: number;
    unconfirmedCount: number;
    page: number;
    limit: number;
    totalPages: number;
};

export async function fetchStockAlerts(params: {
    page: number;
    limit: number;
    threshold: number;
    search: string;
    filter: 'all' | 'low' | 'out';
    hideUnconfirmed: boolean;
    signal?: AbortSignal;
}): Promise<StockAlertsResponse> {
    const query = new URLSearchParams({
        page: String(params.page),
        limit: String(params.limit),
        threshold: String(params.threshold),
        q: params.search,
        filter: params.filter,
        hideUnconfirmed: String(params.hideUnconfirmed),
    });
    const res = await fetch(`/api/admin/stock-alerts?${query}`, { signal: params.signal });
    if (!res.ok) throw new Error(`Stock alerts request failed: ${res.status}`);
    return res.json() as Promise<StockAlertsResponse>;
}
