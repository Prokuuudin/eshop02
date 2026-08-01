'use client';
import React, { useRef, useState } from 'react';
import { EmptyCartView, NoSelectedItemsView, CheckoutSuccessView, CheckoutRoleBlockedView } from './CheckoutStatusViews'
import Script from 'next/script';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { stores } from '@/data/stores';
import WholesaleMinimumAlert from '@/components/WholesaleMinimumAlert';
import { useCart } from '@/lib/cart-store';
import { useOrders, DeliveryMethod } from '@/lib/orders-store';
import { useAdminStore } from '@/lib/admin-store';
import { calculateDiscount } from '@/lib/promo-codes';
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
import { TURNSTILE_SCRIPT_SRC, useTurnstile } from '@/lib/use-turnstile';
import {
    CustomerDetailsSection,
    type CheckoutFormData,
} from './CheckoutFormSections';

const DELIVERY_OPTIONS: Array<{ id: DeliveryMethod; labelKey: string }> = [
    { id: 'courier', labelKey: 'checkout.delivery.courier' },
    { id: 'pickup', labelKey: 'checkout.delivery.pickup' },
    { id: 'post', labelKey: 'checkout.delivery.omniva' },
];

const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
};


export function useCheckoutPage() {
    const { t, language } = useTranslation();
    const { showToast } = useToast();
    const searchParams = useSearchParams();
    const { items, replaceWithItems } = useCart();
    const { addOrder, updateOrderPayment } = useOrders();
    const { bonusProgram } = useAdminStore();
    const currentUser = getCurrentUser();
    const isCheckoutAllowedForRole = canPlaceOrders(currentUser);
    const { getCompany, syncFromDb } = useCompanyStore();

    React.useEffect(() => {
        void syncFromDb();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    const locale = getLocaleFromLanguage(language);
    const formatCurrency = (value: number): string => formatEuro(value, locale);
    const company = currentUser?.companyId ? getCompany(currentUser.companyId) : undefined;
    const [formData, setFormData] = useState<CheckoutFormData>(() => ({
        firstName: searchParams.get('firstName') ?? '',
        lastName: searchParams.get('lastName') ?? '',
        email: searchParams.get('email') ?? '',
        phone: searchParams.get('phone') ?? '',
        address: searchParams.get('address') ?? '',
        city: searchParams.get('city') ?? '',
        postalCode: searchParams.get('postalCode') ?? '',
        paymentMethod: 'card',
    }));
    const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>(() => {
        const method = searchParams.get('delivery');
        return method === 'courier' || method === 'pickup' || method === 'post'
            ? method
            : 'courier';
    });
    const [pickupStoreId, setPickupStoreId] = useState('');
    const [promoCode, setPromoCode] = useState('');
    const [appliedPromo, setAppliedPromo] = useState<string | undefined>(undefined);
    const [appliedPromoDiscountPct, setAppliedPromoDiscountPct] = useState<number | null>(null);
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
    const applyBtnRef = useRef<HTMLButtonElement>(null)
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

    // ÐžÐ¿Ð»Ð°Ñ‚Ð° Ð¿Ñ€Ð¸ Ð¿Ð¾Ð»ÑƒÑ‡ÐµÐ½Ð¸Ð¸ Ð²Ð¾Ð·Ð¼Ð¾Ð¶Ð½Ð° Ñ‚Ð¾Ð»ÑŒÐºÐ¾ Ð² Ð¾Ñ„Ð¸ÑÐµ (RencÄ“nu 10A) â€”
    // Ñ‚Ñ€ÐµÐ±ÑƒÐµÑ‚ÑÑ ÑÐ°Ð¼Ð¾Ð²Ñ‹Ð²Ð¾Ð· Ð¸Ð¼ÐµÐ½Ð½Ð¾ Ð¸Ð· Â«Ð Ð¸Ð³Ð° ÐžÑ„Ð¸ÑÂ».
    const cashUnavailable = deliveryMethod !== 'pickup' || pickupStoreId !== 'riga-office';
    if (items.length === 0) {
        return <EmptyCartView t={t} />
    }

    if (selectedItemIds && checkoutItems.length === 0) {
        return <NoSelectedItemsView t={t} />
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
                body: JSON.stringify({ code: promoCode, orderAmount: subtotal }),
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
            showToast('Ð”Ð»Ñ Ñ€Ð¾Ð»Ð¸ Ð¼ÐµÐ½ÐµÐ´Ð¶ÐµÑ€Ð° Ð¾Ñ„Ð¾Ñ€Ð¼Ð»ÐµÐ½Ð¸Ðµ Ð·Ð°ÐºÐ°Ð·Ð° Ð½ÐµÐ´Ð¾ÑÑ‚ÑƒÐ¿Ð½Ð¾', 'error');
            setIsSubmitting(false);
            return;
        }

        const newErrors: Record<string, string> = {};

        if (!formData.firstName.trim()) newErrors.firstName = t('checkout.errors.firstName');
        if (!formData.lastName.trim()) newErrors.lastName = t('checkout.errors.lastName');
        if (!formData.email.trim()) {
            newErrors.email = t('checkout.errors.email');
        } else if (!validateEmail(formData.email)) {
            newErrors.email = t('checkout.errors.emailInvalid');
        }
        if (!formData.phone.trim()) newErrors.phone = t('checkout.errors.phone');
        if (!formData.address.trim()) newErrors.address = t('checkout.errors.address');
        if (!formData.city.trim()) newErrors.city = t('checkout.errors.city');
        if (deliveryMethod === 'pickup' && !pickupStoreId) {
            newErrors.pickupStore = t('checkout.errors.pickupStore');
        }
        // Ð¡Ñ‚Ñ€Ð°Ñ…Ð¾Ð²ÐºÐ° Ð¾Ñ‚ Ñ€Ð°ÑÑÐ¸Ð½Ñ…Ñ€Ð¾Ð½Ð° UI: Ð½Ð°Ð»Ð¸Ñ‡Ð½Ñ‹Ðµ Ñ‚Ð¾Ð»ÑŒÐºÐ¾ Ð¿Ñ€Ð¸ ÑÐ°Ð¼Ð¾Ð²Ñ‹Ð²Ð¾Ð·Ðµ Ð¸Ð· Ð¾Ñ„Ð¸ÑÐ°.
        if (formData.paymentMethod === 'cash' && cashUnavailable) {
            showToast(t('checkout.payment.cashNote'), 'error');
            setIsSubmitting(false);
            return;
        }
        if (!termsAccepted) {
            newErrors.terms = t('checkout.errors.terms');
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
        const discount = appliedPromo && appliedPromoDiscountPct !== null
            ? calculateDiscount(subtotal, appliedPromoDiscountPct)
            : 0;
        const subtotalAfterDiscount = subtotal - discount;
        const deliveryFee = calcDeliveryFee(deliveryMethod, subtotalAfterDiscount);

        // Catalog prices already include VAT â€” taxAmount is informational, not added to the total.
        const taxAmount = extractVat(subtotalAfterDiscount);
        const grandTotal = subtotalAfterDiscount + deliveryFee;
        // Ð¡Ð¿Ð¸ÑÐ°Ð½Ð¸Ðµ Ð² Ð±Ð°Ð»Ð»Ð°Ñ… (1 Ð±Ð°Ð»Ð» = 1 Ñ†ÐµÐ½Ñ‚); ÑÐºÐ¸Ð´ÐºÐ° â€” ÐµÐ³Ð¾ ÐµÐ²Ñ€Ð¾-ÑÐºÐ²Ð¸Ð²Ð°Ð»ÐµÐ½Ñ‚.
        const bonusSpentPoints = bonusApplied
            ? Math.min(currentUser?.bonusPoints ?? 0, eurosToPoints(grandTotal * bonusProgram.maxSpendPercent / 100))
            : 0;
        const bonusDiscount = pointsToEuros(bonusSpentPoints);
        const finalGrandTotal = grandTotal - bonusDiscount;

        // Create order â€” the server assigns the canonical id (client counters collide across browsers)
        const orderData = {
            createdAt: new Date(),
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
            paymentStatus: (formData.paymentMethod === 'card'
                ? 'pending'
                : 'unpaid') as import('@/lib/orders-store').PaymentStatus,
            paymentProvider: (formData.paymentMethod === 'card' ? 'stripe' : 'manual') as
                | 'stripe'
                | 'manual',
            language: language as string,
            ...formData,
        };

        // Persist server-side first: the server generates the unique order id and
        // payment webhooks update canonical status there. If this fails, the order
        // exists nowhere (no DB row, no confirmation email, no admin notification) â€”
        // checkout must stop here rather than fake a success screen.
        let orderId: string;
        try {
            const response = await fetch('/api/orders', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    order: {
                        ...orderData,
                        createdAt: orderData.createdAt.toISOString(),
                    },
                    turnstileToken,
                }),
            });
            if (!response.ok) {
                const errorPayload = await response
                    .json()
                    .catch(() => null) as { error?: string; items?: string[] } | null;
                const message =
                    errorPayload?.error === 'insufficient_stock'
                        ? 'ÐÐµÐºÐ¾Ñ‚Ð¾Ñ€Ñ‹Ñ… Ñ‚Ð¾Ð²Ð°Ñ€Ð¾Ð² ÑƒÐ¶Ðµ Ð½ÐµÑ‚ Ð² Ð´Ð¾ÑÑ‚Ð°Ñ‚Ð¾Ñ‡Ð½Ð¾Ð¼ ÐºÐ¾Ð»Ð¸Ñ‡ÐµÑÑ‚Ð²Ðµ. ÐžÐ±Ð½Ð¾Ð²Ð¸Ñ‚Ðµ ÐºÐ¾Ñ€Ð·Ð¸Ð½Ñƒ Ð¸ Ð¿Ð¾Ð¿Ñ€Ð¾Ð±ÑƒÐ¹Ñ‚Ðµ ÑÐ½Ð¾Ð²Ð°.'
                        : 'ÐÐµ ÑƒÐ´Ð°Ð»Ð¾ÑÑŒ Ð¾Ñ„Ð¾Ñ€Ð¼Ð¸Ñ‚ÑŒ Ð·Ð°ÐºÐ°Ð·. ÐŸÐ¾Ð¿Ñ€Ð¾Ð±ÑƒÐ¹Ñ‚Ðµ ÐµÑ‰Ñ‘ Ñ€Ð°Ð·.';
                showToast(message, 'error');
                resetTurnstile();
                setIsSubmitting(false);
                return;
            }
            const payload = (await response.json()) as { orderId?: string };
            if (!payload.orderId) {
                showToast('ÐÐµ ÑƒÐ´Ð°Ð»Ð¾ÑÑŒ Ð¾Ñ„Ð¾Ñ€Ð¼Ð¸Ñ‚ÑŒ Ð·Ð°ÐºÐ°Ð·. ÐŸÐ¾Ð¿Ñ€Ð¾Ð±ÑƒÐ¹Ñ‚Ðµ ÐµÑ‰Ñ‘ Ñ€Ð°Ð·.', 'error');
                setIsSubmitting(false);
                return;
            }
            orderId = String(payload.orderId);
        } catch {
            resetTurnstile();
            showToast('ÐÐµ ÑƒÐ´Ð°Ð»Ð¾ÑÑŒ Ð¾Ñ„Ð¾Ñ€Ð¼Ð¸Ñ‚ÑŒ Ð·Ð°ÐºÐ°Ð·. ÐŸÑ€Ð¾Ð²ÐµÑ€ÑŒÑ‚Ðµ ÑÐ¾ÐµÐ´Ð¸Ð½ÐµÐ½Ð¸Ðµ Ð¸ Ð¿Ð¾Ð¿Ñ€Ð¾Ð±ÑƒÐ¹Ñ‚Ðµ ÐµÑ‰Ñ‘ Ñ€Ð°Ð·.', 'error');
            setIsSubmitting(false);
            return;
        }

        const order = { id: orderId, ...orderData };
        addOrder(order);

        // Ð¡ÐµÑ€Ð²ÐµÑ€ Ð´ÐµÐ±ÐµÑ‚Ð¾Ð²Ð°Ð»/ÐºÑ€ÐµÐ´Ð¸Ñ‚Ð¾Ð²Ð°Ð» Ð±Ð°Ð»Ð»Ñ‹ Ð¿Ñ€Ð¸ ÑÐ¾Ð·Ð´Ð°Ð½Ð¸Ð¸ Ð·Ð°ÐºÐ°Ð·Ð° â€” Ð¿Ð¾Ð´Ñ‚ÑÐ³Ð¸Ð²Ð°ÐµÐ¼ ÑÐ²ÐµÐ¶Ð¸Ð¹ Ð±Ð°Ð»Ð°Ð½Ñ.
        if (currentUser) {
            await syncBonusBalanceFromServer();
        }

        let stripeCheckoutUrl: string | undefined;

        if (formData.paymentMethod === 'card') {
            try {
                const response = await fetch('/api/payments/stripe/checkout', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        orderId,
                        email: formData.email,
                        grandTotal: finalGrandTotal,
                        items: checkoutItems.map((item) => ({
                            id: item.id,
                            title: t(`products.${item.id}.title`, item.title),
                            quantity: item.quantity,
                            price: calculatePrice(item, item.quantity),
                        })),
                    }),
                });

                if (!response.ok) {
                    updateOrderPayment(orderId, {
                        paymentStatus: 'failed' as import('@/lib/orders-store').PaymentStatus,
                        paymentProvider: 'stripe',
                    });
                    showToast(
                        'ÐÐµ ÑƒÐ´Ð°Ð»Ð¾ÑÑŒ Ð¸Ð½Ð¸Ñ†Ð¸Ð°Ð»Ð¸Ð·Ð¸Ñ€Ð¾Ð²Ð°Ñ‚ÑŒ Ð¾Ð½Ð»Ð°Ð¹Ð½-Ð¾Ð¿Ð»Ð°Ñ‚Ñƒ. ÐŸÐ¾Ð¿Ñ€Ð¾Ð±ÑƒÐ¹Ñ‚Ðµ ÑÐ½Ð¾Ð²Ð°.',
                        'error'
                    );
                    setIsSubmitting(false);
                    return;
                }

                const payload = (await response.json()) as { url?: string; sessionId?: string };
                if (!payload.url) {
                    updateOrderPayment(orderId, {
                        paymentStatus: 'failed' as import('@/lib/orders-store').PaymentStatus,
                        paymentProvider: 'stripe',
                    });
                    showToast('ÐŸÐ»Ð°Ñ‚ÐµÐ¶Ð½Ð°Ñ ÑÐµÑÑÐ¸Ñ Ð½Ðµ Ð±Ñ‹Ð»Ð° ÑÐ¾Ð·Ð´Ð°Ð½Ð°. ÐŸÐ¾Ð¿Ñ€Ð¾Ð±ÑƒÐ¹Ñ‚Ðµ ÑÐ½Ð¾Ð²Ð°.', 'error');
                    setIsSubmitting(false);
                    return;
                }

                updateOrderPayment(orderId, {
                    paymentStatus: 'pending' as import('@/lib/orders-store').PaymentStatus,
                    paymentProvider: 'stripe',
                    paymentSessionId: payload.sessionId,
                });
                stripeCheckoutUrl = payload.url;
            } catch {
                updateOrderPayment(orderId, {
                    paymentStatus: 'failed' as import('@/lib/orders-store').PaymentStatus,
                    paymentProvider: 'stripe',
                });
                showToast('ÐžÑˆÐ¸Ð±ÐºÐ° Ð¿Ñ€Ð¸ Ð·Ð°Ð¿ÑƒÑÐºÐµ Ð¾Ð¿Ð»Ð°Ñ‚Ñ‹. ÐŸÐ¾Ð¿Ñ€Ð¾Ð±ÑƒÐ¹Ñ‚Ðµ ÑÐ½Ð¾Ð²Ð°.', 'error');
                setIsSubmitting(false);
                return;
            }
        }

        // B2B: Generate invoice if customer has payment terms
        const paymentTermDays = company?.paymentTermDays ?? 0;
        if (paymentTermDays > 0 && currentUser?.companyId) {
            const createInvoice = useInvoicesStore.getState().createInvoice;
            const issuedDate = new Date();
            const dueDate = new Date(issuedDate);
            dueDate.setDate(dueDate.getDate() + paymentTermDays);

            const invoiceId = createInvoice({
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
                notes: `Ð—Ð°ÐºÐ°Ð· #${orderId} Ð¾Ñ‚ ${issuedDate.toLocaleDateString('ru-RU')}`,
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
            if (formData.paymentMethod === 'card' && stripeCheckoutUrl) {
                window.location.href = stripeCheckoutUrl;
                return;
            }

            setIsSubmitting(false);
            window.location.href = `/order/${orderId}`;
        }, 500);
    };

    if (submitted) {
        return <CheckoutSuccessView t={t} />
    }

    if (!isCheckoutAllowedForRole) {
        return <CheckoutRoleBlockedView t={t} />
    }

    const discount = appliedPromo && appliedPromoDiscountPct !== null
        ? calculateDiscount(subtotal, appliedPromoDiscountPct)
        : 0;
    const subtotalAfterDiscount = subtotal - discount;
    const deliveryFee = calcDeliveryFee(deliveryMethod, subtotalAfterDiscount);
    // Catalog prices already include VAT â€” taxAmount is informational, not added to the total.
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
    // ÐŸÐ¾Ñ‚Ð¾Ð»Ð¾Ðº ÑÐ¿Ð¸ÑÐ°Ð½Ð¸Ñ Ð² Ð±Ð°Ð»Ð»Ð°Ñ… (1 Ð±Ð°Ð»Ð» = 1 Ñ†ÐµÐ½Ñ‚); Ð² â‚¬ â€” Ð´Ð»Ñ ÑÑ‚Ñ€Ð¾Ðº Ð¸Ñ‚Ð¾Ð³Ð°.
    const maxBonusSpendPoints = bonusApplicable
        ? Math.min(userBonusBalance, eurosToPoints(grandTotal * bonusProgram.maxSpendPercent / 100))
        : 0;
    const maxBonusDiscount = pointsToEuros(maxBonusSpendPoints);
    const bonusDiscount = bonusApplied ? maxBonusDiscount : 0;
    const finalGrandTotal = grandTotal - bonusDiscount;
    const adjustedBonusToEarn = grandTotal > 0 && bonusApplied
        ? Math.round(bonusToEarn * finalGrandTotal / grandTotal)
        : bonusToEarn;


    return { t, language, showToast, searchParams, items, replaceWithItems, addOrder, updateOrderPayment, bonusProgram, currentUser, isCheckoutAllowedForRole, getCompany, syncFromDb, locale, formatCurrency, company, formData, setFormData, deliveryMethod, setDeliveryMethod, pickupStoreId, setPickupStoreId, promoCode, setPromoCode, appliedPromo, setAppliedPromo, appliedPromoDiscountPct, setAppliedPromoDiscountPct, bonusApplied, setBonusApplied, termsAccepted, setTermsAccepted, promoError, setPromoError, submitted, isSubmitting, errors, setErrors, turnstileEnabled, turnstileToken, setTurnstileContainer, renderTurnstile, resetTurnstile, applyBtnRef, selectedItemIds, checkoutItems, subtotal, cashUnavailable, handleChange, handleApplyPromo, handleSubmit, discount, subtotalAfterDiscount, deliveryFee, taxAmount, grandTotal, wholesaleGuard, userBonusBalance, bonusToEarn, bonusApplicable, maxBonusSpendPoints, maxBonusDiscount, bonusDiscount, finalGrandTotal, adjustedBonusToEarn }
}
