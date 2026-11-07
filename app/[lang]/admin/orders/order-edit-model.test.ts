import { describe, expect, it } from 'vitest';
import type { Order } from '@/lib/orders-store';
import type { CatalogProduct, EditItem } from './order-config';
import { addProductToEditItems, canAddWithVariants, chosenVariants, findEditProducts, orderToEditItems, updateEditItemQuantity } from './order-edit-model';

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

describe('adding a product with options', () => {
    const chair: CatalogProduct = {
        id: 'chair', title: 'PANDA GALAXY BASIC', brand: 'B', price: 781, stock: 5,
        variantGroups: [
            { name: 'Bāze', required: true, options: [{ value: 'BASE XT', priceAdjustment: -42.5 }, { value: 'BASE XM', priceAdjustment: 46.04 }] },
            { name: 'Soma', required: false, options: [{ value: 'Ar somu', priceAdjustment: 10.1 }] },
        ],
    };

    it('waits for every required group, and ignores unknown choices', () => {
        expect(canAddWithVariants(chair, chosenVariants(chair, {}))).toBe(false);
        expect(canAddWithVariants(chair, chosenVariants(chair, { Soma: 'Ar somu' }))).toBe(false);
        expect(canAddWithVariants(chair, chosenVariants(chair, { Bāze: 'BASE XZ' }))).toBe(false);
        expect(canAddWithVariants(chair, chosenVariants(chair, { Bāze: 'BASE XM' }))).toBe(true);
    });

    it('adds one line per configuration, shown with its price and label', () => {
        const xm = chosenVariants(chair, { Bāze: 'BASE XM', Soma: 'Ar somu' });
        const once = addProductToEditItems([], chair, xm);
        expect(once[0]).toMatchObject({ lineKey: 'chair::Bāze=BASE XM,Soma=Ar somu', price: 837.14, variantLabel: 'Bāze: BASE XM, Soma: Ar somu', quantity: 1 });
        const again = addProductToEditItems(once, chair, xm);
        expect(again).toHaveLength(1);
        expect(again[0].quantity).toBe(2);
        const other = addProductToEditItems(again, chair, chosenVariants(chair, { Bāze: 'BASE XT' }));
        expect(other.map((item) => [item.lineKey, item.price])).toEqual([['chair::Bāze=BASE XM,Soma=Ar somu', 837.14], ['chair::Bāze=BASE XT', 738.5]]);
    });
});
