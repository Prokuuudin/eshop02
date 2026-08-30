'use client';
import React, { useRef, useState } from 'react';
import {
    EmptyCartView,
    NoSelectedItemsView,
    CheckoutSuccessView,
    CheckoutRoleBlockedView,
} from './CheckoutStatusViews';
import { useSearchParams } from 'next/navigation';
import { useCart } from '@/lib/cart-store';
import { useOrders, DeliveryMethod } from '@/lib/orders-store';
import { useAdminStore } from '@/lib/admin-store';
import { extractVat } from '@/lib/tax';
import { useTranslation } from '@/lib/use-translation';
import { formatEuro, getLocaleFromLanguage } from '@/lib/utils';
import { useToast } from '@/lib/toast-context';
import { canPlaceOrders, getCurrentUser, syncBonusBalanceFromServer } from '@/lib/auth';
import { calculatePrice, getWholesaleOrderGuard } from '@/lib/customer-segmentation';
import { calcOrderBonus, pointsToEuros, eurosToPoints } from '@/lib/bonus-program';
import { calcDeliveryFee } from '@/lib/delivery';
import { useInvoicesStore } from '@/lib/invoices-store';
import { logAuditAction } from '@/lib/audit-log-store';
import { useCompanyStore } from '@/lib/company-store';
import { burstConfetti } from '@/lib/confetti';
import { useTurnstile } from '@/lib/use-turnstile';
import { useSavedAddresses, hydrateSavedAddressesFromServer } from '@/lib/saved-addresses-store';
import {
    pickPrefillAddress,
    buildSaveBackAddress,
    buildPrefillFallback,
    buildCheckoutProfileFallback,
    buildLastOrderFallback,
    mergeEmptyCheckoutFields,
} from '@/lib/checkout-address-prefill';
import { type CheckoutFormData } from './CheckoutFormSections';
import { validateCheckoutForm } from './checkout-validation';
import { createCheckoutOrder } from './checkout-order-api';

