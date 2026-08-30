'use client';

import Link from 'next/link';
import AdminGate from '@/components/admin/AdminGate';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { formatEuro } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

// ─── Constants ────────────────────────────────────────────────────────────────

// ─── Helpers ──────────────────────────────────────────────────────────────────

// ─── Page ─────────────────────────────────────────────────────────────────────

import { useNewOrderPage } from './useNewOrderPage';
import OrderSummary, { type DeliveryOption } from './OrderSummary';
import { OrderFormField as Field, OrderFormSection as Section } from './OrderFormFields';
import OrderProductsSection from './OrderProductsSection';

export default function NewOrderPage(): React.ReactElement {
    const pageState = useNewOrderPage();
    const {
            l,
            locale,
            paymentMethods,
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
            promoInput,
            setPromoInput,
            promoResult,
            setPromoResult,
            promoError,
            promoCodes,
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
            errors,
            emailSuggestions,
            fillCustomer,
            applyPromo,
            removePromo,
            discountFromManual,
            selectCls,
          } = pageState;
    const deliveryOptions: DeliveryOption[] = [
        { value: 'pickup', label: l('Самовывоз', 'Pickup', 'Saņemšana veikalā'), cost: 0 },
        { value: 'courier', label: l('Курьер', 'Courier', 'Kurjers'), cost: 5 },
        { value: 'post', label: l('Почта (Omniva)', 'Parcel terminal (Omniva)', 'Pakomāts (Omniva)'), cost: 4 },
        { value: 'venipak', label: 'Venipak', cost: 3 },
    ];
    return (
        <AdminGate access="partial">
            <main className="w-full py-4">
                <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
                    <div>
                        <h1 className="text-2xl font-bold text-foreground">
                            {l('Создать заказ вручную', 'Create order manually', 'Izveidot pasūtījumu manuāli')}
                        </h1>
                        <p className="text-sm text-muted-foreground mt-1">
                            {l('Заказ создаётся со статусом «Подтверждён» и оплатой', 'The order will be created as “Confirmed” with payment status', 'Pasūtījums tiks izveidots ar statusu “Apstiprināts” un maksājuma statusu')} «{paymentStatus === 'paid' ? l('Оплачен', 'Paid', 'Apmaksāts') : l('Не оплачен', 'Unpaid', 'Nav apmaksāts')}»
                        </p>
                    </div>
                    <Link href="/admin/orders">
                        <Button variant="outline">← {l('Заказы', 'Orders', 'Pasūtījumi')}</Button>
                    </Link>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
                    {/* ── Left: form ── */}
                    <div className="lg:col-span-2 space-y-5">
                        {/* Customer */}
                        <Section title={l('Покупатель', 'Customer', 'Klients')}>
                            <div className="relative" ref={searchRef}>
                                <Field label="Email" required>
                                    <Input
                                        type="email"
                                        value={email}
                                        onChange={(e) => {
                                            setEmail(e.target.value);
                                            setShowEmailList(true);
                                        }}
                                        onFocus={() => setShowEmailList(true)}
                                        placeholder="customer@example.com"
                                    />
                                </Field>
                                {showEmailList && emailSuggestions.length > 0 && (
                                    <div className="absolute z-20 left-0 right-0 top-full mt-1 rounded-lg border border-border bg-card shadow-lg">
                                        {emailSuggestions.map((u) => (
                                            <button
                                                key={u.email}
                                                type="button"
                                                onClick={() => fillCustomer(u)}
                                                className="w-full text-left px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center gap-3"
                                            >
                                                <div>
                                                    <p className="text-sm font-medium text-foreground">
                                                        {u.email}
                                                    </p>
                                                    {u.name && (
                                                        <p className="text-xs text-muted-foreground">
                                                            {u.name}
                                                            {u.phone ? ` · ${u.phone}` : ''}
                                                        </p>
                                                    )}
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <Field label={l('Имя', 'First name', 'Vārds')} required>
                                    <Input
                                        value={firstName}
                                        onChange={(e) => setFirstName(e.target.value)}
                                        placeholder={l('Иван', 'John', 'Jānis')}
                                    />
                                </Field>
                                <Field label={l('Фамилия', 'Last name', 'Uzvārds')}>
                                    <Input
                                        value={lastName}
                                        onChange={(e) => setLastName(e.target.value)}
                                        placeholder={l('Петров', 'Smith', 'Bērziņš')}
                                    />
                                </Field>
                            </div>
                            <Field label={l('Телефон', 'Phone', 'Tālrunis')}>
                                <Input
                                    value={phone}
                                    onChange={(e) => setPhone(e.target.value)}
                                    placeholder="+371 2X XXX XXX"
                                />
                            </Field>
                        </Section>

                        <OrderProductsSection state={pageState} />

                        {/* Discounts */}
                        <Section title={l('Скидки', 'Discounts', 'Atlaides')}>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {/* Promo code */}
                                <div className="space-y-2">
                                    <p className="text-xs font-medium text-muted-foreground">
                                        {l('Промокод', 'Promo code', 'Promokods')}
                                    </p>
                                    {promoResult ? (
                                        <div className="flex items-center gap-2">
                                            <div className="flex-1 rounded-lg border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/20 px-3 py-2 text-sm">
                                                <span className="font-mono font-bold text-emerald-800 dark:text-emerald-300">
                                                    {promoResult.code}
                                                </span>
                                                <span className="text-emerald-600 dark:text-emerald-400 ml-2">
                                                    −{promoResult.discountPct}%
                                                </span>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={removePromo}
                                                className="text-muted-foreground hover:text-red-500 text-xl leading-none"
                                            >
                                                ×
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="flex gap-2">
                                            <Input
                                                value={promoInput}
                                                onChange={(e) =>
                                                    setPromoInput(e.target.value.toUpperCase())
                                                }
                                                onKeyDown={(e) => e.key === 'Enter' && applyPromo()}
                                                placeholder="WELCOME10"
                                                className="font-mono"
                                            />
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={applyPromo}
                                            >
                                                {l('Применить', 'Apply', 'Lietot')}
                                            </Button>
                                        </div>
                                    )}
                                    {promoError && (
                                        <p className="text-xs text-red-600 dark:text-red-400">
                                            {promoError}
                                        </p>
                                    )}

                                    {/* Quick promo list */}
                                    {promoCodes.length > 0 && !promoResult && (
                                        <div className="flex flex-wrap gap-1 mt-1">
                                            {promoCodes
                                                .filter((p) => p.discountPct > 0)
                                                .slice(0, 5)
                                                .map((p) => (
                                                    <button
                                                        key={p.code}
                                                        type="button"
                                                        onClick={() => {
                                                            setPromoInput(p.code);
                                                            setPromoResult(null);
                                                        }}
                                                        className="text-xs rounded-full border border-border px-2 py-0.5 text-muted-foreground hover:border-primary/50 hover:text-primary dark:hover:text-primary/80 transition-colors"
                                                    >
                                                        {p.code} −{p.discountPct}%
                                                    </button>
                                                ))}
                                        </div>
                                    )}
                                </div>

                                {/* Manual discount */}
                                <div className="space-y-2">
                                    <p className="text-xs font-medium text-muted-foreground">
                                        {l('Ручная скидка, %', 'Manual discount, %', 'Manuālā atlaide, %')}
                                        {promoResult && (
                                            <span className="text-muted-foreground ml-1">
                                                {l('(применяется большее из двух)', '(the larger of the two is applied)', '(tiek piemērota lielākā no abām)')}
                                            </span>
                                        )}
                                    </p>
                                    <div className="flex items-center gap-2">
                                        <Input
                                            type="number"
                                            min={0}
                                            max={100}
                                            step={1}
                                            value={manualDiscountPct}
                                            onChange={(e) => setManualDiscountPct(e.target.value)}
                                            placeholder="0"
                                        />
                                        <span className="text-muted-foreground">%</span>
                                    </div>
                                    {discountFromManual > 0 && (
                                        <p className="text-xs text-amber-600 dark:text-amber-400">
                                            −{formatEuro(discountFromManual, locale)}
                                        </p>
                                    )}
                                </div>
                            </div>
                        </Section>

                        {/* Delivery */}
                        <Section title={l('Доставка', 'Delivery', 'Piegāde')}>
                            <div className="flex flex-wrap gap-2">
                                {deliveryOptions.map((opt) => (
                                    <button
                                        key={opt.value}
                                        type="button"
                                        onClick={() => setDeliveryMethod(opt.value)}
                                        className={[
                                            'rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors',
                                            deliveryMethod === opt.value
                                                ? 'border-primary/70 bg-primary/5 text-primary dark:border-primary dark:bg-primary/10 dark:text-primary'
                                                : 'border-border text-muted-foreground hover:border-gray-300',
                                        ].join(' ')}
                                    >
                                        {opt.label}
                                        <span className="ml-1.5 text-xs opacity-70">
                                            {opt.cost === 0 ? l('бесплатно', 'free', 'bez maksas') : `€${opt.cost}`}
                                        </span>
                                    </button>
                                ))}
                            </div>

                            {deliveryMethod !== 'pickup' && (
                                <div className="space-y-3 pt-1">
                                    <Field label={l('Адрес', 'Address', 'Adrese')} required>
                                        <Input
                                            value={address}
                                            onChange={(e) => setAddress(e.target.value)}
                                            placeholder={l('ул. Примерная, д. 10, кв. 5', '10 Example Street, Apt. 5', 'Parauga iela 10–5')}
                                        />
                                    </Field>
                                    <div className="grid grid-cols-2 gap-3">
                                        <Field label={l('Город', 'City', 'Pilsēta')} required>
                                            <Input
                                                value={city}
                                                onChange={(e) => setCity(e.target.value)}
                                                placeholder={l('Рига', 'Riga', 'Rīga')}
                                            />
                                        </Field>
                                        <Field label={l('Индекс', 'Postal code', 'Pasta indekss')}>
                                            <Input
                                                value={postalCode}
                                                onChange={(e) => setPostalCode(e.target.value)}
                                                placeholder="LV-1001"
                                            />
                                        </Field>
                                    </div>
                                </div>
                            )}
                        </Section>

                        {/* Payment */}
                        <Section title={l('Оплата', 'Payment', 'Apmaksa')}>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <Field label={l('Способ оплаты', 'Payment method', 'Apmaksas veids')}>
                                    <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                                        <SelectTrigger className={selectCls}>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {paymentMethods.map((m) => (
                                                <SelectItem key={m} value={m}>
                                                    {m}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </Field>
                                <Field label={l('Статус оплаты', 'Payment status', 'Maksājuma statuss')}>
                                    <Select
                                        value={paymentStatus}
                                        onValueChange={(v) =>
                                            setPaymentStatus(v as 'unpaid' | 'paid')
                                        }
                                    >
                                        <SelectTrigger className={selectCls}>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="unpaid">{l('Не оплачен', 'Unpaid', 'Nav apmaksāts')}</SelectItem>
                                            <SelectItem value="paid">{l('Оплачен', 'Paid', 'Apmaksāts')}</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </Field>
                            </div>
                        </Section>

                        {/* Notes */}
                        <Section title={l('Заметка менеджера', 'Manager note', 'Vadītāja piezīme')}>
                            <Textarea
                                rows={3}
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                placeholder={l('Внутренний комментарий (клиент не видит)...', 'Internal comment (hidden from customer)...', 'Iekšējs komentārs (klients neredz)...')}
                                className="w-full resize-none text-sm"
                            />
                        </Section>

                        {/* Errors */}
                        {errors.length > 0 && (
                            <div className="rounded-xl border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/10 px-4 py-3 space-y-1">
                                {errors.map((e, i) => (
                                    <p key={i} className="text-sm text-red-700 dark:text-red-300">
                                        · {e}
                                    </p>
                                ))}
                            </div>
                        )}
                    </div>

                    <OrderSummary state={pageState} deliveryOptions={deliveryOptions} />
                </div>
            </main>
        </AdminGate>
    );
}
