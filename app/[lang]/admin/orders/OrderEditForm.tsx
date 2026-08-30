'use client';

import Image from 'next/image';
import { Input } from '@/components/ui/input';
import { EDIT_DELIVERY_COSTS } from './order-config';
import { calculateOrderEditSummary } from './order-edit-summary';
import type { useAdminOrdersPage } from './useAdminOrdersPage';
import { useAdminLocale } from '@/lib/use-admin-locale';

type OrdersState = ReturnType<typeof useAdminOrdersPage>;
type Order = OrdersState['pageItems'][number];

export function OrderEditForm({ order, state }: { order: Order; state: OrdersState }): React.ReactElement | null {
    const { l } = useAdminLocale();
    const {
        editingOrderId, editItems, editAddress, setEditAddress, editCity, setEditCity,
        editPostalCode, setEditPostalCode, editDelivery, setEditDelivery, editProductSearch,
        setEditProductSearch, editSaving, editProductResults, cancelEdit, saveEdit, editUpdateQty,
        editAddProduct,
    } = state;
    const DELIVERY_LABELS: Record<string, string> = {
        courier: l('Курьер', 'Courier', 'Kurjers'), pickup: l('Самовывоз', 'Pickup', 'Saņemšana veikalā'),
        post: l('Почта (Omniva)', 'Parcel terminal (Omniva)', 'Pakomāts (Omniva)'), venipak: 'Venipak',
    };

    if (editingOrderId !== order.id) return null;

    return (

                                        <div className="rounded-xl border-2 border-primary/30 dark:border-primary/50 bg-primary/5/30 dark:bg-primary/20/10 p-4 space-y-5">
                                            <p className="text-sm font-semibold text-primary dark:text-primary/60">
                                                {l('Редактирование заказа', 'Edit order', 'Pasūtījuma rediģēšana')}
                                            </p>

                                            {/* Address */}
                                            <div className="space-y-2">
                                                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                                    {l('Адрес доставки', 'Delivery address', 'Piegādes adrese')}
                                                </p>
                                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                                    <Input
                                                        value={editAddress}
                                                        onChange={(e) =>
                                                            setEditAddress(e.target.value)
                                                        }
                                                        placeholder={l('Адрес', 'Address', 'Adrese')}
                                                        className="sm:col-span-2 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                                                    />
                                                    <Input
                                                        value={editPostalCode}
                                                        onChange={(e) =>
                                                            setEditPostalCode(e.target.value)
                                                        }
                                                        placeholder={l('Индекс', 'Postal code', 'Pasta indekss')}
                                                        className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                                                    />
                                                    <Input
                                                        value={editCity}
                                                        onChange={(e) =>
                                                            setEditCity(e.target.value)
                                                        }
                                                        placeholder={l('Город', 'City', 'Pilsēta')}
                                                        className="sm:col-span-3 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                                                    />
                                                </div>
                                            </div>

                                            {/* Delivery method */}
                                            <div className="space-y-2">
                                                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                                    {l('Способ доставки', 'Delivery method', 'Piegādes veids')}
                                                </p>
                                                <div className="flex flex-wrap gap-2">
                                                    {(['pickup', 'courier', 'post', 'venipak'] as const).map(
                                                        (dm) => (
                                                            <button
                                                                key={dm}
                                                                type="button"
                                                                onClick={() => setEditDelivery(dm)}
                                                                className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                                                                    editDelivery === dm
                                                                        ? 'border-primary/70 bg-primary/10 text-primary dark:border-primary dark:bg-primary/40 dark:text-primary/60'
                                                                        : 'border-border text-muted-foreground hover:border-gray-400'
                                                                }`}
                                                            >
                                                                {DELIVERY_LABELS[dm]}{' '}
                                                                {EDIT_DELIVERY_COSTS[dm] === 0
                                                                    ? l('(бесплатно)', '(free)', '(bez maksas)')
                                                                    : `(€${EDIT_DELIVERY_COSTS[dm]})`}
                                                            </button>
                                                        )
                                                    )}
                                                </div>
                                            </div>

                                            {/* Items */}
                                            <div className="space-y-2">
                                                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                                    {l('Позиции заказа', 'Order items', 'Pasūtījuma pozīcijas')}
                                                </p>
                                                <div className="rounded-lg border border-border divide-y divide-border bg-card">
                                                    {editItems.map((item) => (
                                                        <div
                                                            key={item.lineKey}
                                                            className="flex items-center gap-3 px-3 py-2.5"
                                                        >
                                                            {item.image && (
                                                                <Image
                                                                    unoptimized
                                                                    src={item.image}
                                                                    alt=""
                                                                    width={36}
                                                                    height={36}
                                                                    className="w-9 h-9 rounded object-cover shrink-0"
                                                                />
                                                            )}
                                                            <div className="flex-1 min-w-0">
                                                                <p className="text-sm text-foreground truncate">
                                                                    {item.title}
                                                                </p>
                                                                {item.variantLabel && (
                                                                    <p className="text-xs text-muted-foreground truncate">
                                                                        {item.variantLabel}
                                                                    </p>
                                                                )}
                                                            </div>
                                                            <span className="text-xs text-muted-foreground shrink-0">
                                                                €{item.price.toFixed(2)}
                                                            </span>
                                                            <div className="flex items-center gap-1 shrink-0">
                                                                <button
                                                                    type="button"
                                                                    onClick={() =>
                                                                        editUpdateQty(
                                                                            item.lineKey,
                                                                            item.quantity - 1
                                                                        )
                                                                    }
                                                                    className="h-6 w-6 rounded border border-border text-muted-foreground hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-center text-base leading-none"
                                                                >
                                                                    −
                                                                </button>
                                                                <span className="w-7 text-center text-sm tabular-nums">
                                                                    {item.quantity}
                                                                </span>
                                                                <button
                                                                    type="button"
                                                                    onClick={() =>
                                                                        editUpdateQty(
                                                                            item.lineKey,
                                                                            item.quantity + 1
                                                                        )
                                                                    }
                                                                    className="h-6 w-6 rounded border border-border text-muted-foreground hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-center text-base leading-none"
                                                                >
                                                                    +
                                                                </button>
                                                            </div>
                                                            <span className="text-sm font-medium text-foreground w-16 text-right tabular-nums shrink-0">
                                                                €
                                                                {(
                                                                    item.price * item.quantity
                                                                ).toFixed(2)}
                                                            </span>
                                                            <button
                                                                type="button"
                                                                onClick={() =>
                                                                    editUpdateQty(item.lineKey, 0)
                                                                }
                                                                className="text-muted-foreground hover:text-red-500 dark:hover:text-red-400 text-lg leading-none shrink-0"
                                                            >
                                                                ×
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>

                                                {/* Add product search */}
                                                <div className="relative">
                                                    <Input
                                                        value={editProductSearch}
                                                        onChange={(e) =>
                                                            setEditProductSearch(e.target.value)
                                                        }
                                                        placeholder={l('Добавить товар (введите название или SKU)...', 'Add product (enter name or SKU)...', 'Pievienot preci (ievadiet nosaukumu vai SKU)...')}
                                                        className="w-full rounded-lg border border-dashed border-primary/50 dark:border-primary/50 bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-gray-400"
                                                    />
                                                    {editProductResults.length > 0 && (
                                                        <div className="absolute z-30 left-0 right-0 top-full mt-1 rounded-lg border border-border bg-card shadow-xl max-h-60 overflow-y-auto">
                                                            {editProductResults.map((p) => (
                                                                <button
                                                                    key={p.id}
                                                                    type="button"
                                                                    onClick={() =>
                                                                        editAddProduct(p)
                                                                    }
                                                                    className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-primary/5 dark:hover:bg-primary/10 border-b border-border last:border-0"
                                                                >
                                                                    {p.image && (
                                                                        <Image
                                                                            unoptimized
                                                                            src={p.image}
                                                                            alt=""
                                                                            width={32}
                                                                            height={32}
                                                                            className="h-8 w-8 rounded object-cover shrink-0"
                                                                        />
                                                                    )}
                                                                    <div className="min-w-0 flex-1">
                                                                        <p className="text-sm text-foreground truncate">
                                                                            {p.title}
                                                                        </p>
                                                                        <p className="text-xs text-muted-foreground">
                                                                            {p.brand}
                                                                            {p.sku
                                                                                ? ` · ${p.sku}`
                                                                                : ''}
                                                                        </p>
                                                                    </div>
                                                                    <span className="text-sm font-semibold text-foreground shrink-0">
                                                                        €{p.price.toFixed(2)}
                                                                    </span>
                                                                </button>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Recalculated summary */}
                                            {editItems.length > 0 &&
                                                (() => {
                                                    const { subtotal: newSub, delivery: newDel, discount: newDisc, total: newTotal } =
                                                        calculateOrderEditSummary(order, editItems, editDelivery);
                                                    return (
                                                        <div className="flex justify-end">
                                                            <div className="text-sm space-y-1 min-w-[220px]">
                                                                <div className="flex justify-between gap-4 text-muted-foreground">
                                                                    <span>{l('Товары', 'Products', 'Preces')}</span>
                                                                    <span className="tabular-nums">
                                                                        €{newSub.toFixed(2)}
                                                                    </span>
                                                                </div>
                                                                {newDisc > 0 && (
                                                                    <div className="flex justify-between gap-4 text-emerald-600 dark:text-emerald-400">
                                                                        <span>{l('Скидка', 'Discount', 'Atlaide')}</span>
                                                                        <span className="tabular-nums">
                                                                            −€
                                                                            {newDisc.toFixed(2)}
                                                                        </span>
                                                                    </div>
                                                                )}
                                                                <div className="flex justify-between gap-4 text-muted-foreground">
                                                                    <span>{l('Доставка', 'Delivery', 'Piegāde')}</span>
                                                                    <span className="tabular-nums">
                                                                        {newDel === 0
                                                                            ? l('Бесплатно', 'Free', 'Bez maksas')
                                                                            : `€${newDel.toFixed(
                                                                                  2
                                                                              )}`}
                                                                    </span>
                                                                </div>
                                                                <div className="flex justify-between gap-4 font-bold text-base text-foreground pt-1 border-t border-border">
                                                                    <span>{l('Итого', 'Total', 'Kopā')}</span>
                                                                    <span className="tabular-nums">
                                                                        €{newTotal.toFixed(2)}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                })()}

                                            {/* Save / Cancel */}
                                            <div className="flex gap-2 pt-1">
                                                <button
                                                    type="button"
                                                    disabled={editSaving || editItems.length === 0}
                                                    onClick={() => saveEdit(order)}
                                                    className="rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2 text-sm font-medium disabled:opacity-40 transition-colors"
                                                >
                                                    {editSaving
                                                        ? l('Сохранение...', 'Saving...', 'Saglabā...')
                                                        : l('Сохранить изменения', 'Save changes', 'Saglabāt izmaiņas')}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={cancelEdit}
                                                    className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                                                >
                                                    {l('Отмена', 'Cancel', 'Atcelt')}
                                                </button>
                                            </div>
                                        </div>
                                    
    );
}

