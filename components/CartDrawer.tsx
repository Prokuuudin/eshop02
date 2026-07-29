'use client';

import React from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useTranslation } from '@/lib/use-translation';
import Image from 'next/image';
import { useCart } from '@/lib/cart-store';
import { useCartSelection, isLineSelected } from '@/lib/cart-selection-store';
import { extractVat } from '@/lib/tax';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import WholesaleMinimumAlert from '@/components/WholesaleMinimumAlert';
import CheckoutGuardButton from '@/components/CheckoutGuardButton';
import { SaveAsTemplateDialog } from '@/components/SaveAsTemplateDialog';
import { formatEuro, getLocaleFromLanguage } from '@/lib/utils';
import ConfirmActionDialog from '@/components/ConfirmActionDialog';
import { useToast } from '@/lib/toast-context';
import { canPlaceOrders, getCurrentUser } from '@/lib/auth';
import { BookmarkPlus, Expand } from 'lucide-react';
import {
    calculatePrice,
    getMinimumOrderQuantity,
    getWholesaleOrderGuard,
} from '@/lib/customer-segmentation';
import { calcOrderBonus, pointsToEuros } from '@/lib/bonus-program';
import { getLocalizedCartItemTitle } from '@/lib/cart-localization';

type CartDrawerProps = {
    isOpen: boolean;
    onClose: () => void;
};

