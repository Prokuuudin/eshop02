'use client';

import Image from 'next/image';
import Link from 'next/link';
import { Minus, Plus, ShoppingBag, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import WholesaleMinimumAlert from '@/components/WholesaleMinimumAlert';
import ConfirmActionDialog from '@/components/ConfirmActionDialog';
import { calculatePrice, getMinimumOrderQuantity } from '@/lib/customer-segmentation';
import { pointsToEuros } from '@/lib/bonus-program';
import { getLocalizedCartItemTitle } from '@/lib/cart-localization';
import type { useCheckoutPage } from './useCheckoutPage';
import type React from 'react';

type CheckoutState = Exclude<ReturnType<typeof useCheckoutPage>, React.ReactElement>;

export function CheckoutSummary({ state }: { state: CheckoutState }): React.ReactElement {
    const {
        t, language, currentUser, formatCurrency, promoCode, setPromoCode, appliedPromo,
        setAppliedPromo, appliedPromoDiscountPct, setAppliedPromoDiscountPct, campaignOffer,
        bonusApplied, setBonusApplied, promoError, setPromoError, applyBtnRef, checkoutItems,
        removeItem, updateQuantity, subtotal, handleApplyPromo, discount, deliveryFee, taxAmount,
        wholesaleGuard, userBonusBalance, bonusToEarn, bonusApplicable, maxBonusDiscount,
        bonusDiscount, finalGrandTotal, adjustedBonusToEarn,
    } = state;

    return (
<aside className="checkout__summary sticky top-20 h-fit">
                    <div className="rounded-lg border border-border bg-card px-6 pb-3 pt-6">
                        <div className="mb-4 flex items-center justify-between gap-3">
                            <h2 className="font-bold text-lg text-foreground">
                                {t('checkout.summary.title')}
                            </h2>
                            <Button asChild type="button" variant="outline" size="sm">
                                <Link href="/catalog">
                                    <ShoppingBag className="mr-2 h-4 w-4" aria-hidden="true" />
                                    {t('checkout.items.add')}
                                </Link>
                            </Button>
                        </div>

                        <div className="checkout__summary-totals mb-4 hidden rounded-lg bg-muted/50 p-3 text-sm text-gray-700 dark:text-gray-300">
                            <div className="grid grid-cols-3 items-start gap-x-4 gap-y-1.5">
                                <div className="order-1 flex items-baseline gap-x-1 whitespace-nowrap">
                                    <span>{t('checkout.summary.items')}</span>
                                    <span className="font-medium text-foreground">{formatCurrency(subtotal)}</span>
                                </div>
                                {discount > 0 && (
                                    <div className="order-4 col-span-3 flex justify-between text-green-600">
                                        <span>{campaignOffer.campaignName && campaignOffer.discount >= (appliedPromoDiscountPct ?? 0) ? `${t('checkout.summary.discount')} (${campaignOffer.campaignName})` : t('checkout.summary.discount')}</span>
                                        <span className="font-medium">−{formatCurrency(discount)}</span>
                                    </div>
                                )}
                                {bonusDiscount > 0 && (
                                    <div className="order-5 col-span-3 flex justify-between text-amber-600 dark:text-amber-400">
                                        <span>{t('checkout.summary.bonus')}</span>
                                        <span className="font-medium">−{formatCurrency(bonusDiscount)}</span>
                                    </div>
                                )}
                                <div className="order-2 flex items-baseline gap-x-1 whitespace-nowrap">
                                    <span>{t('checkout.summary.tax')}</span>
                                    <span className="font-medium text-foreground">{formatCurrency(taxAmount)}</span>
                                </div>
                                <div className="order-3 flex items-baseline gap-x-1 whitespace-nowrap">
                                    <span>{t('checkout.summary.delivery')}</span>
                                    <span className="font-medium text-foreground">
                                        {deliveryFee === 0 ? t('checkout.delivery.free') : formatCurrency(deliveryFee)}
                                    </span>
                                </div>
                            </div>
                            <div className="mt-2 flex justify-between text-lg font-bold">
                                <span>{t('checkout.summary.total')}</span>
                                <span className="text-primary">{formatCurrency(finalGrandTotal)}</span>
                            </div>
                        </div>

                        <div className="checkout__summary-items mb-4 max-h-80 space-y-3 overflow-y-auto pr-3">
                            {checkoutItems.map((item) => {
                                const localizedTitle = getLocalizedCartItemTitle(item, language, t);
                                const unitPrice = calculatePrice(item, item.quantity);
                                const minQuantity = getMinimumOrderQuantity(item);
                                return (
                                    <div
                                        key={item.lineKey}
                                        className="checkout__summary-item flex min-h-14 items-center gap-3"
                                    >
                                        <div className="product-image-surface relative h-14 w-14 shrink-0 overflow-hidden rounded-md border border-border">
                                            <Image
                                                src={item.image || '/placeholder.png'}
                                                alt={localizedTitle}
                                                fill
                                                sizes="56px"
                                                className="object-contain p-1"
                                            />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <Link
                                                href={`/product/${item.id}`}
                                                className="block truncate text-sm font-medium text-foreground hover:text-primary"
                                            >
                                                {localizedTitle}
                                            </Link>
                                            {item.brand && (
                                                <p className="truncate text-xs text-muted-foreground">
                                                    {item.brand}
                                                </p>
                                            )}
                                        </div>
                                        <div className="ml-auto flex shrink-0 items-center gap-2">
                                            <div className="flex items-center overflow-hidden rounded-md border border-border">
                                                <button
                                                    type="button"
                                                    onClick={() => updateQuantity(item.lineKey, item.quantity - 1)}
                                                    disabled={item.quantity <= minQuantity}
                                                    className="flex h-7 w-7 items-center justify-center hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
                                                    aria-label={`${t('checkout.items.decrease')}: ${localizedTitle}`}
                                                >
                                                    <Minus className="h-3.5 w-3.5" aria-hidden="true" />
                                                </button>
                                                <span className="min-w-7 px-0.5 text-center text-xs font-medium" aria-live="polite">
                                                    {item.quantity}
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={() => updateQuantity(item.lineKey, item.quantity + 1)}
                                                    className="flex h-7 w-7 items-center justify-center hover:bg-muted"
                                                    aria-label={`${t('checkout.items.increase')}: ${localizedTitle}`}
                                                >
                                                    <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                                                </button>
                                            </div>
                                            <span className="min-w-[4.5rem] text-right text-sm font-semibold text-foreground">
                                                {formatCurrency(unitPrice * item.quantity)}
                                            </span>
                                            <ConfirmActionDialog
                                                title={t('confirm.title')}
                                                description={t('checkout.items.removeConfirm')}
                                                confirmLabel={t('checkout.items.removeFromOrder')}
                                                cancelLabel={t('common.cancel')}
                                                onConfirm={() => removeItem(item.lineKey)}
                                                trigger={
                                                    <button
                                                        type="button"
                                                        className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                                        aria-label={`${t('checkout.items.removeFromOrder')}: ${localizedTitle}`}
                                                        title={t('checkout.items.removeFromOrder')}
                                                    >
                                                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                                                    </button>
                                                }
                                            />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="checkout__summary-totals mb-4 rounded-xl border-2 border-primary/30 bg-primary/5 p-3 text-sm text-gray-700 shadow-sm dark:bg-primary/10 dark:text-gray-300">
                            <div className="grid grid-cols-3 items-stretch gap-2">
                                <div className="flex items-baseline justify-center gap-x-1 whitespace-nowrap rounded-lg border border-primary/15 bg-card px-2 py-2.5">
                                    <span>{t('checkout.summary.items')}</span>
                                    <span className="font-bold text-foreground">{formatCurrency(subtotal)}</span>
                                </div>
                                <div className="flex items-baseline justify-center gap-x-1 whitespace-nowrap rounded-lg border border-primary/15 bg-card px-2 py-2.5">
                                    <span>{t('checkout.summary.tax')}</span>
                                    <span className="font-bold text-foreground">{formatCurrency(taxAmount)}</span>
                                </div>
                                <div className="flex items-baseline justify-center gap-x-1 whitespace-nowrap rounded-lg border border-primary/15 bg-card px-2 py-2.5">
                                    <span>{t('checkout.summary.delivery')}</span>
                                    <span className="font-bold text-foreground">
                                        {deliveryFee === 0 ? t('checkout.delivery.free') : formatCurrency(deliveryFee)}
                                    </span>
                                </div>
                                {discount > 0 && (
                                    <div className="col-span-3 flex justify-between text-green-600">
                                        <span>{campaignOffer.campaignName && campaignOffer.discount >= (appliedPromoDiscountPct ?? 0) ? `${t('checkout.summary.discount')} (${campaignOffer.campaignName})` : t('checkout.summary.discount')}</span>
                                        <span className="font-medium">−{formatCurrency(discount)}</span>
                                    </div>
                                )}
                                {bonusDiscount > 0 && (
                                    <div className="col-span-3 flex justify-between text-amber-600 dark:text-amber-400">
                                        <span>{t('checkout.summary.bonus')}</span>
                                        <span className="font-medium">−{formatCurrency(bonusDiscount)}</span>
                                    </div>
                                )}
                            </div>
                            <div className="mt-3 flex items-center justify-between rounded-lg border border-primary/25 bg-primary/10 px-4 py-3 text-xl font-bold text-foreground">
                                <span>{t('checkout.summary.total')}</span>
                                <span className="text-2xl tabular-nums text-primary">{formatCurrency(finalGrandTotal)}</span>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 items-start gap-3">
                        {/* Promo code */}
                        <div className="h-full rounded-md border border-border p-3">
                            <label className="block text-sm font-medium mb-2 text-foreground">
                                {t('checkout.promo.label')}
                            </label>
                            <div className="flex gap-2">
                                <Input
                                    type="text"
                                    placeholder={t('checkout.promo.placeholder')}
                                    value={promoCode}
                                    onChange={(e) => {
                                        setPromoCode(e.target.value);
                                        setPromoError('');
                                    }}
                                    disabled={!!appliedPromo}
                                    className="min-w-0 flex-1 px-3 py-2 border rounded text-sm bg-card text-foreground border-border"
                                />
                                <Button
                                    ref={applyBtnRef}
                                    type="button"
                                    onClick={handleApplyPromo}
                                    disabled={!!appliedPromo}
                                    className="px-3 py-2 text-sm"
                                    variant={appliedPromo ? 'outline' : 'default'}
                                >
                                    {appliedPromo ? '✓' : t('checkout.promo.apply')}
                                </Button>
                            </div>
                            {promoError && (
                                <p className="text-red-600 text-xs mt-1">{promoError}</p>
                            )}
                            {appliedPromo && (
                                <div className="mt-2 p-2 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded text-sm text-green-700 dark:text-green-200">
                                    {t('checkout.promo.applied')} ({appliedPromo} -
                                    {appliedPromoDiscountPct}%)
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setAppliedPromo(undefined);
                                            setAppliedPromoDiscountPct(null);
                                            setPromoCode('');
                                        }}
                                        className="ml-2 underline"
                                    >
                                        {t('checkout.promo.remove')}
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Бонусные баллы */}
                        {currentUser && (
                            <div className="checkout__bonus h-full rounded-md border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 px-3 py-2 text-sm space-y-1">
                                <div className="flex justify-between text-amber-800 dark:text-amber-300">
                                    <span>{t('account.bonus.balance')}</span>
                                    <span className="font-semibold">
                                        {userBonusBalance} {t('cart.bonus.unit')}
                                        <span className="ml-1 font-normal text-amber-700/80 dark:text-amber-400/80">
                                            ({formatCurrency(pointsToEuros(userBonusBalance))})
                                        </span>
                                    </span>
                                </div>
                                <div className="flex justify-between text-amber-700 dark:text-amber-400">
                                    <span>{t('checkout.bonus.willEarn')}</span>
                                    <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                                        {bonusApplied && adjustedBonusToEarn !== bonusToEarn && (
                                            <span className="line-through text-gray-400 mr-1 font-normal">
                                                {bonusToEarn}
                                            </span>
                                        )}
                                        +{adjustedBonusToEarn} {t('cart.bonus.unit')}
                                        {adjustedBonusToEarn > 0 && (
                                            <span className="ml-1 font-normal text-amber-700/80 dark:text-amber-400/80">
                                                (+
                                                {formatCurrency(pointsToEuros(adjustedBonusToEarn))}
                                                )
                                            </span>
                                        )}
                                    </span>
                                </div>
                                {bonusApplicable && (
                                    <div className="pt-1 mt-1 border-t border-amber-200 dark:border-amber-700">
                                        {!bonusApplied ? (
                                            <button
                                                type="button"
                                                onClick={() => setBonusApplied(true)}
                                                className="checkout__bonus-apply w-full rounded border border-amber-400 bg-white px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100 dark:bg-amber-900/20 dark:text-amber-300 dark:hover:bg-amber-900/40 dark:border-amber-600"
                                            >
                                                {t('checkout.bonus.apply')} (−
                                                {formatCurrency(maxBonusDiscount)})
                                            </button>
                                        ) : (
                                            <>
                                                <div className="checkout__bonus-applied flex items-center justify-between text-xs">
                                                    <span className="font-medium text-emerald-700 dark:text-emerald-400">
                                                        ✓ {t('checkout.bonus.applied')} −
                                                        {formatCurrency(maxBonusDiscount)}
                                                    </span>
                                                    <button
                                                        type="button"
                                                        onClick={() => setBonusApplied(false)}
                                                        className="ml-2 underline text-amber-700 dark:text-amber-400"
                                                    >
                                                        {t('common.cancel', 'Отменить')}
                                                    </button>
                                                </div>
                                                <p className="checkout__bonus-earn-warning mt-1.5 text-xs text-amber-600/80 dark:text-amber-500/80">
                                                    {t('checkout.bonus.earnWarning')}
                                                </p>
                                            </>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                        </div>

                        <div className="hidden">
                            <div className="flex justify-between">
                                <span>{t('checkout.summary.items')}</span>
                                <span className="font-medium text-foreground">
                                    {formatCurrency(subtotal)}
                                </span>
                            </div>
                            {discount > 0 && (
                                <div className="flex justify-between text-green-600">
                                    <span>
                                        {t('checkout.summary.discount').replace(/:\s*$/, '')}
                                        {appliedPromo && (
                                            <span className="text-muted-foreground">
                                                {' '}
                                                ({appliedPromo} −{appliedPromoDiscountPct}%)
                                            </span>
                                        )}
                                        {!appliedPromo && campaignOffer.campaignName && (
                                            <span className="text-muted-foreground"> ({campaignOffer.campaignName})</span>
                                        )}
                                        :
                                    </span>
                                    <span className="font-medium">
                                        −{formatCurrency(discount)}
                                    </span>
                                </div>
                            )}
                            {bonusDiscount > 0 && (
                                <div className="flex justify-between text-amber-600 dark:text-amber-400">
                                    <span>{t('checkout.summary.bonus')}</span>
                                    <span className="font-medium">
                                        −{formatCurrency(bonusDiscount)}
                                    </span>
                                </div>
                            )}

                            <div className="flex justify-between">
                                <span>{t('checkout.summary.tax')}</span>
                                <span className="font-medium text-foreground">
                                    {formatCurrency(taxAmount)}
                                </span>
                            </div>
                            <div className="flex justify-between">
                                <span>{t('checkout.summary.delivery')}</span>
                                <span className="font-medium text-foreground">
                                    {deliveryFee === 0
                                        ? t('checkout.delivery.free')
                                        : formatCurrency(deliveryFee)}
                                </span>
                            </div>
                        </div>

                        <div className="hidden">
                            <span>{t('checkout.summary.total')}</span>
                            <span className="text-primary">{formatCurrency(finalGrandTotal)}</span>
                        </div>

                        {!wholesaleGuard.isMinimumReached && (
                            <WholesaleMinimumAlert
                                className="mt-4 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800"
                                minOrderAmount={wholesaleGuard.minOrderAmount}
                                shortage={wholesaleGuard.shortage}
                                formatCurrency={formatCurrency}
                            />
                        )}
                    </div>
                </aside>
    );
}

