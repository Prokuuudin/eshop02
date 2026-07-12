'use client';
import React, { useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
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
import PhoneInput from '@/components/ui/phone-input';
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

const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
};


const DELIVERY_OPTIONS: Array<{ id: DeliveryMethod; labelKey: string }> = [
    { id: 'courier', labelKey: 'checkout.delivery.courier' },
    { id: 'pickup', labelKey: 'checkout.delivery.pickup' },
    { id: 'post', labelKey: 'checkout.delivery.omniva' },
];

export default function CheckoutPage() {
    const { t, language } = useTranslation();
    const { showToast } = useToast();
    const searchParams = useSearchParams();
    const { items, replaceWithItems } = useCart();
    const { addOrder, updateOrderPayment } = useOrders();
    const { bonusProgram } = useAdminStore();
    const currentUser = getCurrentUser();
    const isCheckoutAllowedForRole = canPlaceOrders(currentUser);
    const { getCompany } = useCompanyStore();
    const locale = getLocaleFromLanguage(language);
    const formatCurrency = (value: number): string => formatEuro(value, locale);
    const company = currentUser?.companyId ? getCompany(currentUser.companyId) : undefined;
    const [formData, setFormData] = useState({
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
        address: '',
        city: '',
        postalCode: '',
        paymentMethod: 'card',
    });
    const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>('courier');
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

    // Метод доставки, выбранный в корзине/дровере, приходит query-параметром
    React.useEffect(() => {
        const method = searchParams.get('delivery');
        if (method === 'courier' || method === 'pickup' || method === 'post') {
            setDeliveryMethod(method);
        }
    }, [searchParams]);

    React.useEffect(() => {
        const firstName = searchParams.get('firstName');
        const lastName = searchParams.get('lastName');
        const email = searchParams.get('email');
        const phone = searchParams.get('phone');
        const address = searchParams.get('address');
        const city = searchParams.get('city');
        const postalCode = searchParams.get('postalCode');

        if (!firstName && !lastName && !email && !phone && !address && !city && !postalCode) {
            return;
        }

        setFormData((prev) => ({
            ...prev,
            firstName: firstName ?? prev.firstName,
            lastName: lastName ?? prev.lastName,
            email: email ?? prev.email,
            phone: phone ?? prev.phone,
            address: address ?? prev.address,
            city: city ?? prev.city,
            postalCode: postalCode ?? prev.postalCode,
        }));
    }, [searchParams]);

    if (items.length === 0) {
        return (
            <main className="w-full px-4 py-12">
                <h1 className="text-2xl font-bold mb-4 text-foreground">
                    {t('checkout.title')}
                </h1>
                <p className="text-muted-foreground mb-4">{t('checkout.empty')}</p>
                <Link href="/catalog">
                    <Button>{t('checkout.backToCatalog')}</Button>
                </Link>
            </main>
        );
    }

    if (selectedItemIds && checkoutItems.length === 0) {
        return (
            <main className="w-full px-4 py-12">
                <h1 className="text-2xl font-bold mb-4 text-foreground">
                    {t('checkout.title')}
                </h1>
                <p className="text-muted-foreground mb-4">{t('checkout.noSelected')}</p>
                <Link href="/cart">
                    <Button>{t('checkout.backToCart')}</Button>
                </Link>
            </main>
        );
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
            showToast('Для роли менеджера оформление заказа недоступно', 'error');
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

        // Catalog prices already include VAT — taxAmount is informational, not added to the total.
        const taxAmount = extractVat(subtotalAfterDiscount);
        const grandTotal = subtotalAfterDiscount + deliveryFee;
        // Списание в баллах (1 балл = 1 цент); скидка — его евро-эквивалент.
        const bonusSpentPoints = bonusApplied
            ? Math.min(currentUser?.bonusPoints ?? 0, eurosToPoints(grandTotal * bonusProgram.maxSpendPercent / 100))
            : 0;
        const bonusDiscount = pointsToEuros(bonusSpentPoints);
        const finalGrandTotal = grandTotal - bonusDiscount;

        // Create order — the server assigns the canonical id (client counters collide across browsers)
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
        // payment webhooks update canonical status there.
        let orderId = `local-${Date.now()}`;
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
                }),
            });
            if (response.ok) {
                const payload = (await response.json()) as { orderId?: string };
                if (payload.orderId) orderId = String(payload.orderId);
            }
        } catch {
            // Checkout should still proceed even if server order persistence is temporarily unavailable.
        }

        const order = { id: orderId, ...orderData };
        addOrder(order);

        // Сервер дебетовал/кредитовал баллы при создании заказа — подтягиваем свежий баланс.
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
                        'Не удалось инициализировать онлайн-оплату. Попробуйте снова.',
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
                    showToast('Платежная сессия не была создана. Попробуйте снова.', 'error');
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
                showToast('Ошибка при запуске оплаты. Попробуйте снова.', 'error');
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
            if (formData.paymentMethod === 'card' && stripeCheckoutUrl) {
                window.location.href = stripeCheckoutUrl;
                return;
            }

            setIsSubmitting(false);
            window.location.href = `/order/${orderId}`;
        }, 500);
    };

    if (submitted) {
        return (
            <main className="w-full px-4 py-12">
                <div className="max-w-md mx-auto text-center">
                    <div className="text-6xl mb-4">✓</div>
                    <h1 className="text-2xl font-bold mb-2 text-foreground">
                        {t('checkout.success.title')}
                    </h1>
                    <p className="text-muted-foreground mb-4">
                        {t('checkout.success.redirect')}
                    </p>
                </div>
            </main>
        );
    }

    if (!isCheckoutAllowedForRole) {
        return (
            <main className="w-full px-4 py-12 text-foreground">
                <div className="mx-auto max-w-2xl rounded-lg border border-amber-300 bg-amber-50 p-6 dark:border-amber-700 dark:bg-amber-900/30">
                    <h1 className="text-2xl font-bold mb-2">
                        Оформление недоступно для текущей роли
                    </h1>
                    <p className="text-sm text-amber-800 dark:text-amber-200 mb-4">
                        Пользователь с ролью менеджера может работать с заказами и RFQ, но не
                        оформляет покупки. Для покупки используйте аккаунт с ролью buyer/admin или
                        отдельный клиентский профиль.
                    </p>
                    <div className="flex gap-3 flex-wrap">
                        <Link href="/cart">
                            <Button variant="outline">Вернуться в корзину</Button>
                        </Link>
                        <Link href="/account">
                            <Button>Перейти в аккаунт</Button>
                        </Link>
                    </div>
                </div>
            </main>
        );
    }

    const discount = appliedPromo && appliedPromoDiscountPct !== null
        ? calculateDiscount(subtotal, appliedPromoDiscountPct)
        : 0;
    const subtotalAfterDiscount = subtotal - discount;
    const deliveryFee = calcDeliveryFee(deliveryMethod, subtotalAfterDiscount);
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
        ? Math.min(userBonusBalance, eurosToPoints(grandTotal * bonusProgram.maxSpendPercent / 100))
        : 0;
    const maxBonusDiscount = pointsToEuros(maxBonusSpendPoints);
    const bonusDiscount = bonusApplied ? maxBonusDiscount : 0;
    const finalGrandTotal = grandTotal - bonusDiscount;
    const adjustedBonusToEarn = grandTotal > 0 && bonusApplied
        ? Math.round(bonusToEarn * finalGrandTotal / grandTotal)
        : bonusToEarn;

    return (
        <main className="w-full px-4 py-8 text-foreground">
            <h1 className="checkout__title text-3xl font-bold mb-8">{t('checkout.title')}</h1>

            <div className="checkout__layout grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Форма */}
                <form onSubmit={handleSubmit} className="lg:col-span-2 space-y-6">
                    <div className="checkout__section bg-card rounded-lg border border-border p-6">
                        <h2 className="checkout__section-title font-bold text-lg mb-4">
                            {t('checkout.delivery.title')}
                        </h2>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium mb-1 text-foreground">
                                    {t('checkout.firstName')}{' '}
                                    <span className="text-red-600">*</span>
                                </label>
                                <Input
                                    type="text"
                                    name="firstName"
                                    placeholder={t('checkout.firstName')}
                                    value={formData.firstName}
                                    onChange={handleChange}
                                    className={`w-full px-3 py-2 border rounded bg-card text-foreground border-border ${
                                        errors.firstName
                                            ? 'border-red-500 bg-red-50 dark:bg-red-950'
                                            : ''
                                    }`}
                                    aria-required="true"
                                    aria-invalid={!!errors.firstName}
                                />
                                {errors.firstName && (
                                    <p className="text-red-600 text-xs mt-1">{errors.firstName}</p>
                                )}
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1 text-foreground">
                                    {t('checkout.lastName')} <span className="text-red-600">*</span>
                                </label>
                                <Input
                                    type="text"
                                    name="lastName"
                                    placeholder={t('checkout.lastName')}
                                    value={formData.lastName}
                                    onChange={handleChange}
                                    className={`w-full px-3 py-2 border rounded bg-card text-foreground border-border ${
                                        errors.lastName
                                            ? 'border-red-500 bg-red-50 dark:bg-red-950'
                                            : ''
                                    }`}
                                    aria-required="true"
                                    aria-invalid={!!errors.lastName}
                                />
                                {errors.lastName && (
                                    <p className="text-red-600 text-xs mt-1">{errors.lastName}</p>
                                )}
                            </div>
                        </div>

                        <div className="mt-4">
                            <label className="block text-sm font-medium mb-1 text-foreground">
                                {t('checkout.email')} <span className="text-red-600">*</span>
                            </label>
                            <Input
                                type="email"
                                name="email"
                                placeholder={t('checkout.email')}
                                value={formData.email}
                                onChange={handleChange}
                                className={`w-full px-3 py-2 border rounded bg-card text-foreground border-border ${
                                    errors.email ? 'border-red-500 bg-red-50 dark:bg-red-950' : ''
                                }`}
                                aria-required="true"
                                aria-invalid={!!errors.email}
                            />
                            {errors.email && (
                                <p className="text-red-600 text-xs mt-1">{errors.email}</p>
                            )}
                        </div>

                        <div className="mt-4">
                            <label className="block text-sm font-medium mb-1 text-foreground">
                                {t('checkout.phone')} <span className="text-red-600">*</span>
                            </label>
                            <PhoneInput
                                value={formData.phone}
                                onChange={(val) =>
                                    setFormData((prev) => ({ ...prev, phone: val }))
                                }
                                aria-required="true"
                                aria-invalid={!!errors.phone}
                            />
                            {errors.phone && (
                                <p className="text-red-600 text-xs mt-1">{errors.phone}</p>
                            )}
                        </div>

                        <div className="mt-4">
                            <label className="block text-sm font-medium mb-1 text-foreground">
                                {t('checkout.address')} <span className="text-red-600">*</span>
                            </label>
                            <Input
                                type="text"
                                name="address"
                                placeholder={t('checkout.address')}
                                value={formData.address}
                                onChange={handleChange}
                                className={`w-full px-3 py-2 border rounded bg-card text-foreground border-border ${
                                    errors.address ? 'border-red-500 bg-red-50 dark:bg-red-950' : ''
                                }`}
                                aria-required="true"
                                aria-invalid={!!errors.address}
                            />
                            {errors.address && (
                                <p className="text-red-600 text-xs mt-1">{errors.address}</p>
                            )}
                        </div>

                        <div className="grid grid-cols-2 gap-4 mt-4">
                            <div>
                                <label className="block text-sm font-medium mb-1 text-foreground">
                                    {t('checkout.city')} <span className="text-red-600">*</span>
                                </label>
                                <Input
                                    type="text"
                                    name="city"
                                    placeholder={t('checkout.city')}
                                    value={formData.city}
                                    onChange={handleChange}
                                    className={`w-full px-3 py-2 border rounded bg-card text-foreground border-border ${
                                        errors.city
                                            ? 'border-red-500 bg-red-50 dark:bg-red-950'
                                            : ''
                                    }`}
                                    aria-required="true"
                                    aria-invalid={!!errors.city}
                                />
                                {errors.city && (
                                    <p className="text-red-600 text-xs mt-1">{errors.city}</p>
                                )}
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1 text-foreground">
                                    {t('checkout.postalCode')}
                                </label>
                                <Input
                                    type="text"
                                    name="postalCode"
                                    placeholder={t('checkout.postalCode')}
                                    value={formData.postalCode}
                                    onChange={handleChange}
                                    className="w-full px-3 py-2 border rounded bg-card text-foreground border-border"
                                />
                            </div>
                        </div>
                    </div>

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
                            onValueChange={(value) => setDeliveryMethod(value as DeliveryMethod)}
                            className="space-y-3"
                        >
                            {DELIVERY_OPTIONS.map((option) => (
                                <React.Fragment key={option.id}>
                                    <label
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
                                                {calcDeliveryFee(option.id, subtotalAfterDiscount) === 0
                                                    ? t('checkout.delivery.free')
                                                    : formatCurrency(calcDeliveryFee(option.id, subtotalAfterDiscount))}
                                            </div>
                                        </div>
                                    </label>
                                    {option.id === 'pickup' && deliveryMethod === 'pickup' && (
                                        <div className="checkout__pickup-store ml-8">
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
                                                        placeholder={t('checkout.pickup.storePlaceholder')}
                                                    />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {stores.map((store) => {
                                                        const lang = language as 'ru' | 'en' | 'lv';
                                                        return (
                                                            <SelectItem key={store.id} value={store.id}>
                                                                {store.name[lang] ?? store.name.ru} —{' '}
                                                                {store.address[lang] ?? store.address.ru}
                                                            </SelectItem>
                                                        );
                                                    })}
                                                </SelectContent>
                                            </Select>
                                            {errors.pickupStore && (
                                                <p className="text-red-600 text-xs mt-1">
                                                    {errors.pickupStore}
                                                </p>
                                            )}
                                        </div>
                                    )}
                                </React.Fragment>
                            ))}
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
                            className="space-y-3"
                        >
                            {(['card', 'bank', 'cash'] as const).map((method) => (
                                <label
                                    key={method}
                                    className="flex items-center p-3 border rounded cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 border-border"
                                    htmlFor={`payment-${method}`}
                                >
                                    <RadioGroupItem
                                        id={`payment-${method}`}
                                        value={method}
                                        className="mr-3"
                                    />
                                    <span className="font-medium">
                                        {t(`checkout.payment.${method}`)}
                                    </span>
                                </label>
                            ))}
                        </RadioGroup>
                    </div>

                    <div className="flex gap-3">
                        <Button
                            type="submit"
                            className="flex-1"
                            disabled={!wholesaleGuard.isMinimumReached || isSubmitting}
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
                                    <div key={item.lineKey} className="text-sm flex justify-between">
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
                                                (= −{formatCurrency(pointsToEuros(adjustedBonusToEarn))})
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
                                                {t('checkout.bonus.apply')} (−{formatCurrency(maxBonusDiscount)})
                                            </button>
                                        ) : (
                                            <>
                                                <div className="checkout__bonus-applied flex items-center justify-between text-xs">
                                                    <span className="font-medium text-emerald-700 dark:text-emerald-400">
                                                        ✓ {t('checkout.bonus.applied')} −{formatCurrency(maxBonusDiscount)}
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
                                    <span>{t('checkout.summary.discount')}</span>
                                    <span className="font-medium">−{formatCurrency(discount)}</span>
                                </div>
                            )}
                            {bonusDiscount > 0 && (
                                <div className="flex justify-between text-amber-600 dark:text-amber-400">
                                    <span>{t('checkout.summary.bonus')}</span>
                                    <span className="font-medium">−{formatCurrency(bonusDiscount)}</span>
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
