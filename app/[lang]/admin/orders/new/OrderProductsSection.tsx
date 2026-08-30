'use client';

import Image from 'next/image';
import { Input } from '@/components/ui/input';
import { formatEuro } from '@/lib/utils';
import type { useNewOrderPage } from './useNewOrderPage';
import { OrderFormSection } from './OrderFormFields';

type State = ReturnType<typeof useNewOrderPage>;

export default function OrderProductsSection({ state }: { state: State }): React.ReactElement {
    const {
        l,
        locale,
        productSearch,
        setProductSearch,
        showDropdown,
        setShowDropdown,
        items,
        productResults,
        addProduct,
        removeItem,
        updateQty,
        updateUnitPrice,
    } = state;

    return (
        <OrderFormSection title={l('Товары', 'Products', 'Preces')}>
            {/* Search */}
            <div className="relative">
                <Input
                    value={productSearch}
                    onChange={(e) => {
                        setProductSearch(e.target.value);
                        setShowDropdown(true);
                    }}
                    onFocus={() => setShowDropdown(true)}
                    placeholder={l('Поиск по названию, SKU, бренду...', 'Search by name, SKU, or brand...', 'Meklēt pēc nosaukuma, SKU vai zīmola...')}
                />
                {showDropdown && productResults.length > 0 && (
                    <div className="absolute z-20 left-0 right-0 top-full mt-1 rounded-lg border border-border bg-card shadow-xl max-h-72 overflow-y-auto">
                        {productResults.map((p) => (
                            <button
                                key={p.id}
                                type="button"
                                onClick={() => addProduct(p)}
                                className="w-full text-left px-3 py-2.5 hover:bg-primary/5 dark:hover:bg-primary/10 flex items-center gap-3 border-b border-border last:border-0"
                            >
                                {p.image && (
                                    <Image
                                        unoptimized
                                        src={p.image}
                                        alt=""
                                        width={36}
                                        height={36}
                                        className="h-9 w-9 rounded object-cover shrink-0"
                                    />
                                )}
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium text-foreground truncate">
                                        {p.title}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        {p.brand}
                                        {p.sku ? ` · ${p.sku}` : ''}
                                    </p>
                                </div>
                                <div className="shrink-0 text-right">
                                    <p className="text-sm font-semibold text-foreground">
                                        {formatEuro(p.price, locale)}
                                    </p>
                                    <p
                                        className={`text-xs ${
                                            p.stock === 0
                                                ? 'text-red-500'
                                                : 'text-gray-400'
                                        }`}
                                    >
                                        {p.stock === 0 ? l('нет', 'none', 'nav') : `${p.stock} ${l('шт', 'pcs', 'gab.')}`}
                                    </p>
                                </div>
                            </button>
                        ))}
                    </div>
                )}
            </div>
        
            {/* Added items */}
            {items.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                    {l('Начните вводить название товара чтобы добавить его в заказ', 'Start typing a product name to add it to the order', 'Sāciet rakstīt preces nosaukumu, lai pievienotu to pasūtījumam')}
                </p>
            ) : (
                <div className="space-y-2">
                    {items.map((item) => (
                        <div
                            key={item.product.id}
                            className="flex items-center gap-3 rounded-lg border border-border bg-muted px-3 py-2.5"
                        >
                            {item.product.image && (
                                <Image
                                    unoptimized
                                    src={item.product.image}
                                    alt=""
                                    width={40}
                                    height={40}
                                    className="h-10 w-10 rounded object-cover shrink-0"
                                />
                            )}
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-foreground truncate">
                                    {item.product.title}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    {item.product.brand}
                                </p>
                            </div>
                            {/* Unit price override */}
                            <div className="flex items-center gap-1 shrink-0">
                                <span className="text-xs text-muted-foreground">€</span>
                                <Input
                                    type="number"
                                    min={0}
                                    step={0.01}
                                    value={item.unitPrice}
                                    onChange={(e) =>
                                        updateUnitPrice(
                                            item.product.id,
                                            parseFloat(e.target.value)
                                        )
                                    }
                                    className="h-8 w-20 px-2 py-1 text-sm text-center tabular-nums"
                                    title={l('Цена за единицу (можно изменить)', 'Unit price (editable)', 'Vienības cena (rediģējama)')}
                                />
                            </div>
                            {/* Qty */}
                            <div className="flex items-center gap-1 shrink-0">
                                <button
                                    type="button"
                                    onClick={() =>
                                        updateQty(
                                            item.product.id,
                                            item.quantity - 1
                                        )
                                    }
                                    className="h-7 w-7 rounded border border-border text-muted-foreground hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-center text-lg leading-none"
                                >
                                    −
                                </button>
                                <span className="w-8 text-center text-sm font-medium tabular-nums">
                                    {item.quantity}
                                </span>
                                <button
                                    type="button"
                                    onClick={() =>
                                        updateQty(
                                            item.product.id,
                                            item.quantity + 1
                                        )
                                    }
                                    className="h-7 w-7 rounded border border-border text-muted-foreground hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-center text-lg leading-none"
                                >
                                    +
                                </button>
                            </div>
                            {/* Line total */}
                            <span className="w-20 text-right text-sm font-semibold text-foreground shrink-0 tabular-nums">
                                {formatEuro(item.unitPrice * item.quantity, locale)}
                            </span>
                            <button
                                type="button"
                                onClick={() => removeItem(item.product.id)}
                                className="text-muted-foreground hover:text-red-500 dark:hover:text-red-400 text-lg leading-none"
                            >
                                ×
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </OrderFormSection>
    );
}