export default function CartDrawer({ isOpen, onClose }: CartDrawerProps) {
    const { t, language } = useTranslation();
    const { showToast } = useToast();
    const router = useRouter();
    const { items, removeItem, updateQuantity } = useCart();
    const deselectedLineKeys = useCartSelection((s) => s.deselectedLineKeys);
    const { toggle: toggleSelected, selectAll, unselectAll } = useCartSelection();
    const locale = getLocaleFromLanguage(language);
    const formatCurrency = (value: number): string => formatEuro(value, locale);
    const [mounted, setMounted] = React.useState(false);
    const [templateOpen, setTemplateOpen] = React.useState(false);
    const currentUser = getCurrentUser();
    const isCheckoutAllowedForRole = canPlaceOrders(currentUser);

    const selectedItems = items.filter((item) => isLineSelected(deselectedLineKeys, item.lineKey));
    const selectedItemIds = selectedItems.map((item) => item.lineKey);
    const bonusToEarn = calcOrderBonus(
        selectedItems.map((item) => ({
            price: calculatePrice(item, item.quantity),
            quantity: item.quantity,
            bonusRate: item.bonusRate,
        }))
    );
    const userBonusBalance = currentUser?.bonusPoints ?? 0;
    const subtotal = selectedItems.reduce(
        (sum, item) => sum + calculatePrice(item, item.quantity) * item.quantity,
        0
    );
    // Catalog prices already include VAT — tax is informational, not added to the total.
    const tax = extractVat(subtotal);
    const netSubtotal = subtotal - tax;
    // Доставка выбирается и считается на этапе оформления заказа, в дровере не суммируется.
    const finalTotal = subtotal;
    const wholesaleGuard = getWholesaleOrderGuard(subtotal);
    const selectedIdsParam = selectedItemIds.join(',');
    const checkoutHref =
        selectedItemIds.length > 0
            ? `/checkout?items=${encodeURIComponent(selectedIdsParam)}`
            : '/checkout';

    React.useEffect(() => {
        setMounted(true);
    }, []);

    React.useEffect(() => {
        if (!isOpen) return;

        const handleKeyDown = (event: KeyboardEvent): void => {
            if (event.key === 'Escape') {
                onClose();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    const handleDecrease = (lineKey: string, quantity: number, minQuantity: number): void => {
        if (quantity <= minQuantity) {
            return;
        }
        updateQuantity(lineKey, quantity - 1);
    };

    if (!mounted) {
        return <></>;
    }

    return createPortal(
        <>
            {/* Backdrop */}
            <div
                data-testid="cart-drawer-backdrop"
                className={`fixed inset-0 z-drawer bg-black/50 transition-opacity duration-300 ${
                    isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
                }`}
                onClick={onClose}
            />

            {/* Drawer panel */}
            <div
                data-testid="cart-drawer-panel"
                className={`cart-drawer fixed right-0 top-0 h-screen w-full sm:max-w-md z-drawer bg-card shadow-lg flex flex-col transition-transform duration-300 ${
                    isOpen ? 'translate-x-0' : 'translate-x-full'
                }`}
                style={{ willChange: 'transform' }}
            >
                {/* Header */}
                <div className="cart-drawer__header border-b border-border p-4 flex items-center justify-between bg-card">
                    <div className="flex items-baseline gap-3">
                        <h2 className="text-lg font-semibold text-foreground">
                            {t('cart.title')}
                        </h2>
                        <button
                            onClick={() => { onClose(); router.push('/cart'); }}
                            className="hidden md:inline-flex items-center gap-1 text-xs text-primary hover:underline dark:text-primary leading-none"
                        >
                            {t('cart.openFullCart')}
                            <Expand className="w-3 h-3" />
                        </button>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 p-3"
                        aria-label={t('cart.closeAria')}
                    >
                        <svg
                            width="20"
                            height="20"
                            viewBox="0 0 24 24"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                        >
                            <path
                                d="M18 6L6 18M6 6l12 12"
                                stroke="currentColor"
                                strokeWidth="1.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                        </svg>
                    </button>
                </div>

                {/* Items scroll area */}
                <div className="cart-drawer__items flex-1 overflow-y-auto p-4 space-y-2 bg-muted">
                    {items.length > 0 && (
                        <div className="mb-2 flex flex-wrap items-center gap-3 rounded border border-border bg-card p-2 text-xs">
                            <span className="text-gray-700 dark:text-gray-300">
                                {t('cart.selectedForCheckout')}:{' '}
                                <span className="font-semibold">{selectedItemIds.length}</span>
                            </span>
                            <button
                                type="button"
                                onClick={selectAll}
                                className="text-primary hover:underline"
                            >
                                {t('cart.selectAll')}
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    unselectAll(items.map((item) => item.lineKey));
                                }}
                                className="text-primary hover:underline"
                            >
                                {t('cart.unselectAll')}
                            </button>
                        </div>
                    )}

                    {items.length === 0 ? (
                        <p className="text-center text-muted-foreground py-8">
                            {t('cart.empty')}
                        </p>
                    ) : (
                        items.map((item) => {
                            const minQuantity = getMinimumOrderQuantity(item);
                            const localizedTitle = getLocalizedCartItemTitle(item, language, t);
                            const isSelected = selectedItemIds.includes(item.lineKey);
                            return (
                                <div
                                    key={item.lineKey}
                                    className="cart-drawer__item flex gap-3 border-b border-border pb-2"
                                >
                                    <div className="pt-1">
                                        <TooltipProvider>
                                            <Tooltip>
                                                {/* Не asChild на самом Checkbox: Tooltip.Trigger перетирает
                                                    его data-state и ломает стили checked-состояния. */}
                                                <TooltipTrigger asChild>
                                                    <span className="inline-flex">
                                                        <Checkbox
                                                            checked={isSelected}
                                                            onCheckedChange={() => toggleSelected(item.lineKey)}
                                                            aria-label={`${t(
                                                                'cart.selectForCheckout'
                                                            )}: ${localizedTitle}`}
                                                        />
                                                    </span>
                                                </TooltipTrigger>
                                                <TooltipContent side="top">
                                                    {t(
                                                        isSelected
                                                            ? 'cart.excludeFromCheckout'
                                                            : 'cart.includeInCheckout'
                                                    )}
                                                </TooltipContent>
                                            </Tooltip>
                                        </TooltipProvider>
                                    </div>
                                    <div className="relative w-20 h-20 flex-shrink-0 bg-white rounded overflow-hidden">
                                        <Image
                                            src={item.image || '/placeholder.png'}
                                            alt={localizedTitle || t('cart.imageAlt')}
                                            fill
                                            sizes="80px"
                                            className="object-contain p-1"
                                        />
                                    </div>
                                    <div className="flex-1">
                                        <h3 className="text-sm font-medium line-clamp-2 text-foreground mb-1">
                                            {localizedTitle}
                                        </h3>
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-1.5">
                                                <button
                                                    onClick={() =>
                                                        handleDecrease(
                                                            item.lineKey,
                                                            item.quantity,
                                                            minQuantity
                                                        )
                                                    }
                                                    className="w-7 h-7 flex items-center justify-center border rounded text-xs hover:bg-gray-100 dark:hover:bg-gray-800 dark:border-gray-700 dark:text-gray-100"
                                                >
                                                    −
                                                </button>
                                                <span className="w-5 text-center text-xs text-foreground">
                                                    {item.quantity}
                                                </span>
                                                <button
                                                    onClick={() =>
                                                        updateQuantity(item.lineKey, item.quantity + 1)
                                                    }
                                                    className="w-7 h-7 flex items-center justify-center border rounded text-xs hover:bg-gray-100 dark:hover:bg-gray-800 dark:border-gray-700 dark:text-gray-100"
                                                >
                                                    +
                                                </button>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <p className="cart-drawer__item-price text-sm font-semibold text-foreground">
                                                    {formatCurrency(
                                                        calculatePrice(item, item.quantity) * item.quantity
                                                    )}
                                                </p>
                                                <TooltipProvider>
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <span className="inline-flex">
                                                                <ConfirmActionDialog
                                                                    title={t('confirm.title')}
                                                                    description={t('confirm.removeCartItem')}
                                                                    confirmLabel={t('cart.remove')}
                                                                    cancelLabel={t('common.cancel')}
                                                                    onConfirm={() => {
                                                                        removeItem(item.lineKey);
                                                                        showToast(t('toast.removedFromCart'), 'info');
                                                                    }}
                                                                    trigger={
                                                                        <button className="text-xs text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 font-medium">
                                                                            {t('cart.remove')}
                                                                        </button>
                                                                    }
                                                                />
                                                            </span>
                                                        </TooltipTrigger>
                                                        <TooltipContent side="top">
                                                            {t('cart.removeFromCart')}
                                                        </TooltipContent>
                                                    </Tooltip>
                                                </TooltipProvider>
                                            </div>
                                        </div>
                                        {minQuantity > 1 && (
                                            <p className="text-xs text-muted-foreground mt-1">
                                                {t('common.min')} {minQuantity} {t('product.pcs')}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>

                {/* Footer with summary */}
                {items.length > 0 && (
                    <div className="cart-drawer__footer border-t border-border px-4 py-3 space-y-2 bg-card">
                        {!wholesaleGuard.isMinimumReached && selectedItemIds.length > 0 && (
                            <WholesaleMinimumAlert
                                minOrderAmount={wholesaleGuard.minOrderAmount}
                                shortage={wholesaleGuard.shortage}
                                formatCurrency={formatCurrency}
                            />
                        )}

                        {/* Разбивка */}
                        <div className="space-y-1 text-sm text-foreground">
                            <div className="flex items-center justify-between">
                                <span>{t('cart.subtotalExclVat')}</span>
                                <span className="text-sm font-medium text-foreground tabular-nums">
                                    {formatCurrency(netSubtotal)}
                                </span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span>{t('cart.tax')}</span>
                                <span className="text-sm font-medium text-foreground tabular-nums">
                                    {formatCurrency(tax)}
                                </span>
                            </div>
                            <div className="cart-drawer__delivery flex justify-between gap-2">
                                <span className="shrink-0">{t('cart.shipping')}</span>
                                <span className="text-right text-xs italic text-muted-foreground">
                                    {t('cart.deliveryAtCheckout')}
                                </span>
                            </div>
                        </div>

                        <div className="border-t border-border pt-2 flex items-center justify-between font-semibold text-sm text-foreground">
                            <span>{t('cart.total')}</span>
                            <span className="text-base tabular-nums">{formatCurrency(finalTotal)}</span>
                        </div>

                        {/* Бонусный блок */}
                        {currentUser && (
                            <div className="cart-drawer__bonus rounded border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 px-2 py-1.5 text-xs space-y-0.5">
                                <div className="flex justify-between text-amber-800 dark:text-amber-300">
                                    <span>{t('account.bonus.balance')}</span>
                                    <span className="font-semibold">{userBonusBalance} {t('cart.bonus.unit')}</span>
                                </div>
                                <div className="flex justify-between text-amber-700 dark:text-amber-400">
                                    <span>{t('checkout.bonus.willEarn')}</span>
                                    <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                                        +{bonusToEarn} {t('cart.bonus.unit')}
                                        {bonusToEarn > 0 && (
                                            <span className="ml-1 font-normal text-amber-700/80 dark:text-amber-400/80">
                                                (= −{formatCurrency(pointsToEuros(bonusToEarn))})
                                            </span>
                                        )}
                                    </span>
                                </div>
                            </div>
                        )}

                        {selectedItemIds.length === 0 && (
                            <p className="text-xs text-red-600">{t('cart.selectAtLeastOne')}</p>
                        )}
                        {!isCheckoutAllowedForRole && (
                            <p className="text-xs text-amber-700 dark:text-amber-200">
                                Для роли менеджера оформление заказа недоступно.
                            </p>
                        )}

                        <CheckoutGuardButton
                            canCheckout={
                                wholesaleGuard.isMinimumReached &&
                                selectedItemIds.length > 0 &&
                                isCheckoutAllowedForRole
                            }
                            className="w-full"
                            label={t('cart.checkout')}
                            href={checkoutHref}
                            onNavigate={onClose}
                        />
                        {/* Шаблоны в одну строку */}
                        {currentUser && (
                            <div className="flex items-center justify-between text-xs pt-1">
                                <button
                                    onClick={() => setTemplateOpen(true)}
                                    className="flex items-center gap-1 text-primary hover:text-primary dark:text-primary transition-colors"
                                >
                                    <BookmarkPlus className="w-3.5 h-3.5" />
                                    {t('templates.saveAsTemplate')}
                                </button>
                                <button
                                    onClick={() => { onClose(); router.push('/account/templates'); }}
                                    className="text-gray-500 hover:text-primary dark:text-gray-400 dark:hover:text-primary/80 transition-colors"
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
                )}
            </div>
        </>,
        document.body
    );
}
