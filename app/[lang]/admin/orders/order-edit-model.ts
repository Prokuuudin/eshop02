import type { Order } from '@/lib/orders-store';
import type { SelectedVariant } from '@/data/products';
import { buildLineKey } from '@/lib/cart-store';
import { getMissingRequiredGroups, variantUnitPrice } from '@/lib/product-variants';
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

/** Options chosen in the admin form, in group order; empty choices are left out. */
export function chosenVariants(product: CatalogProduct, choice: Record<string, string>): SelectedVariant[] {
    return (product.variantGroups ?? []).flatMap((group) => {
        const option = group.options.find((candidate) => candidate.value === choice[group.name]);
        return option ? [{ groupName: group.name, value: option.value, ...(typeof option.priceAdjustment === 'number' ? { priceAdjustment: option.priceAdjustment } : {}) }] : [];
    });
}

export function canAddWithVariants(product: CatalogProduct, selected: SelectedVariant[]): boolean {
    return getMissingRequiredGroups(product.variantGroups, selected).length === 0;
}

/** Price shown in the form only; the server prices the line again from the product. */
export function addProductToEditItems(items: EditItem[], product: CatalogProduct, selectedVariants: SelectedVariant[] = []): EditItem[] {
    const lineKey = buildLineKey(product.id, selectedVariants);
    const existing = items.find((item) => item.lineKey === lineKey);
    if (existing) {
        return items.map((item) => item.lineKey === lineKey
            ? { ...item, quantity: item.quantity + 1 }
            : item);
    }
    return [...items, {
        id: product.id,
        lineKey,
        title: product.title,
        price: variantUnitPrice(product.price, selectedVariants),
        quantity: 1,
        image: product.image,
        ...(selectedVariants.length ? {
            selectedVariants,
            variantLabel: selectedVariants.map((variant) => `${variant.groupName}: ${variant.value}`).join(', '),
        } : {}),
    }];
}
