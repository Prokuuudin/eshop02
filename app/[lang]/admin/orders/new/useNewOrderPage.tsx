'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { type DeliveryMethod } from '@/lib/orders-store';
import { formatEuro } from '@/lib/utils';
import { reportAdminError, reportAdminPartial } from '@/lib/admin-ui-errors';

// ─── Types ────────────────────────────────────────────────────────────────────

type CatalogProduct = {
    id: string;
    title: string;
    brand: string;
    category: string;
    price: number;
    stock: number;
    sku?: string;
    image?: string;
};

type LineItem = {
    product: CatalogProduct;
    quantity: number;
    unitPrice: number; // may be overridden
};

type PromoResult = {
    code: string;
    discountPct: number;
    minOrder: number;
};

type CustomerSuggestion = {
    id: string;
    email: string;
    name?: string | null;
    phone?: string | null;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const DELIVERY_OPTIONS: { value: DeliveryMethod; label: string; cost: number }[] = [
    { value: 'pickup', label: 'Самовывоз', cost: 0 },
    { value: 'courier', label: 'Курьер', cost: 5 },
    { value: 'post', label: 'Почта', cost: 3 },
];

const PAYMENT_METHODS = ['Счёт (invoice)', 'Наличные', 'Карта (терминал)', 'Перевод', 'Stripe'];

const LOC = 'ru-RU';

// ─── Page ─────────────────────────────────────────────────────────────────────

function useNewOrderPageState() {
    const router = useRouter();

    // ── Catalog
    const [catalog, setCatalog] = useState<CatalogProduct[]>([]);
    const [productSearch, setProductSearch] = useState('');
    const [showDropdown, setShowDropdown] = useState(false);
    const searchRef = useRef<HTMLDivElement>(null);

    // ── Customer
    const [email, setEmail] = useState('');
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [phone, setPhone] = useState('');
    const [showEmailList, setShowEmailList] = useState(false);
    const [customerSuggestions, setCustomerSuggestions] = useState<CustomerSuggestion[]>([]);

    // ── Items
    const [items, setItems] = useState<LineItem[]>([]);

    // ── Pricing
    const [promoInput, setPromoInput] = useState('');
    const [promoResult, setPromoResult] = useState<PromoResult | null>(null);
    const [promoError, setPromoError] = useState('');
    const [promoCodes, setPromoCodes] = useState<PromoResult[]>([]);
    const [manualDiscountPct, setManualDiscountPct] = useState('');

    // ── Delivery
    const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>('pickup');
    const [address, setAddress] = useState('');
    const [city, setCity] = useState('');
    const [postalCode, setPostalCode] = useState('');

    // ── Payment
    const [paymentMethod, setPaymentMethod] = useState(PAYMENT_METHODS[0]);
    const [paymentStatus, setPaymentStatus] = useState<'unpaid' | 'paid'>('unpaid');

    // ── Notes
    const [notes, setNotes] = useState('');

    // ── Submit
    const [submitting, setSubmitting] = useState(false);
    const [errors, setErrors] = useState<string[]>([]);

    // ── Load catalog + promo codes ────────────────────────────────────────────

    useEffect(() => {
        fetch('/api/admin/products')
            .then((r) => r.json())
            .then((d: { data?: { products?: CatalogProduct[] } }) =>
                setCatalog(d.data?.products ?? [])
            )
            .catch((error) => reportAdminError(error, 'Каталог для нового заказа'));

        fetch('/api/admin/promo-codes')
            .then((r) => r.json())
            .then((d: unknown) => {
                if (Array.isArray(d)) {
                    setPromoCodes(
                        d.map((p: Record<string, unknown>) => ({
                            code: String(p.code ?? ''),
                            discountPct: Number(p.discount ?? 0),
                            minOrder: Number(p.minOrder ?? 0),
                        }))
                    );
                }
            })
            .catch(() => reportAdminPartial('Заказ можно создать, но проверка промокодов временно недоступна.', 'Новый заказ'));
    }, []);

    // ── Customer lookup ───────────────────────────────────────────────────────

    useEffect(() => {
        const query = email.trim();
        const controller = new AbortController();
        const timer = window.setTimeout(() => {
            if (!query) {
                setCustomerSuggestions([]);
                return;
            }
            fetch(`/api/admin/users?search=${encodeURIComponent(query)}&take=5`, { cache: 'no-store', signal: controller.signal })
                .then((response) => response.ok ? response.json() : null)
                .then((payload: { users?: CustomerSuggestion[] } | null) => setCustomerSuggestions(payload?.users ?? []))
                .catch(() => { if (!controller.signal.aborted) setCustomerSuggestions([]); });
        }, query ? 200 : 0);
        return () => {
            window.clearTimeout(timer);
            controller.abort();
        };
    }, [email]);

    const emailSuggestions = customerSuggestions;

    const fillCustomer = (user: CustomerSuggestion) => {
        setEmail(user.email);
        const parts = (user.name ?? '').split(' ');
        setFirstName(parts[0] ?? '');
        setLastName(parts.slice(1).join(' '));
        setPhone(user.phone ?? '');
        setShowEmailList(false);
    };

    // ── Product search ────────────────────────────────────────────────────────

    const productResults = useMemo(() => {
        const q = productSearch.toLowerCase().trim();
        if (!q || q.length < 1) return [];
        return catalog
            .filter(
                (p) =>
                    p.title.toLowerCase().includes(q) ||
                    p.brand.toLowerCase().includes(q) ||
                    (p.sku ?? '').toLowerCase().includes(q)
            )
            .slice(0, 12);
    }, [catalog, productSearch]);

    const addProduct = (p: CatalogProduct) => {
        setItems((prev) => {
            const existing = prev.find((i) => i.product.id === p.id);
            if (existing) {
                return prev.map((i) =>
                    i.product.id === p.id ? { ...i, quantity: i.quantity + 1 } : i
                );
            }
            return [...prev, { product: p, quantity: 1, unitPrice: p.price }];
        });
        setProductSearch('');
        setShowDropdown(false);
    };

    const removeItem = (id: string) => setItems((prev) => prev.filter((i) => i.product.id !== id));

    const updateQty = (id: string, qty: number) => {
        if (qty <= 0) {
            removeItem(id);
            return;
        }
        setItems((prev) => prev.map((i) => (i.product.id === id ? { ...i, quantity: qty } : i)));
    };

    const updateUnitPrice = (id: string, price: number) => {
        if (!Number.isFinite(price) || price < 0) return;
        setItems((prev) => prev.map((i) => (i.product.id === id ? { ...i, unitPrice: price } : i)));
    };

    // ── Promo code ────────────────────────────────────────────────────────────

    const applyPromo = () => {
        const code = promoInput.trim().toUpperCase();
        if (!code) return;
        const found = promoCodes.find((p) => p.code.toUpperCase() === code);
        if (!found) {
            setPromoError('Промокод не найден');
            setPromoResult(null);
            return;
        }
        if (subtotal < found.minOrder) {
            setPromoError(`Мин. сумма заказа: ${formatEuro(found.minOrder, LOC)}`);
            setPromoResult(null);
            return;
        }
        setPromoResult(found);
        setPromoError('');
    };

    const removePromo = () => {
        setPromoResult(null);
        setPromoInput('');
        setPromoError('');
    };

    // ── Calculations ──────────────────────────────────────────────────────────

    const subtotal = items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);

    const discountFromPromo = promoResult
        ? Math.round(((subtotal * promoResult.discountPct) / 100) * 100) / 100
        : 0;

    const discountFromManual = (() => {
        const pct = parseFloat(manualDiscountPct);
        if (!Number.isFinite(pct) || pct <= 0) return 0;
        return Math.round(((subtotal * Math.min(pct, 100)) / 100) * 100) / 100;
    })();

    const discount = Math.max(discountFromPromo, discountFromManual);

    const deliveryCost = DELIVERY_OPTIONS.find((d) => d.value === deliveryMethod)?.cost ?? 0;

    const total = Math.max(0, subtotal - discount + deliveryCost);

    // ── Validation ────────────────────────────────────────────────────────────

    const validate = (): string[] => {
        const errs: string[] = [];
        if (!email.trim()) errs.push('Email покупателя обязателен');
        if (!firstName.trim()) errs.push('Имя покупателя обязательно');
        if (items.length === 0) errs.push('Добавьте хотя бы один товар');
        if (deliveryMethod !== 'pickup' && !address.trim()) errs.push('Укажите адрес доставки');
        if (deliveryMethod !== 'pickup' && !city.trim()) errs.push('Укажите город');
        return errs;
    };

    // ── Submit ────────────────────────────────────────────────────────────────

    const handleSubmit = async () => {
        const errs = validate();
        if (errs.length) {
            setErrors(errs);
            return;
        }
        setErrors([]);
        setSubmitting(true);

        try {
            const res = await fetch('/api/admin/orders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: email.trim(),
                    firstName: firstName.trim(),
                    lastName: lastName.trim(),
                    phone: phone.trim(),
                    items: items.map((i) => ({
                        id: i.product.id,
                        quantity: i.quantity,
                        unitPrice: i.unitPrice,
                    })),
                    deliveryMethod,
                    address: address.trim(),
                    city: city.trim(),
                    postalCode: postalCode.trim() || undefined,
                    paymentMethod,
                    paymentStatus,
                    promoCode: promoResult?.code,
                    discount,
                    notes: notes.trim() || undefined,
                }),
            });

            if (!res.ok) {
                const body = (await res.json().catch(() => null)) as
                    | { error?: string; items?: string[] }
                    | null;
                if (body?.error === 'insufficient_stock') {
                    setErrors([`Недостаточно остатка для: ${(body.items ?? []).join(', ')}`]);
                } else if (body?.error === 'invalid_items') {
                    setErrors(['Некоторые товары больше недоступны — обновите список и попробуйте снова']);
                } else if (body?.error === 'promo_code_usage_limit') {
                    setErrors(['Лимит использования промокода исчерпан']);
                } else if (res.status === 403) {
                    setErrors(['Недостаточно прав для создания заказа']);
                } else {
                    setErrors(['Не удалось создать заказ. Попробуйте ещё раз.']);
                }
                return;
            }

            const data = (await res.json()) as { order: { id: string }; warning?: string };
            if (data.warning) {
                reportAdminPartial(
                    'Заказ создан, но статус/заметка могли не сохраниться — проверьте вручную.',
                    'Новый заказ'
                );
            }
            router.push('/admin/orders');
        } catch (error) {
            reportAdminError(error, 'Создание заказа');
            setErrors(['Ошибка сети — заказ не создан. Проверьте соединение и попробуйте снова.']);
        } finally {
            setSubmitting(false);
        }
    };

    // ─── Render ───────────────────────────────────────────────────────────────

    const inputCls =
        'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary';
    const selectCls = inputCls;

    return {
        router,
        catalog,
        setCatalog,
        productSearch,
        setProductSearch,
        showDropdown,
        setShowDropdown,
        searchRef,
        email,
        setEmail,
        firstName,
        setFirstName,
        lastName,
        setLastName,
        phone,
        setPhone,
        showEmailList,
        setShowEmailList,
        items,
        setItems,
        promoInput,
        setPromoInput,
        promoResult,
        setPromoResult,
        promoError,
        setPromoError,
        promoCodes,
        setPromoCodes,
        manualDiscountPct,
        setManualDiscountPct,
        deliveryMethod,
        setDeliveryMethod,
        address,
        setAddress,
        city,
        setCity,
        postalCode,
        setPostalCode,
        paymentMethod,
        setPaymentMethod,
        paymentStatus,
        setPaymentStatus,
        notes,
        setNotes,
        submitting,
        setSubmitting,
        errors,
        setErrors,
        emailSuggestions,
        fillCustomer,
        productResults,
        addProduct,
        removeItem,
        updateQty,
        updateUnitPrice,
        applyPromo,
        removePromo,
        subtotal,
        discountFromPromo,
        discountFromManual,
        discount,
        deliveryCost,
        total,
        validate,
        handleSubmit,
        inputCls,
        selectCls,
    };
}

export function useNewOrderPage(): ReturnType<typeof useNewOrderPageState> {
  return useNewOrderPageState()
}
