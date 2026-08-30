import { describe, expect, it } from 'vitest';
import type { Order } from '@/lib/orders-store';
import type { CatalogProduct, EditItem } from './order-config';
import { addProductToEditItems, findEditProducts, orderToEditItems, updateEditItemQuantity } from './order-edit-model';

const product: CatalogProduct = { id: 'p1', title: 'Repair Shampoo', brand: 'Pro', sku: 'RP-1', price: 12, stock: 5, image: '/p1.jpg' };
const item: EditItem = { id: 'p1', lineKey: 'p1', title: product.title, price: 12, quantity: 1, image: product.image };

describe('order edit model', () => {
    it('finds products by title, brand or SKU', () => {
        expect(findEditProducts([product], 'repair')).toEqual([product]);
        expect(findEditProducts([product], 'rp-1')).toEqual([product]);
        expect(findEditProducts([product], 'r')).toEqual([]);
    });

    it('adds, increments, updates and removes edit items immutably', () => {
        const added = addProductToEditItems([], product);
        expect(addProductToEditItems(added, product)[0].quantity).toBe(2);
        expect(updateEditItemQuantity([item], item.lineKey, 3)[0].quantity).toBe(3);
        expect(updateEditItemQuantity([item], item.lineKey, 0)).toEqual([]);
        expect(item.quantity).toBe(1);
    });

    it('gives legacy order rows stable unique line keys', () => {
        const order = { id: 'o1', items: [{ ...item, lineKey: undefined }, { ...item, lineKey: undefined }] } as unknown as Order;
        expect(orderToEditItems(order).map((entry) => entry.lineKey)).toEqual(['legacy:o1:0', 'legacy:o1:1']);
    });
});
