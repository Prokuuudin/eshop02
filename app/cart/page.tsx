'use client';
import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCart } from '@/lib/cart-store';
import { Button } from '@/components/ui/button';
import BenefitsList from '@/components/BenefitsList';
import { Checkbox } from '@/components/ui/checkbox';
import { useTranslation } from '@/lib/use-translation';
import { formatEuro, getLocaleFromLanguage } from '@/lib/utils';
import ConfirmActionDialog from '@/components/ConfirmActionDialog';
import WholesaleMinimumAlert from '@/components/WholesaleMinimumAlert';
import CheckoutGuardButton from '@/components/CheckoutGuardButton';
import { SaveAsTemplateDialog } from '@/components/SaveAsTemplateDialog';
import { useToast } from '@/lib/toast-context';
import { canPlaceOrders, getCurrentUser } from '@/lib/auth';
import { BookmarkPlus } from 'lucide-react';
import {
    calculatePrice,
    getMinimumOrderQuantity,
    getWholesaleOrderGuard,
} from '@/lib/customer-segmentation';

export default function CartPage() {
    const { t, language } = useTranslation();
    const { showToast } = useToast();
    const router = useRouter();
    const { items, addItem, removeItem, updateQuantity, total, clearCart } = useCart();
    const [selectedItemIds, setSelectedItemIds] = React.useState<string[]>([]);
    const [selectionTouched, setSelectionTouched] = React.useState(false);
    const [templateOpen, setTemplateOpen] = React.useState(false);
    const locale = getLocaleFromLanguage(language);
    const formatCurrency = (value: number): string => formatEuro(value, locale);
    const currentUser = getCurrentUser();
    const isCheckoutAllowedForRole = canPlaceOrders(currentUser);

    React.useEffect(() => {
        setSelectedItemIds((prev) => {
            if (prev.length === 0 && !selectionTouched) {
                return items.map((item) => item.id);
            }

            const currentIds = new Set(items.map((item) => item.id));
            const next = prev.filter((id) => currentIds.has(id));

            if (next.length === 0 && items.length > 0 && !selectionTouched) {
                return items.map((item) => item.id);
            }

            return next;
        });
    }, [items, selectionTouched]);

    React.useEffect(() => {
        if (items.length === 0) {
            setSelectionTouched(false);
        }
    }, [items.length]);

    const handleDecrease = (productId: string, quantity: number, minQuantity: number): void => {
        if (quantity <= minQuantity) {
            return;
        }
        updateQuantity(productId, quantity - 1);
    };

    const toggleSelected = (productId: string): void => {
        setSelectionTouched(true);
        setSelectedItemIds((prev) =>
            prev.includes(productId) ? prev.filter((id) => id !== productId) : [...prev, productId]
        );
    };

    if (items.length === 0) {
        return (
            <main className="w-full px-4 py-12 text-gray-900 dark:text-gray-100">
                <h1 className="cart__title text-3xl font-bold mb-8 text-gray-900 dark:text-gray-100">
                    {t('cart.title')}
                </h1>
                <div className="text-center py-12">
                    <p className="text-gray-600 dark:text-gray-300 mb-4">{t('cart.empty')}</p>
                    <Link href="/catalog">
                        <Button>{t('cart.goToCatalog')}</Button>
                    </Link>
                </div>

            </main>
        );
    }

    const selectedItems = items.filter((item) => selectedItemIds.includes(item.id));
    const subtotal = selectedItems.reduce(
        (sum, item) => sum + calculatePrice(item, item.quantity) * item.quantity,
        0
    );
    const taxAmount = Math.round(subtotal * 0.18);
    const deliveryFee = subtotal > 0 ? 500 : 0;
    const grandTotal = subtotal + taxAmount + deliveryFee;
    const wholesaleGuard = getWholesaleOrderGuard(subtotal);
    const bonusToEarn = selectedItems.reduce(
        (sum, item) => sum + (item.bonusRate ?? 0) * item.quantity,
        0
    );
    const userBonusBalance = currentUser?.bonusPoints ?? 0;
    const selectedIdsParam = selectedItemIds.join(',');
    const checkoutHref =
        selectedItemIds.length > 0
            ? `/checkout?items=${encodeURIComponent(selectedIdsParam)}`
            : '/checkout';

    return (
        <main className="cart cart--page w-full px-4 py-8 text-gray-900 dark:text-gray-100">
            <h1 className="cart__title cart__title--main text-3xl font-bold mb-8 text-gray-900 dark:text-gray-100">
                {t('cart.title')} ({items.length})
            </h1>
            <div className="cart__select-bar mb-4 flex flex-wrap items-center gap-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-3 text-sm">
                <span className="cart__select-label text-gray-700 dark:text-gray-300">
                    {t('cart.selectedForCheckout')}:{' '}
                    <span className="cart__select-count font-semibold">
                        {selectedItemIds.length}
                    </span>
                </span>
                <button
                    type="button"
                    onClick={() => {
                        setSelectionTouched(true);
                        setSelectedItemIds(items.map((item) => item.id));
                    }}
                    className="cart__select-all text-indigo-600 hover:underline"
                >
                    {t('cart.selectAll')}
                </button>
                <button
                    type="button"
                    onClick={() => {
                        setSelectionTouched(true);
                        setSelectedItemIds([]);
                    }}
                    className="cart__unselect-all text-indigo-600 hover:underline"
                >
                    {t('cart.unselectAll')}
                </button>
                <ConfirmActionDialog
                    title={t('confirm.title')}
                    description={t('confirm.clearCart')}
                    confirmLabel={t('cart.clear')}
                    cancelLabel={t('common.cancel')}
                    onConfirm={() => {
                        clearCart();
                        showToast(t('toast.cartCleared'), 'info');
                    }}
                    trigger={
                        <button type="button" className="cart__clear-btn text-red-500 hover:underline">
                            {t('cart.clear')}
                        </button>
                    }
                />
            </div>

            <div className="cart__layout grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Товары */}
                <div className="cart__items lg:col-span-2">
                    <div className="cart__item-list space-y-4">
                        {items.map((item) => {
                            const minQuantity = getMinimumOrderQuantity(item);
                            const unitPrice = calculatePrice(item, item.quantity);
                            const localizedTitle = t(`products.${item.id}.title`, item.title);
                            const isSelected = selectedItemIds.includes(item.id);
                            return (
                                <div
                                    key={item.id}
                                    className="cart__item p-4 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 flex gap-4"
                                >
                                    <div className="cart__item-checkbox pt-1">
                                        <Checkbox
                                            checked={isSelected}
                                            onCheckedChange={() => toggleSelected(item.id)}
                                            className="select-none"
                                            aria-label={`${t(
                                                'cart.selectForCheckout'
                                            )}: ${localizedTitle}`}
                                        />
                                    </div>

                                    <div className="cart__item-image w-24 h-24 flex-shrink-0 bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden relative">
                                        <Image
                                            src={item.image || '/placeholder.png'}
                                            alt={localizedTitle}
                                            fill
                                            className="object-cover"
                                        />
                                    </div>

                                    <div className="cart__item-info flex-1">
                                        <Link
                                            href={`/product/${item.id}`}
                                            className="cart__item-title font-medium hover:text-indigo-600"
                                        >
                                            {localizedTitle}
                                        </Link>
                                        <div className="cart__item-brand text-sm text-gray-600 dark:text-gray-300 mt-1">
                                            {item.brand}
                                        </div>
                                        <div className="cart__item-unitprice text-indigo-600 font-bold mt-2">
                                            {formatCurrency(unitPrice)}
                                        </div>
                                    </div>

                                    <div className="cart__item-controls flex flex-col items-end justify-between">
                                        <ConfirmActionDialog
                                            title={t('confirm.title')}
                                            description={t('confirm.removeCartItem')}
                                            confirmLabel={t('cart.remove')}
                                            cancelLabel={t('common.cancel')}
                                            onConfirm={() => {
                                                removeItem(item.id);
                                                showToast(t('toast.removedFromCart'), 'info');
                                            }}
                                            trigger={
                                                <button className="cart__item-remove text-red-600 text-sm">
                                                    {t('cart.remove')}
                                                </button>
                                            }
                                        />

                                        <div className="cart__item-qty flex items-center border border-gray-300 dark:border-gray-700 rounded">
                                            <button
                                                onClick={() =>
                                                    handleDecrease(
                                                        item.id,
                                                        item.quantity,
                                                        minQuantity
                                                    )
                                                }
                                                className="cart__item-qty-btn px-2 py-1"
                                            >
                                                −
                                            </button>
                                            <span className="cart__item-qty-value px-3 py-1 min-w-[2rem] text-center">
                                                {item.quantity}
                                            </span>
                                            <button
                                                onClick={() =>
                                                    updateQuantity(item.id, item.quantity + 1)
                                                }
                                                className="cart__item-qty-btn px-2 py-1"
                                            >
                                                +
                                            </button>
                                        </div>

                                        {minQuantity > 1 && (
                                            <div className="cart__item-minqty text-xs text-gray-500 dark:text-gray-300 mt-1">
                                                {t('common.min')} {minQuantity} {t('product.pcs')}
                                            </div>
                                        )}

                                        <div className="cart__item-total font-bold">
                                            {formatCurrency(unitPrice * item.quantity)}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Сумма */}
                <aside className="cart__summary sticky top-20 h-fit">
                    <div className="cart__summary-inner bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
                        <h2 className="cart__summary-title font-bold text-lg mb-4 text-gray-900 dark:text-gray-100">
                            {t('cart.total')}
                        </h2>

                        {!wholesaleGuard.isMinimumReached && selectedItemIds.length > 0 && (
                            <WholesaleMinimumAlert
                                className="cart__summary-wholesale-alert mb-4 rounded border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/30 p-3 text-sm text-amber-800 dark:text-amber-200"
                                minOrderAmount={wholesaleGuard.minOrderAmount}
                                shortage={wholesaleGuard.shortage}
                                formatCurrency={formatCurrency}
                            />
                        )}

                        <div className="cart__summary-breakdown space-y-3 text-sm border-b border-gray-200 dark:border-gray-700 pb-4 text-gray-700 dark:text-gray-300">
                            <div className="cart__summary-row flex justify-between">
                                <span>{t('checkout.summary.items')}</span>
                                <span className="cart__summary-value font-medium text-gray-900 dark:text-gray-100">
                                    {formatCurrency(subtotal)}
                                </span>
                            </div>
                            <div className="cart__summary-row flex justify-between">
                                <span>{t('checkout.summary.tax')}</span>
                                <span className="cart__summary-value font-medium text-gray-900 dark:text-gray-100">
                                    {formatCurrency(taxAmount)}
                                </span>
                            </div>
                            <div className="cart__summary-row flex justify-between">
                                <span>{t('cart.shipping')}</span>
                                <span className="cart__summary-value font-medium text-gray-900 dark:text-gray-100">
                                    {formatCurrency(deliveryFee)}
                                </span>
                            </div>
                        </div>

                        <div className="cart__summary-total mt-4 text-lg font-bold flex justify-between">
                            <span>{t('cart.totalToPay')}:</span>
                            <span className="cart__summary-total-value text-indigo-600">
                                {formatCurrency(grandTotal)}
                            </span>
                        </div>

                        {/* Бонусы */}
                        {currentUser && (
                            <div className="cart__bonus mt-4 rounded-md border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 px-3 py-2 text-sm space-y-1">
                                <div className="flex justify-between text-amber-800 dark:text-amber-300">
                                    <span>{t('account.bonus.balance')}</span>
                                    <span className="font-semibold">{userBonusBalance} {t('cart.bonus.unit')}</span>
                                </div>
                                <div className="flex justify-between text-amber-700 dark:text-amber-400">
                                    <span>{t('checkout.bonus.willEarn')}</span>
                                    <span className="font-semibold text-emerald-700 dark:text-emerald-400">+{bonusToEarn} {t('cart.bonus.unit')}</span>
                                </div>
                            </div>
                        )}

                        {/* Бенефиты */}
                        <div className="cart__benefits mt-6">
                            <BenefitsList compact only={['b1', 'b3', 'b6']} />
                        </div>

                        {selectedItemIds.length === 0 && (
                            <p className="cart__summary-warning mt-3 text-xs text-red-600">
                                {t('cart.selectAtLeastOne')}
                            </p>
                        )}

                        {!isCheckoutAllowedForRole && (
                            <p className="cart__summary-warning mt-3 text-xs text-amber-700 dark:text-amber-200">
                                Для роли менеджера оформление заказа недоступно. Используйте аккаунт
                                покупателя или администратора компании.
                            </p>
                        )}

                        <CheckoutGuardButton
                            canCheckout={
                                wholesaleGuard.isMinimumReached &&
                                selectedItemIds.length > 0 &&
                                isCheckoutAllowedForRole
                            }
                            className="cart__checkout-btn w-full mt-6"
                            label={t('cart.checkout')}
                            href={checkoutHref}
                        />

                        <Link href="/catalog">
                            <Button variant="outline" className="cart__continue-btn w-full mt-3">
                                {t('cart.continue')}
                            </Button>
                        </Link>

                        {currentUser && (
                            <div className="cart__templates mt-4 flex items-center justify-between text-xs border-t border-gray-100 dark:border-gray-800 pt-3">
                                <button
                                    onClick={() => setTemplateOpen(true)}
                                    className="flex items-center gap-1 text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 transition-colors"
                                >
                                    <BookmarkPlus className="w-3.5 h-3.5" />
                                    {t('templates.saveAsTemplate')}
                                </button>
                                <button
                                    onClick={() => router.push('/account/templates')}
                                    className="text-gray-500 hover:text-indigo-600 dark:text-gray-400 dark:hover:text-indigo-400 transition-colors"
                                >
                                    {t('templates.useSavedTemplates')}
                                </button>
                            </div>
                        )}

                        <SaveAsTemplateDialog
                            open={templateOpen}
                            onOpenChange={setTemplateOpen}
                            items={items}
                            defaultName=""
                        />
                    </div>
                </aside>
            </div>
        </main>
    );
}
