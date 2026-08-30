import type { Order } from '@/lib/orders-store';
import type { CatalogProduct, EditItem } from './order-config';

export function findEditProducts(catalog: CatalogProduct[], search: string): CatalogProduct[] {
    const query = search.trim().toLowerCase();
    if (query.length < 2) return [];
    return catalog.filter((product) =>
        product.title.toLowerCase().includes(query)
        || product.brand.toLowerCase().includes(query)
        || (product.sku ?? '').toLowerCase().includes(query)
    ).slice(0, 8);
}

export function orderToEditItems(order: Order): EditItem[] {
    return order.items.map((item, index) => ({
        id: item.id,
        lineKey: item.lineKey || `legacy:${order.id}:${index}`,
        title: item.title,
        price: item.price,
        quantity: item.quantity,
        image: item.image,
        variantLabel: item.variantLabel,
    }));
}

export function updateEditItemQuantity(items: EditItem[], lineKey: string, quantity: number): EditItem[] {
    return quantity <= 0
        ? items.filter((item) => item.lineKey !== lineKey)
        : items.map((item) => item.lineKey === lineKey ? { ...item, quantity } : item);
}

export function addProductToEditItems(items: EditItem[], product: CatalogProduct): EditItem[] {
    const existing = items.find((item) => item.lineKey === product.id);
    if (existing) {
        return items.map((item) => item.lineKey === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item);
    }
    return [...items, {
        id: product.id,
        lineKey: product.id,
        title: product.title,
        price: product.price,
        quantity: 1,
        image: product.image,
    }];
}
