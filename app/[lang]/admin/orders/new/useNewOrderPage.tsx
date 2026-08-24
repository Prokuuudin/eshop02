'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { type DeliveryMethod } from '@/lib/orders-store';
import { formatEuro } from '@/lib/utils';
import { reportAdminError, reportAdminPartial } from '@/lib/admin-ui-errors';
import { useAdminLocale } from '@/lib/use-admin-locale';

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

const DELIVERY_COSTS: Record<DeliveryMethod, number> = { pickup: 0, courier: 5, post: 4, venipak: 3 };

// ─── Page ─────────────────────────────────────────────────────────────────────

function useNewOrderPageState() {
    const router = useRouter();
    const { locale, l } = useAdminLocale();
    const paymentMethods = [
        l('Счёт (invoice)', 'Invoice', 'Rēķins'), l('Наличные', 'Cash', 'Skaidra nauda'),
        l('Карта (терминал)', 'Card terminal', 'Karšu terminālis'), l('Перевод', 'Bank transfer', 'Bankas pārskaitījums'),
    ];

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
    const [paymentMethod, setPaymentMethod] = useState(paymentMethods[0]);
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
            .catch((error) => reportAdminError(error, l('Каталог для нового заказа', 'New order catalog', 'Jauna pasūtījuma katalogs')));

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
            .catch(() => reportAdminPartial(l('Заказ можно создать, но проверка промокодов временно недоступна.', 'The order can be created, but promo code validation is temporarily unavailable.', 'Pasūtījumu var izveidot, bet promokodu pārbaude pašlaik nav pieejama.'), l('Новый заказ', 'New order', 'Jauns pasūtījums')));
    }, [l]);

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
            setPromoError(l('Промокод не найден', 'Promo code not found', 'Promokods nav atrasts'));
            setPromoResult(null);
            return;
        }
        if (subtotal < found.minOrder) {
            setPromoError(l(`Мин. сумма заказа: ${formatEuro(found.minOrder, locale)}`, `Minimum order: ${formatEuro(found.minOrder, locale)}`, `Minimālā pasūtījuma summa: ${formatEuro(found.minOrder, locale)}`));
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

    const deliveryCost = DELIVERY_COSTS[deliveryMethod] ?? 0;

    const total = Math.max(0, subtotal - discount + deliveryCost);

    // ── Validation ────────────────────────────────────────────────────────────

    const validate = (): string[] => {
        const errs: string[] = [];
        if (!email.trim()) errs.push(l('Email покупателя обязателен', 'Customer email is required', 'Klienta e-pasts ir obligāts'));
        if (!firstName.trim()) errs.push(l('Имя покупателя обязательно', 'Customer first name is required', 'Klienta vārds ir obligāts'));
        if (items.length === 0) errs.push(l('Добавьте хотя бы один товар', 'Add at least one product', 'Pievienojiet vismaz vienu preci'));
        if (deliveryMethod !== 'pickup' && !address.trim()) errs.push(l('Укажите адрес доставки', 'Enter a delivery address', 'Norādiet piegādes adresi'));
        if (deliveryMethod !== 'pickup' && !city.trim()) errs.push(l('Укажите город', 'Enter a city', 'Norādiet pilsētu'));
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
                    setErrors([l(`Недостаточно остатка для: ${(body.items ?? []).join(', ')}`, `Insufficient stock for: ${(body.items ?? []).join(', ')}`, `Nepietiekams atlikums: ${(body.items ?? []).join(', ')}`)]);
                } else if (body?.error === 'invalid_items') {
                    setErrors([l('Некоторые товары больше недоступны — обновите список и попробуйте снова', 'Some products are no longer available — refresh the list and try again', 'Dažas preces vairs nav pieejamas — atjauniniet sarakstu un mēģiniet vēlreiz')]);
                } else if (body?.error === 'promo_code_usage_limit') {
                    setErrors([l('Лимит использования промокода исчерпан', 'Promo code usage limit reached', 'Promokoda izmantošanas limits ir sasniegts')]);
                } else if (res.status === 403) {
                    setErrors([l('Недостаточно прав для создания заказа', 'Insufficient permission to create an order', 'Nepietiek tiesību pasūtījuma izveidei')]);
                } else {
                    setErrors([l('Не удалось создать заказ. Попробуйте ещё раз.', 'Failed to create the order. Try again.', 'Neizdevās izveidot pasūtījumu. Mēģiniet vēlreiz.')]);
                }
                return;
            }

            const data = (await res.json()) as { order: { id: string }; warning?: string };
            if (data.warning) {
                reportAdminPartial(
                    l('Заказ создан, но статус/заметка могли не сохраниться — проверьте вручную.', 'The order was created, but its status or note may not have been saved — check manually.', 'Pasūtījums ir izveidots, bet statuss vai piezīme, iespējams, netika saglabāta — pārbaudiet manuāli.'),
                    l('Новый заказ', 'New order', 'Jauns pasūtījums')
                );
            }
            router.push('/admin/orders');
        } catch (error) {
            reportAdminError(error, l('Создание заказа', 'Order creation', 'Pasūtījuma izveide'));
            setErrors([l('Ошибка сети — заказ не создан. Проверьте соединение и попробуйте снова.', 'Network error — the order was not created. Check your connection and try again.', 'Tīkla kļūda — pasūtījums netika izveidots. Pārbaudiet savienojumu un mēģiniet vēlreiz.')]);
        } finally {
            setSubmitting(false);
        }
    };

    // ─── Render ───────────────────────────────────────────────────────────────

    const inputCls =
        'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary';
    const selectCls = inputCls;

    return {
        l,
        locale,
        paymentMethods,
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