function useCheckoutPageState() {
    const { t, language } = useTranslation();
    const { showToast } = useToast();
    const searchParams = useSearchParams();
    const { items, removeItem, updateQuantity, replaceWithItems } = useCart();
    const { addOrder } = useOrders();
    const { bonusProgram } = useAdminStore();
    const currentUser = getCurrentUser();
    const isCheckoutAllowedForRole = canPlaceOrders(currentUser);
    const { getCompany, syncFromDb } = useCompanyStore();
    const { getByEmail, upsertForEmail, replaceForEmail } = useSavedAddresses();

    React.useEffect(() => {
        void syncFromDb();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    const locale = getLocaleFromLanguage(language);
    const formatCurrency = (value: number): string => formatEuro(value, locale);
    const company = currentUser?.companyId ? getCompany(currentUser.companyId) : undefined;
    const [formData, setFormData] = useState<CheckoutFormData>(() => ({
        customerType: 'individual',
        personalCode: '',
        companyName: '',
        regNumber: '',
        vatNumber: '',
        legalAddress: '',
        bankName: '',
        iban: '',
        firstName: searchParams.get('firstName') ?? '',
        lastName: searchParams.get('lastName') ?? '',
        email: searchParams.get('email') ?? '',
        phone: searchParams.get('phone') ?? '',
        address: searchParams.get('address') ?? '',
        city: searchParams.get('city') ?? '',
        postalCode: searchParams.get('postalCode') ?? '',
        paymentMethod: 'bank',
    }));

    // Prefill from the user's saved address / profile, but never clobber a field
    // that's already filled (e.g. from a "Use this address" query-param link above).
    React.useEffect(() => {
        if (!currentUser?.email || !currentUser?.id) return;
        let cancelled = false;
        void Promise.all([
            hydrateSavedAddressesFromServer(currentUser.email, replaceForEmail),
            fetch('/api/orders/my').then(async (response) => response.ok ? (await response.json() as { orders?: Array<Record<string, unknown>> }).orders?.[0] : undefined).catch(() => undefined),
        ]).then(([, lastOrder]) => {
            if (cancelled) return;
            const saved = pickPrefillAddress(getByEmail(currentUser.email), currentUser.id);
            const hasExplicitAddress = !!searchParams.get('address');
            const savedFallback = buildPrefillFallback(currentUser, saved, hasExplicitAddress);
            const profileFallback = buildCheckoutProfileFallback(currentUser);
            setFormData((previous) => {
                let next = mergeEmptyCheckoutFields<CheckoutFormData>(previous, profileFallback);
                next = mergeEmptyCheckoutFields<CheckoutFormData>(next, savedFallback);
                next = mergeEmptyCheckoutFields<CheckoutFormData>(next, buildLastOrderFallback(lastOrder));
                return next;
            });
        });
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentUser?.id, currentUser?.email]);
    const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>(() => {
        const method = searchParams.get('delivery');
        return method === 'courier' || method === 'pickup' || method === 'post' || method === 'venipak'
            ? method
            : 'courier';
    });
    const [pickupStoreId, setPickupStoreId] = useState('');
    const [cashLockAlert, setCashLockAlert] = useState(false);
    const [promoCode, setPromoCode] = useState('');
    const [appliedPromo, setAppliedPromo] = useState<string | undefined>(undefined);
    const [appliedPromoDiscountPct, setAppliedPromoDiscountPct] = useState<number | null>(null);
    const [campaignOffer, setCampaignOffer] = useState<{ discount: number; freeShipping: boolean; campaignName?: string }>({ discount: 0, freeShipping: false });
    const [bonusApplied, setBonusApplied] = useState(false);
    const [termsAccepted, setTermsAccepted] = useState(false);
    const [promoError, setPromoError] = useState('');
    const [submitted, setSubmitted] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const {
        enabled: turnstileEnabled,
        token: turnstileToken,
        setContainer: setTurnstileContainer,
        render: renderTurnstile,
        reset: resetTurnstile,
    } = useTurnstile();
    const applyBtnRef = useRef<HTMLButtonElement>(null);
    const selectedItemIds = React.useMemo(() => {
        const raw = searchParams.get('items');
        if (!raw) return null;

        return raw
            .split(',')
            .map((id) => id.trim())
            .filter(Boolean);
    }, [searchParams]);

    const checkoutItems = React.useMemo(() => {
        if (!selectedItemIds) return items;

        const selectedSet = new Set(selectedItemIds);
        return items.filter((item) => selectedSet.has(item.lineKey));
    }, [items, selectedItemIds]);

    const subtotal = React.useMemo(
        () =>
            checkoutItems.reduce(
                (sum, item) => sum + calculatePrice(item, item.quantity) * item.quantity,
                0
            ),
        [checkoutItems]
    );

    React.useEffect(() => {
        let cancelled = false;
        const controller = new AbortController();
        void fetch('/api/promo/campaigns/evaluate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items: checkoutItems.map(({ id, quantity }) => ({ id, quantity })) }),
            signal: controller.signal,
        }).then(async (response) => {
            if (!response.ok || cancelled) return;
            const result = await response.json() as { discount?: number; freeShipping?: boolean; campaignName?: string };
            if (!cancelled) setCampaignOffer({
                discount: Math.max(0, Number(result.discount) || 0),
                freeShipping: result.freeShipping === true,
                campaignName: result.campaignName,
            });
        }).catch(() => undefined);
        return () => { cancelled = true; controller.abort(); };
    }, [checkoutItems]);

    // Оплата при получении возможна только в офисе (Rencēnu 10A) —
    // требуется самовывоз именно из «Рига Офис».
    const cashUnavailable = deliveryMethod !== 'pickup' || pickupStoreId !== 'riga-office';
    if (items.length === 0) {
        return <EmptyCartView t={t} />;
    }

    if (selectedItemIds && checkoutItems.length === 0) {
        return <NoSelectedItemsView t={t} />;
    }

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>): void => {
        setFormData((prev) => ({
            ...prev,
            [e.target.name]: e.target.value,
        }));
        if (errors[e.target.name]) {
            setErrors((prev) => {
                const newErrors = { ...prev };
                delete newErrors[e.target.name];
                return newErrors;
            });
        }
    };

    const handleApplyPromo = async (): Promise<void> => {
        setPromoError('');
        if (!promoCode.trim()) {
            const message = t('checkout.promo.enter');
            setPromoError(message);
            showToast(message, 'error');
            return;
        }

        try {
            const res = await fetch('/api/promo/validate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code: promoCode, email: formData.email, items: checkoutItems.map(({ id, quantity }) => ({ id, quantity })) }),
            });
            const data = (await res.json()) as { valid: boolean; discount?: number; code?: string };
            if (!data.valid) {
                const message = t('checkout.promo.invalid');
                setPromoError(message);
                showToast(message, 'error');
                return;
            }
            setAppliedPromo(data.code ?? promoCode);
            setAppliedPromoDiscountPct(data.discount ?? 0);
            if (applyBtnRef.current) burstConfetti(applyBtnRef.current);
        } catch {
            const message = t('checkout.promo.invalid');
            setPromoError(message);
            showToast(message, 'error');
        }
    };

    const handleSubmit = async (e: React.FormEvent): Promise<void> => {
        e.preventDefault();
        setIsSubmitting(true);

        if (!isCheckoutAllowedForRole) {
            showToast(
                'Для роли менеджера оформление заказа недоступно',
                'error'
            );
            setIsSubmitting(false);
            return;
        }

        const newErrors = validateCheckoutForm(
            { formData, deliveryMethod, pickupStoreId, termsAccepted },
            t
        );
        // Страховка от рассинхрона UI: наличные только при самовывозе из офиса.
        if (formData.paymentMethod === 'cash' && cashUnavailable) {
            showToast(t('checkout.payment.cashNote'), 'error');
            setIsSubmitting(false);
            return;
        }
        if (newErrors.terms) {
            showToast(t('checkout.errors.terms'), 'error');
        }

        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors);
            setIsSubmitting(false);
            return;
        }

        const wholesaleGuard = getWholesaleOrderGuard(subtotal);
        if (!wholesaleGuard.isMinimumReached) {
            const message = `${t('checkout.minimumOrder')} ${t(
                'checkout.wholesale.requiredAmount'
            )}: ${formatCurrency(wholesaleGuard.minOrderAmount)}`;
            showToast(message, 'error');
            setIsSubmitting(false);
            return;
        }

        // Calculate totals
        const promoDiscount = appliedPromo && appliedPromoDiscountPct !== null ? appliedPromoDiscountPct : 0;
        const discount = Math.max(promoDiscount, campaignOffer.discount);
        const subtotalAfterDiscount = subtotal - discount;
        const deliveryFee = campaignOffer.freeShipping ? 0 : calcDeliveryFee(deliveryMethod, subtotalAfterDiscount);

        // Catalog prices already include VAT — taxAmount is informational, not added to the total.
        const taxAmount = extractVat(subtotalAfterDiscount);
        const grandTotal = subtotalAfterDiscount + deliveryFee;
        // Списание в баллах (1 балл = 1 цент); скидка — его евро-эквивалент.
        const bonusSpentPoints = bonusApplied
            ? Math.min(
                  currentUser?.bonusPoints ?? 0,
                  eurosToPoints((grandTotal * bonusProgram.maxSpendPercent) / 100)
              )
            : 0;
        const bonusDiscount = pointsToEuros(bonusSpentPoints);
        const finalGrandTotal = grandTotal - bonusDiscount;

        const legalDetails = formData.customerType === 'company'
            ? {
                  customerType: 'company' as const,
                  companyName: formData.companyName.trim(),
                  regNumber: formData.regNumber.trim(),
                  vatNumber: formData.vatNumber.trim() || undefined,
                  legalAddress: formData.legalAddress.trim(),
                  bankName: formData.bankName.trim(),
                  iban: formData.iban.trim(),
              }
            : { customerType: 'individual' as const, personalCode: formData.personalCode.trim() };

        // Create order — the server assigns the canonical id (client counters collide across browsers)
        const orderData = {
            createdAt: new Date(),
            legalDetails,
            items: checkoutItems.map((item) => ({
                ...item,
                price: calculatePrice(item, item.quantity),
            })),
            subtotal,
            tax: taxAmount,
            delivery: deliveryFee,
            deliveryMethod,
            pickupStoreId: deliveryMethod === 'pickup' ? pickupStoreId : undefined,
            promoCode: appliedPromo,
            discount,
            total: finalGrandTotal,
            bonusSpent: bonusSpentPoints > 0 ? bonusSpentPoints : undefined,
            paymentStatus: 'unpaid' as import('@/lib/orders-store').PaymentStatus,
            paymentProvider: 'manual' as const,
            language: language as string,
            ...formData,
        };

        // Persist server-side first: the server generates the unique order id. If this
        // fails, the order exists nowhere (no DB row, no confirmation email, no admin
        // notification) — checkout must stop here rather than fake a success screen.
        const createResult = await createCheckoutOrder(orderData, turnstileToken);
        if (!createResult.ok) {
            const message = createResult.reason === 'insufficient_stock'
                ? 'Некоторых товаров уже нет в достаточном количестве. Обновите корзину и попробуйте снова.'
                : createResult.reason === 'network'
                    ? 'Не удалось оформить заказ. Проверьте соединение и попробуйте ещё раз.'
                    : 'Не удалось оформить заказ. Попробуйте ещё раз.';
            showToast(message, 'error');
            if (createResult.reason !== 'invalid_response') resetTurnstile();
            setIsSubmitting(false);
            return;
        }
        const { orderId } = createResult;

        const order = { id: orderId, ...orderData };
        addOrder(order);

        // Silently keep the address book in sync so next checkout prefills from it.
        // Fixed id → repeat orders update the same row instead of piling up duplicates.
        const addressToSave = buildSaveBackAddress(currentUser, formData);
        if (addressToSave) {
            upsertForEmail(addressToSave.email, addressToSave);
        }

        // Сервер дебетовал/кредитовал баллы при создании заказа — подтягиваем свежий баланс.
        if (currentUser) {
            await syncBonusBalanceFromServer();
        }

        // B2B: Generate invoice if customer has payment terms
        const paymentTermDays = company?.paymentTermDays ?? 0;
        if (paymentTermDays > 0 && currentUser?.companyId) {
            const createInvoice = useInvoicesStore.getState().createInvoice;
            const issuedDate = new Date();
            const dueDate = new Date(issuedDate);
            dueDate.setDate(dueDate.getDate() + paymentTermDays);

            const invoiceId = await createInvoice({
                companyId: currentUser.companyId,
                orderId,
                subtotal,
                taxRate: 18,
                taxAmount,
                total: grandTotal,
                status: 'issued',
                issuedDate,
                dueDate,
                paidDate: undefined,
                notes: `Заказ #${orderId} от ${issuedDate.toLocaleDateString('ru-RU')}`,
            });

            // Log invoice creation
            logAuditAction(
                currentUser.companyId,
                currentUser.id,
                'invoice_issued',
                {
                    invoiceId,
                    orderId,
                    amount: grandTotal,
                    dueDate: dueDate.toISOString(),
                },
                { userName: currentUser.name, userEmail: currentUser.email }
            );
        }

        const selectedSet = new Set(checkoutItems.map((item) => item.lineKey));
        const remainingItems = items.filter((item) => !selectedSet.has(item.lineKey));
        replaceWithItems(remainingItems);
        setSubmitted(true);

        // Redirect to confirmation page
        setTimeout(() => {
            setIsSubmitting(false);
            window.location.href = `/order/${orderId}`;
        }, 500);
    };

    if (submitted) {
        return <CheckoutSuccessView t={t} />;
    }

    if (!isCheckoutAllowedForRole) {
        return <CheckoutRoleBlockedView t={t} />;
    }

    const promoDiscount = appliedPromo && appliedPromoDiscountPct !== null ? appliedPromoDiscountPct : 0;
    const discount = Math.max(promoDiscount, campaignOffer.discount);
    const subtotalAfterDiscount = subtotal - discount;
    const deliveryFee = campaignOffer.freeShipping ? 0 : calcDeliveryFee(deliveryMethod, subtotalAfterDiscount);
    // Catalog prices already include VAT — taxAmount is informational, not added to the total.
    const taxAmount = extractVat(subtotalAfterDiscount);
    const grandTotal = subtotalAfterDiscount + deliveryFee;
    const wholesaleGuard = getWholesaleOrderGuard(subtotal);
    const userBonusBalance = currentUser?.bonusPoints ?? 0;
    const bonusToEarn = calcOrderBonus(
        checkoutItems.map((item) => ({
            price: calculatePrice(item, item.quantity),
            quantity: item.quantity,
            bonusRate: item.bonusRate,
        }))
    );
    const bonusApplicable = bonusProgram.enabled && !!currentUser && userBonusBalance > 0;
    // Потолок списания в баллах (1 балл = 1 цент); в € — для строк итога.
    const maxBonusSpendPoints = bonusApplicable
        ? Math.min(
              userBonusBalance,
              eurosToPoints((grandTotal * bonusProgram.maxSpendPercent) / 100)
          )
        : 0;
    const maxBonusDiscount = pointsToEuros(maxBonusSpendPoints);
    const bonusDiscount = bonusApplied ? maxBonusDiscount : 0;
    const finalGrandTotal = grandTotal - bonusDiscount;
    const adjustedBonusToEarn =
        grandTotal > 0 && bonusApplied
            ? Math.round((bonusToEarn * finalGrandTotal) / grandTotal)
            : bonusToEarn;

    return {
        t,
        language,
        showToast,
        searchParams,
        items,
        removeItem,
        updateQuantity,
        replaceWithItems,
        addOrder,
        bonusProgram,
        currentUser,
        isCheckoutAllowedForRole,
        getCompany,
        syncFromDb,
        locale,
        formatCurrency,
        company,
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
        submitted,
        isSubmitting,
        errors,
        setErrors,
        turnstileEnabled,
        turnstileToken,
        setTurnstileContainer,
        renderTurnstile,
        resetTurnstile,
        applyBtnRef,
        selectedItemIds,
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
        grandTotal,
        wholesaleGuard,
        userBonusBalance,
        bonusToEarn,
        bonusApplicable,
        maxBonusSpendPoints,
        maxBonusDiscount,
        bonusDiscount,
        finalGrandTotal,
        adjustedBonusToEarn,
    };
}

export function useCheckoutPage(): ReturnType<typeof useCheckoutPageState> {
  return useCheckoutPageState()
}
