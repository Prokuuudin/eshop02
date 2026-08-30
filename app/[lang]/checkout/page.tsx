'use client';
import React from 'react';
import Script from 'next/script';
import Link from 'next/link';
import { ClipboardCheck, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import { DeliveryMethod } from '@/lib/orders-store';
import { calcDeliveryFee } from '@/lib/delivery';
import { TURNSTILE_SCRIPT_SRC } from '@/lib/use-turnstile';
import { CustomerDetailsSection } from './CheckoutFormSections';

const DELIVERY_OPTIONS: Array<{ id: DeliveryMethod; labelKey: string }> = [
    { id: 'courier', labelKey: 'checkout.delivery.courier' },
    { id: 'pickup', labelKey: 'checkout.delivery.pickup' },
    { id: 'post', labelKey: 'checkout.delivery.omniva' },
    { id: 'venipak', labelKey: 'checkout.delivery.venipak' },
];

import { useCheckoutPage } from './useCheckoutPage';
import { CheckoutSummary } from './CheckoutSummary';
export default function CheckoutPage(): React.ReactElement {
    const checkoutPage = useCheckoutPage();
    if (React.isValidElement(checkoutPage)) return checkoutPage;
    const checkoutState = checkoutPage as Exclude<
        ReturnType<typeof useCheckoutPage>,
        React.ReactElement
    >;
    const {
            t,
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
            termsAccepted,
            setTermsAccepted,
            isSubmitting,
            errors,
            setErrors,
            turnstileEnabled,
            turnstileToken,
            setTurnstileContainer,
            renderTurnstile,
            cashUnavailable,
            handleChange,
            handleSubmit,
            subtotalAfterDiscount,
            wholesaleGuard,
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

                <CheckoutSummary state={checkoutState} />
            </div>
        </main>
    );
}
