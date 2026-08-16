'use client';
import React from 'react';
import Script from 'next/script';
import Link from 'next/link';
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
import { calculatePrice } from '@/lib/customer-segmentation';
import { pointsToEuros } from '@/lib/bonus-program';
import { calcDeliveryFee } from '@/lib/delivery';
import { TURNSTILE_SCRIPT_SRC } from '@/lib/use-turnstile';
import { CustomerDetailsSection } from './CheckoutFormSections';

const DELIVERY_OPTIONS: Array<{ id: DeliveryMethod; labelKey: string }> = [
    { id: 'courier', labelKey: 'checkout.delivery.courier' },
    { id: 'pickup', labelKey: 'checkout.delivery.pickup' },
    { id: 'post', labelKey: 'checkout.delivery.omniva' },
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
            language: _language,
            currentUser,
            formatCurrency,
            formData,
            setFormData,
            deliveryMethod,
            setDeliveryMethod,
            pickupStoreId,
            setPickupStoreId,
            promoCode,
            setPromoCode,
            appliedPromo,
            setAppliedPromo,
            appliedPromoDiscountPct,
            setAppliedPromoDiscountPct,
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
            <h1 className="checkout__title text-3xl font-bold mb-8">{t('checkout.title')}</h1>

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
                                setDeliveryMethod(method);
                                if (method !== 'pickup') {
                                    setFormData((prev) =>
                                        prev.paymentMethod === 'cash'
                                            ? { ...prev, paymentMethod: 'card' }
                                            : prev
                                    );
                                }
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
                                            setPickupStoreId(value);
                                            if (value !== 'riga-office') {
                                                setFormData((prev) =>
                                                    prev.paymentMethod === 'cash'
                                                        ? { ...prev, paymentMethod: 'card' }
                                                        : prev
                                                );
                                            }
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
                            }}
                            className="grid grid-cols-1 sm:grid-cols-3 gap-3"
                        >
                            {(['card', 'bank', 'cash'] as const).map((method) => {
                                const disabled = method === 'cash' && cashUnavailable;
                                return (
                                    <label
                                        key={method}
                                        className={`flex items-center p-3 border rounded border-border ${
                                            disabled
                                                ? 'cursor-not-allowed opacity-50'
                                                : 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800'
                                        }`}
                                        htmlFor={`payment-${method}`}
                                    >
                                        <RadioGroupItem
                                            id={`payment-${method}`}
                                            value={method}
                                            className="mr-3"
                                            disabled={disabled}
                                        />
                                        <div className="flex-1">
                                            <div className="font-medium">
                                                {t(`checkout.payment.${method}`)}
                                            </div>
                                            {method === 'cash' && (
                                                <div className="text-sm text-muted-foreground">
                                                    {t('checkout.payment.cashNote')}
                                                </div>
                                            )}
                                        </div>
                                    </label>
                                );
                            })}
                        </RadioGroup>
                    </div>

                    {turnstileEnabled && <div ref={setTurnstileContainer} />}
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
                </form>

                {/* Сумма и промокод */}
                <aside className="checkout__summary sticky top-20 h-fit">
                    <div className="bg-card rounded-lg border border-border p-6">
                        <h2 className="font-bold text-lg mb-4 text-foreground">
                            {t('checkout.summary.title')}
                        </h2>

                        <div className="space-y-2 border-b border-border pb-4 max-h-48 overflow-y-auto mb-4">
                            {checkoutItems.map((item) => {
                                const localizedTitle = t(`products.${item.id}.title`, item.title);
                                const unitPrice = calculatePrice(item, item.quantity);
                                return (
                                    <div
                                        key={item.lineKey}
                                        className="text-sm flex justify-between"
                                    >
                                        <span>
                                            {localizedTitle} × {item.quantity}
                                        </span>
                                        <span>{formatCurrency(unitPrice * item.quantity)}</span>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Promo code */}
                        <div className="mb-4 pb-4 border-b border-border">
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
                                    className="flex-1 px-3 py-2 border rounded text-sm bg-card text-foreground border-border"
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
                            <div className="checkout__bonus mb-4 rounded-md border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 px-3 py-2 text-sm space-y-1">
                                <div className="flex justify-between text-amber-800 dark:text-amber-300">
                                    <span>{t('account.bonus.balance')}</span>
                                    <span className="font-semibold">
                                        {userBonusBalance} {t('cart.bonus.unit')}
                                        <span className="ml-1 font-normal text-amber-700/80 dark:text-amber-400/80">
                                            (= {formatCurrency(pointsToEuros(userBonusBalance))})
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
                                                (= −
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

                        <div className="space-y-2 text-sm mb-4 pb-4 border-b border-border text-gray-700 dark:text-gray-300">
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

                        <div className="text-lg font-bold flex justify-between">
                            <span>{t('checkout.summary.total')}</span>
                            <span className="text-primary">{formatCurrency(finalGrandTotal)}</span>
                        </div>

                        {/* Согласие с условиями предоставления услуг */}
                        <div className="checkout__terms mt-4 pt-4 border-t border-border">
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
                                <label
                                    htmlFor="checkout-terms"
                                    className="checkout__terms-label text-sm text-gray-700 dark:text-gray-300 cursor-pointer"
                                >
                                    {t('checkout.terms.prefix')}{' '}
                                    <Link
                                        href="/terms"
                                        target="_blank"
                                        className="text-primary underline hover:no-underline"
                                    >
                                        {t('checkout.terms.link')}
                                    </Link>
                                    {t('checkout.terms.suffix')}
                                </label>
                            </div>
                            {errors.terms && (
                                <p className="text-red-600 text-xs mt-1">{errors.terms}</p>
                            )}
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
