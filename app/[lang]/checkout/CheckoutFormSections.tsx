'use client'

import type { ChangeEvent, Dispatch, JSX, SetStateAction } from 'react'
import Link from 'next/link'
import { Info } from 'lucide-react'
import { Input } from '@/components/ui/input'
import PhoneInput from '@/components/ui/phone-input'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { stores } from '@/data/stores'
import type { DeliveryMethod } from '@/lib/orders-store'
import { calcDeliveryFee } from '@/lib/delivery'

export type CheckoutFormData = {
  firstName: string
  lastName: string
  email: string
  phone: string
  address: string
  city: string
  postalCode: string
  paymentMethod: string
}

type Translate = (key: string, defaultValue?: string) => string
type Errors = Record<string, string>

type CustomerDetailsSectionProps = {
  formData: CheckoutFormData
  setFormData: Dispatch<SetStateAction<CheckoutFormData>>
  errors: Errors
  onChange: (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void
  t: Translate
  showPrefillHint?: boolean
}

function FieldError({ id, message }: { id: string; message?: string }): JSX.Element | null {
  return message ? <p id={id} role="alert" className="checkout__field-error mt-1 text-xs text-red-600">{message}</p> : null
}

function PrefillHint({ t }: { t: Translate }): JSX.Element {
  return (
    <p className="checkout__prefill-hint mb-4 flex items-start gap-2 rounded-lg border border-primary/10 bg-primary/5 dark:border-primary/40 dark:bg-primary/15 p-3 text-sm text-primary/90 dark:text-primary/80">
      <Info className="w-4 h-4 shrink-0 mt-0.5" />
      {t('checkout.prefill.hint')}
    </p>
  )
}

export function CustomerDetailsSection({ formData, setFormData, errors, onChange, t, showPrefillHint }: CustomerDetailsSectionProps): JSX.Element {
  const fieldClass = (hasError: boolean): string =>
    `checkout__input w-full border-border bg-card text-foreground ${hasError ? 'border-red-500 bg-red-50 dark:bg-red-950' : ''}`

  return (
    <section className="checkout__section rounded-lg border border-border bg-card p-6">
      <h2 className="checkout__section-title mb-4 text-lg font-bold">{t('checkout.delivery.title')}</h2>
      {showPrefillHint && <PrefillHint t={t} />}
      <div className="checkout__field-grid grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="checkout__field">
          <label htmlFor="checkout-first-name" className="checkout__label mb-1 block text-sm font-medium text-foreground">{t('checkout.firstName')} <span className="text-red-600">*</span></label>
          <Input id="checkout-first-name" name="firstName" value={formData.firstName} onChange={onChange} placeholder={t('checkout.firstName')} className={fieldClass(!!errors.firstName)} aria-required="true" aria-invalid={!!errors.firstName} aria-describedby={errors.firstName ? 'checkout-first-name-error' : undefined} />
          <FieldError id="checkout-first-name-error" message={errors.firstName} />
        </div>
        <div className="checkout__field">
          <label htmlFor="checkout-last-name" className="checkout__label mb-1 block text-sm font-medium text-foreground">{t('checkout.lastName')} <span className="text-red-600">*</span></label>
          <Input id="checkout-last-name" name="lastName" value={formData.lastName} onChange={onChange} placeholder={t('checkout.lastName')} className={fieldClass(!!errors.lastName)} aria-required="true" aria-invalid={!!errors.lastName} aria-describedby={errors.lastName ? 'checkout-last-name-error' : undefined} />
          <FieldError id="checkout-last-name-error" message={errors.lastName} />
        </div>
      </div>
      <div className="checkout__field-grid mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="checkout__field">
          <label htmlFor="checkout-email" className="checkout__label mb-1 block text-sm font-medium text-foreground">{t('checkout.email')} <span className="text-red-600">*</span></label>
          <Input id="checkout-email" type="email" name="email" value={formData.email} onChange={onChange} placeholder={t('checkout.email')} className={fieldClass(!!errors.email)} aria-required="true" aria-invalid={!!errors.email} aria-describedby={errors.email ? 'checkout-email-error' : undefined} />
          <FieldError id="checkout-email-error" message={errors.email} />
        </div>
        <div className="checkout__field">
          <label className="checkout__label mb-1 block text-sm font-medium text-foreground">{t('checkout.phone')} <span className="text-red-600">*</span></label>
          <PhoneInput value={formData.phone} onChange={(phone) => setFormData((previous) => ({ ...previous, phone }))} aria-required="true" aria-invalid={!!errors.phone} />
          <FieldError id="checkout-phone-error" message={errors.phone} />
        </div>
      </div>
      <div className="checkout__field-grid mt-4 grid grid-cols-1 gap-4 sm:grid-cols-[2fr_1fr_1fr]">
        <div className="checkout__field">
          <label htmlFor="checkout-address" className="checkout__label mb-1 block text-sm font-medium text-foreground">{t('checkout.address')} <span className="text-red-600">*</span></label>
          <Input id="checkout-address" name="address" value={formData.address} onChange={onChange} placeholder={t('checkout.address')} className={fieldClass(!!errors.address)} aria-required="true" aria-invalid={!!errors.address} aria-describedby={errors.address ? 'checkout-address-error' : undefined} />
          <FieldError id="checkout-address-error" message={errors.address} />
        </div>
        <div className="checkout__field">
          <label htmlFor="checkout-city" className="checkout__label mb-1 block text-sm font-medium text-foreground">{t('checkout.city')} <span className="text-red-600">*</span></label>
          <Input id="checkout-city" name="city" value={formData.city} onChange={onChange} placeholder={t('checkout.city')} className={fieldClass(!!errors.city)} aria-required="true" aria-invalid={!!errors.city} aria-describedby={errors.city ? 'checkout-city-error' : undefined} />
          <FieldError id="checkout-city-error" message={errors.city} />
        </div>
        <div className="checkout__field">
          <label htmlFor="checkout-postal-code" className="checkout__label mb-1 block text-sm font-medium text-foreground">{t('checkout.postalCode')}</label>
          <Input id="checkout-postal-code" name="postalCode" value={formData.postalCode} onChange={onChange} placeholder={t('checkout.postalCode')} className={fieldClass(false)} />
        </div>
      </div>
    </section>
  )
}

const DELIVERY_OPTIONS: Array<{ id: DeliveryMethod; labelKey: string }> = [
  { id: 'courier', labelKey: 'checkout.delivery.courier' },
  { id: 'pickup', labelKey: 'checkout.delivery.pickup' },
  { id: 'post', labelKey: 'checkout.delivery.omniva' },
]

type DeliverySectionProps = {
  deliveryMethod: DeliveryMethod
  setDeliveryMethod: (method: DeliveryMethod) => void
  pickupStoreId: string
  setPickupStoreId: (id: string) => void
  subtotalAfterDiscount: number
  errors: Errors
  clearPickupError: () => void
  formatCurrency: (value: number) => string
  t: Translate
}

export function DeliverySection(props: DeliverySectionProps): JSX.Element {
  const { deliveryMethod, setDeliveryMethod, pickupStoreId, setPickupStoreId, subtotalAfterDiscount, errors, clearPickupError, formatCurrency, t } = props
  return (
    <section className="checkout__section rounded-lg border border-border bg-card p-6">
      <div className="checkout__section-header mb-4 flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="checkout__section-title text-lg font-bold">{t('checkout.delivery.method')}</h2>
        <Link href="/delivery-payment" target="_blank" className="checkout__section-info text-sm text-primary underline hover:no-underline">{t('checkout.delivery.moreInfo')}</Link>
      </div>
      <RadioGroup value={deliveryMethod} onValueChange={(value) => setDeliveryMethod(value as DeliveryMethod)} className="checkout__options space-y-3">
        {DELIVERY_OPTIONS.map((option) => (
          <div key={option.id} className="checkout__option-group">
            <label className="checkout__option flex cursor-pointer items-center rounded border border-border p-3 hover:bg-gray-50 dark:hover:bg-gray-800" htmlFor={`delivery-${option.id}`}>
              <RadioGroupItem id={`delivery-${option.id}`} value={option.id} className="mr-3" />
              <span className="checkout__option-content flex-1">
                <span className="checkout__option-title block font-medium">{t(option.labelKey)}</span>
                <span className="checkout__option-caption block text-sm text-muted-foreground">{calcDeliveryFee(option.id, subtotalAfterDiscount) === 0 ? t('checkout.delivery.free') : formatCurrency(calcDeliveryFee(option.id, subtotalAfterDiscount))}</span>
              </span>
            </label>
            {option.id === 'pickup' && deliveryMethod === 'pickup' && (
              <div className="checkout__pickup-store ml-8 mt-3">
                <label className="checkout__label mb-1 block text-sm font-medium text-foreground" htmlFor="pickup-store">{t('checkout.pickup.chooseStore')} <span className="text-red-600">*</span></label>
                <Select value={pickupStoreId || undefined} onValueChange={(value) => { setPickupStoreId(value); clearPickupError() }}>
                  <SelectTrigger id="pickup-store" className={`checkout__select w-full ${errors.pickupStore ? 'border-red-500' : 'border-border'}`} aria-invalid={!!errors.pickupStore}><SelectValue placeholder={t('checkout.pickup.storePlaceholder')} /></SelectTrigger>
                  <SelectContent>{stores.map((store) => <SelectItem key={store.id} value={store.id}>{t(`stores.${store.id}.name`)} — {store.address.lv}</SelectItem>)}</SelectContent>
                </Select>
                <FieldError id="checkout-pickup-store-error" message={errors.pickupStore} />
              </div>
            )}
          </div>
        ))}
      </RadioGroup>
    </section>
  )
}

type PaymentSectionProps = {
  paymentMethod: string
  setPaymentMethod: (method: string) => void
  cashUnavailable: boolean
  t: Translate
}

export function PaymentSection({ paymentMethod, setPaymentMethod, cashUnavailable, t }: PaymentSectionProps): JSX.Element {
  return (
    <section className="checkout__section rounded-lg border border-border bg-card p-6">
      <div className="checkout__section-header mb-4 flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="checkout__section-title text-lg font-bold">{t('checkout.payment.title')}</h2>
        <Link href="/delivery-payment" target="_blank" className="checkout__section-info text-sm text-primary underline hover:no-underline">{t('checkout.payment.moreInfo')}</Link>
      </div>
      <RadioGroup value={paymentMethod} onValueChange={setPaymentMethod} className="checkout__options space-y-3">
        {(['card', 'bank', 'cash'] as const).map((method) => {
          const disabled = method === 'cash' && cashUnavailable
          return (
            <label key={method} className={`checkout__option flex items-center rounded border border-border p-3 ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800'}`} htmlFor={`payment-${method}`}>
              <RadioGroupItem id={`payment-${method}`} value={method} className="mr-3" disabled={disabled} />
              <span className="checkout__option-content flex-1"><span className="checkout__option-title block font-medium">{t(`checkout.payment.${method}`)}</span>{method === 'cash' && <span className="checkout__option-caption block text-sm text-muted-foreground">{t('checkout.payment.cashNote')}</span>}</span>
            </label>
          )
        })}
      </RadioGroup>
    </section>
  )
}
