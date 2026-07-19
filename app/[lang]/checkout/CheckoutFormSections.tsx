'use client'

import type { ChangeEvent, Dispatch, SetStateAction } from 'react'
import Link from 'next/link'
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
}

function FieldError({ message }: { message?: string }): JSX.Element | null {
  return message ? <p className="checkout__field-error mt-1 text-xs text-red-600">{message}</p> : null
}

export function CustomerDetailsSection({ formData, setFormData, errors, onChange, t }: CustomerDetailsSectionProps): JSX.Element {
  const fieldClass = (hasError: boolean): string =>
    `checkout__input w-full border-border bg-card text-foreground ${hasError ? 'border-red-500 bg-red-50 dark:bg-red-950' : ''}`

  return (
    <section className="checkout__section rounded-lg border border-border bg-card p-6">
      <h2 className="checkout__section-title mb-4 text-lg font-bold">{t('checkout.delivery.title')}</h2>
      <div className="checkout__field-grid grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="checkout__field">
          <label className="checkout__label mb-1 block text-sm font-medium text-foreground">{t('checkout.firstName')} <span className="text-red-600">*</span></label>
          <Input name="firstName" value={formData.firstName} onChange={onChange} placeholder={t('checkout.firstName')} className={fieldClass(!!errors.firstName)} aria-required="true" aria-invalid={!!errors.firstName} />
          <FieldError message={errors.firstName} />
        </div>
        <div className="checkout__field">
          <label className="checkout__label mb-1 block text-sm font-medium text-foreground">{t('checkout.lastName')} <span className="text-red-600">*</span></label>
          <Input name="lastName" value={formData.lastName} onChange={onChange} placeholder={t('checkout.lastName')} className={fieldClass(!!errors.lastName)} aria-required="true" aria-invalid={!!errors.lastName} />
          <FieldError message={errors.lastName} />
        </div>
      </div>
      <div className="checkout__field mt-4">
        <label className="checkout__label mb-1 block text-sm font-medium text-foreground">{t('checkout.email')} <span className="text-red-600">*</span></label>
        <Input type="email" name="email" value={formData.email} onChange={onChange} placeholder={t('checkout.email')} className={fieldClass(!!errors.email)} aria-required="true" aria-invalid={!!errors.email} />
        <FieldError message={errors.email} />
      </div>
      <div className="checkout__field mt-4">
        <label className="checkout__label mb-1 block text-sm font-medium text-foreground">{t('checkout.phone')} <span className="text-red-600">*</span></label>
        <PhoneInput value={formData.phone} onChange={(phone) => setFormData((previous) => ({ ...previous, phone }))} aria-required="true" aria-invalid={!!errors.phone} />
        <FieldError message={errors.phone} />
      </div>
      <div className="checkout__field mt-4">
        <label className="checkout__label mb-1 block text-sm font-medium text-foreground">{t('checkout.address')} <span className="text-red-600">*</span></label>
        <Input name="address" value={formData.address} onChange={onChange} placeholder={t('checkout.address')} className={fieldClass(!!errors.address)} aria-required="true" aria-invalid={!!errors.address} />
        <FieldError message={errors.address} />
      </div>
      <div className="checkout__field-grid mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="checkout__field">
          <label className="checkout__label mb-1 block text-sm font-medium text-foreground">{t('checkout.city')} <span className="text-red-600">*</span></label>
          <Input name="city" value={formData.city} onChange={onChange} placeholder={t('checkout.city')} className={fieldClass(!!errors.city)} aria-required="true" aria-invalid={!!errors.city} />
          <FieldError message={errors.city} />
        </div>
        <div className="checkout__field">
          <label className="checkout__label mb-1 block text-sm font-medium text-foreground">{t('checkout.postalCode')}</label>
          <Input name="postalCode" value={formData.postalCode} onChange={onChange} placeholder={t('checkout.postalCode')} className={fieldClass(false)} />
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
  language: 'ru' | 'en' | 'lv'
  formatCurrency: (value: number) => string
  t: Translate
}

export function DeliverySection(props: DeliverySectionProps): JSX.Element {
  const { deliveryMethod, setDeliveryMethod, pickupStoreId, setPickupStoreId, subtotalAfterDiscount, errors, clearPickupError, language, formatCurrency, t } = props
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
                  <SelectContent>{stores.map((store) => <SelectItem key={store.id} value={store.id}>{store.name[language] ?? store.name.ru} — {store.address.lv}</SelectItem>)}</SelectContent>
                </Select>
                <FieldError message={errors.pickupStore} />
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
