'use client';

import { useEffect } from 'react';
import { findUnsellableCartIds } from '@/lib/product-sellability';

type ProductsResponse = { data?: { products?: Array<{ id: string; priceUnavailable?: boolean }> } };

/** Removes cart lines whose product is no longer for sale (checked once per id set). */
export function useRemoveUnsellableCartItems(
    items: Array<{ id: string; lineKey: string }>,
    removeItem: (lineKey: string) => void,
    onRemoved: (count: number) => void,
): void {
    const ids = [...new Set(items.map((item) => item.id))].sort().slice(0, 100);
    const signature = ids.join(',');

    useEffect(() => {
        if (!signature) return;
        const requested = signature.split(',');
        const controller = new AbortController();
        void fetch(`/api/products?ids=${requested.map(encodeURIComponent).join(',')}`, { cache: 'no-store', signal: controller.signal })
            .then(async (response) => {
                // Only a definite answer may remove lines; errors leave the cart untouched.
                if (!response.ok) return;
                const payload = (await response.json()) as ProductsResponse;
                const products = payload.data?.products;
                if (!Array.isArray(products) || controller.signal.aborted) return;
                const unsellable = new Set(findUnsellableCartIds(requested, products));
                const lines = items.filter((item) => unsellable.has(item.id));
                lines.forEach((line) => removeItem(line.lineKey));
                if (lines.length > 0) onRemoved(lines.length);
            })
            .catch(() => undefined);
        return () => controller.abort();
        // eslint-disable-next-line react-hooks/exhaustive-deps -- rerun only when the set of product ids changes
    }, [signature]);
}
