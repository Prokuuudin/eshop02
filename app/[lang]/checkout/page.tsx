'use client';
import React from 'react';
import Image from 'next/image';
import Script from 'next/script';
import Link from 'next/link';
import { ClipboardCheck, Info, Minus, Plus, ShoppingBag, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { stores } from '@/data/stores';
import WholesaleMinimumAlert from '@/components/WholesaleMinimumAlert';
import { DeliveryMethod } from '@/lib/orders-store';
import { calculatePrice, getMinimumOrderQuantity } from '@/lib/customer-segmentation';
import { pointsToEuros } from '@/lib/bonus-program';
import { calcDeliveryFee } from '@/lib/delivery';
import { TURNSTILE_SCRIPT_SRC } from '@/lib/use-turnstile';
import { getLocalizedCartItemTitle } from '@/lib/cart-localization';
import { CustomerDetailsSection } from './CheckoutFormSections';
import ConfirmActionDialog from '@/components/ConfirmActionDialog';

const DELIVERY_OPTIONS: Array<{ id: DeliveryMethod; labelKey: string }> = [
    { id: 'courier', labelKey: 'checkout.delivery.courier' },
    { id: 'pickup', labelKey: 'checkout.delivery.pickup' },
    { id: 'post', labelKey: 'checkout.delivery.omniva' },
    { id: 'venipak', labelKey: 'checkout.delivery.venipak' },
];

import { useCheckoutPage } from './useCheckoutPage';
export default function CheckoutPage(): React.ReactElement {
    const checkoutPage = useCheckoutPage();
    if (React.isValidElement(checkoutPage)) return checkoutPage;
    const checkoutState = checkoutPage as Exclude<
        ReturnType<typeof useCheckoutPage>,
        React.ReactElement
    >;
    const {
            t,
            language,
            currentUser,
            formatCurrency,
            formData,
            setFormData,
            deliveryMethod,
            setDeliveryMethod,
            pickupStoreId,
            setPickupStoreId,
            cashLockAlert,
            setCashLockAlert,
            promoCode,
            setPromoCode,
            appliedPromo,
            setAppliedPromo,
            appliedPromoDiscountPct,
            setAppliedPromoDiscountPct,
            campaignOffer,
            bonusApplied,
            setBonusApplied,
            termsAccepted,
            setTermsAccepted,
            promoError,
            setPromoError,
            isSubmitting,
            errors,
            setErrors,
            turnstileEnabled,
            turnstileToken,
            setTurnstileContainer,
            renderTurnstile,
            applyBtnRef,
            checkoutItems,
            removeItem,
            updateQuantity,
            subtotal,
            cashUnavailable,
            handleChange,
            handleApplyPromo,
            handleSubmit,
            discount,
            subtotalAfterDiscount,
            deliveryFee,
            taxAmount,
            wholesaleGuard,
            userBonusBalance,
            bonusToEarn,
            bonusApplicable,
            maxBonusDiscount,
            bonusDiscount,
            finalGrandTotal,
            adjustedBonusToEarn,
          } = checkoutState;
    return (
        <main className="w-full px-4 py-8 text-foreground">
            <div className="mb-8 text-center">
                <div className="flex items-center justify-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand text-brand-foreground dark:bg-white dark:text-brand">
                        <ClipboardCheck className="h-7 w-7 stroke-[2.25]" aria-hidden="true" />
                    </div>
                    <h1 className="checkout__title text-xl font-bold leading-tight text-foreground sm:text-2xl">
                        {t('checkout.title')}
                    </h1>
                </div>
            </div>

            <div className="checkout__layout grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Форма */}
                <form onSubmit={handleSubmit} className="space-y-6">
                    {turnstileEnabled && (
                        <Script
                            src={TURNSTILE_SCRIPT_SRC}
                            strategy="afterInteractive"
                            onLoad={renderTurnstile}
                        />
                    )}
                    <CustomerDetailsSection
                        formData={formData}
                        setFormData={setFormData}
                        errors={errors}
                        onChange={handleChange}
                        t={t}
                        showPrefillHint={!!currentUser}
                    />
                    {/* Delivery options */}
                    <div className="checkout__section bg-card rounded-lg border border-border p-6">
                        <div className="flex items-baseline justify-between gap-3 mb-4 flex-wrap">
                            <h2 className="checkout__section-title font-bold text-lg">
                                {t('checkout.delivery.method')}
                            </h2>
                            <Link
                                href="/delivery-payment"
                                target="_blank"
                                className="checkout__section-info text-sm text-primary underline hover:no-underline"
                            >
                                {t('checkout.delivery.moreInfo')}
                            </Link>
                        </div>
                        <RadioGroup
                            value={deliveryMethod}
                            onValueChange={(value) => {
                                const method = value as DeliveryMethod;
                                if (method !== 'pickup' && formData.paymentMethod === 'cash') {
                                    setCashLockAlert(true);
                                    return;
                                }
                                setDeliveryMethod(method);
                                setCashLockAlert(false);
                            }}
                            className="space-y-3"
                        >
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                {DELIVERY_OPTIONS.map((option) => (
                                    <label
                                        key={option.id}
                                        className="flex items-center p-3 border rounded cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 border-border"
                                        htmlFor={`delivery-${option.id}`}
                                    >
                                        <RadioGroupItem
                                            id={`delivery-${option.id}`}
                                            value={option.id}
                                            className="mr-3"
                                        />
                                        <div className="flex-1">
                                            <div className="font-medium">{t(option.labelKey)}</div>
                                            <div className="text-sm text-muted-foreground">
                                                {calcDeliveryFee(
                                                    option.id,
                                                    subtotalAfterDiscount
                                                ) === 0
                                                    ? t('checkout.delivery.free')
                                                    : formatCurrency(
                                                          calcDeliveryFee(
                                                              option.id,
                                                              subtotalAfterDiscount
                                                          )
                                                      )}
                                            </div>
                                        </div>
                                    </label>
                                ))}
                            </div>
                            {deliveryMethod === 'pickup' && (
                                <div className="checkout__pickup-store">
                                    <label
                                        className="block text-sm font-medium mb-1 text-foreground"
                                        htmlFor="pickup-store"
                                    >
                                        {t('checkout.pickup.chooseStore')}{' '}
                                        <span className="text-red-600">*</span>
                                    </label>
                                    <Select
                                        value={pickupStoreId || undefined}
                                        onValueChange={(value) => {
                                            if (value !== 'riga-office' && formData.paymentMethod === 'cash') {
                                                setCashLockAlert(true);
                                                return;
                                            }
                                            setPickupStoreId(value);
                                            setCashLockAlert(false);
                                            if (errors.pickupStore) {
                                                setErrors((prev) => {
                                                    const newErrors = { ...prev };
                                                    delete newErrors.pickupStore;
                                                    return newErrors;
                                                });
                                            }
                                        }}
                                    >
                                        <SelectTrigger
                                            id="pickup-store"
                                            className={`w-full rounded border bg-card px-3 py-2 text-sm ${
                                                errors.pickupStore
                                                    ? 'border-red-500'
                                                    : 'border-border'
                                            }`}
                                            aria-invalid={!!errors.pickupStore}
                                        >
                                            <SelectValue
                                                placeholder={t(
                                                    'checkout.pickup.storePlaceholder'
                                                )}
                                            />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {stores.map((store) => (
                                                <SelectItem
                                                        key={store.id}
                                                        value={store.id}
                                                    >
                                                        {t(`stores.${store.id}.name`)} — {store.address.lv}
                                                    </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    {errors.pickupStore && (
                                        <p className="text-red-600 text-xs mt-1">
                                            {errors.pickupStore}
                                        </p>
                                    )}
                                    {cashLockAlert && formData.paymentMethod === 'cash' && (
                                        <p className="mt-2 flex items-start gap-2 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 p-3 text-sm text-amber-800 dark:text-amber-200">
                                            <Info className="w-4 h-4 shrink-0 mt-0.5" />
                                            {t('checkout.payment.cashDeliveryAlert')}
                                        </p>
                                    )}
                                </div>
                            )}
                        </RadioGroup>
                    </div>

                    <div className="checkout__section bg-card rounded-lg border border-border p-6">
                        <div className="flex items-baseline justify-between gap-3 mb-4 flex-wrap">
                            <h2 className="checkout__section-title font-bold text-lg">
                                {t('checkout.payment.title')}
                            </h2>
                            <Link
                                href="/delivery-payment"
                                target="_blank"
                                className="checkout__section-info text-sm text-primary underline hover:no-underline"
                            >
                                {t('checkout.payment.moreInfo')}
                            </Link>
                        </div>
                        <RadioGroup
                            value={formData.paymentMethod}
                            onValueChange={(value) => {
                                setFormData((prev) => ({ ...prev, paymentMethod: value }));
                                if (value === 'cash' && cashUnavailable) {
                                    setDeliveryMethod('pickup');
                                    setPickupStoreId('riga-office');
                                }
                                if (value !== 'cash') setCashLockAlert(false);
                            }}
                            className="space-y-3"
                        >
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {(['bank', 'cash'] as const).map((method) => (
                                    <label
                                        key={method}
                                        className="flex items-center p-3 border rounded border-border cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                                        htmlFor={`payment-${method}`}
                                    >
                                        <RadioGroupItem
                                            id={`payment-${method}`}
                                            value={method}
                                            className="mr-3"
                                        />
                                        <span className="font-medium flex-1">
                                            {t(`checkout.payment.${method}`)}
                                        </span>
                                    </label>
                                ))}
                            </div>
                            <p className="flex items-start gap-2 rounded-lg border border-primary/10 bg-primary/5 dark:border-primary/40 dark:bg-primary/15 p-3 text-sm text-muted-foreground">
                                <Info className="w-4 h-4 shrink-0 mt-0.5 text-primary/80" />
                                <span>
                                    <strong className="font-semibold text-foreground">
                                        {t('checkout.payment.cash')}
                                    </strong>
                                    {t('checkout.payment.cashNoteSuffix')}
                                </span>
                            </p>
                        </RadioGroup>
                    </div>

                    {turnstileEnabled && <div ref={setTurnstileContainer} />}
                    <div className="space-y-2">
                    {/* Согласие размещено рядом с финальными действиями формы. */}
                    <div className="checkout__terms rounded-lg bg-card px-1 py-1">
                        <div className="flex items-start gap-2">
                            <Checkbox
                                id="checkout-terms"
                                checked={termsAccepted}
                                onCheckedChange={(checked) => {
                                    setTermsAccepted(checked);
                                    if (checked && errors.terms) {
                                        setErrors((prev) => {
                                            const newErrors = { ...prev };
                                            delete newErrors.terms;
                                            return newErrors;
                                        });
                                    }
                                }}
                                aria-required="true"
                                aria-invalid={!!errors.terms}
                                className="mt-0.5"
                            />
                            <label htmlFor="checkout-terms" className="checkout__terms-label cursor-pointer text-sm text-gray-700 dark:text-gray-300">
                                {t('checkout.terms.prefix')}{' '}
                                <Link href="/terms" target="_blank" className="text-primary underline hover:no-underline">
                                    {t('checkout.terms.link')}
                                </Link>
                                {t('checkout.terms.suffix')}
                            </label>
                        </div>
                        {errors.terms && <p className="mt-1 text-xs text-red-600">{errors.terms}</p>}
                    </div>
                    <div className="flex gap-3">
                        <Button
                            type="submit"
                            className="flex-1"
                            disabled={
                                !wholesaleGuard.isMinimumReached ||
                                isSubmitting ||
                                (turnstileEnabled && !turnstileToken)
                            }
                        >
                            {t('checkout.submit')}
                        </Button>
                        <Link href="/cart">
                            <Button type="button" variant="outline">
                                {t('checkout.backToCart')}
                            </Button>
                        </Link>
                    </div>
                    </div>
                </form>

                {/* Сумма и промокод */}
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
            </div>
        </main>
    );
}
