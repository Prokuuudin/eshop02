'use client'

import type { ChangeEvent, Dispatch, JSX, SetStateAction } from 'react'
import { Info } from 'lucide-react'
import { Input } from '@/components/ui/input'
import PhoneInput from '@/components/ui/phone-input'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'

export type CustomerType = 'individual' | 'company'

export type CheckoutFormData = {
  customerType: CustomerType
  personalCode: string
  companyName: string
  regNumber: string
  vatNumber: string
  legalAddress: string
  bankName: string
  iban: string
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
    <span className="checkout__prefill-hint ml-auto flex max-w-md items-start gap-1.5 rounded-lg bg-muted p-2 text-xs font-normal text-muted-foreground">
      <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
      <span>{t('checkout.prefill.hint')}</span>
    </span>
  )
}

export function CustomerDetailsSection({ formData, setFormData, errors, onChange, t, showPrefillHint }: CustomerDetailsSectionProps): JSX.Element {
  const fieldClass = (hasError: boolean): string =>
    `checkout__input w-full border-border bg-card text-foreground ${hasError ? 'border-red-500 bg-red-50 dark:bg-red-950' : ''}`

  return (
    <section className="checkout__section rounded-lg border border-border bg-card p-6">
      <div className="checkout__section-header mb-4 flex items-start gap-2">
        <h2 className="checkout__section-title shrink-0 text-lg font-bold">{t('checkout.delivery.title')}</h2>
        {showPrefillHint && <PrefillHint t={t} />}
      </div>
      <RadioGroup
        value={formData.customerType}
        onValueChange={(value) => setFormData((previous) => ({ ...previous, customerType: value as CustomerType }))}
        className="checkout__customer-type mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2"
      >
        {(['individual', 'company'] as const).map((type) => (
          <label
            key={type}
            className="checkout__option flex cursor-pointer items-center rounded border border-border p-3 hover:bg-gray-50 dark:hover:bg-gray-800"
            htmlFor={`customer-type-${type}`}
          >
            <RadioGroupItem id={`customer-type-${type}`} value={type} className="mr-3" />
            <span className="checkout__option-title font-medium">{t(`checkout.customerType.${type}`)}</span>
          </label>
        ))}
      </RadioGroup>
      {formData.customerType === 'company' && (
        <div className="checkout__field-grid mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="checkout__field">
            <label htmlFor="checkout-company-name" className="checkout__label mb-1 block text-sm font-medium text-foreground">{t('checkout.companyName')} <span className="text-red-600">*</span></label>
            <Input id="checkout-company-name" name="companyName" value={formData.companyName} onChange={onChange} placeholder={t('checkout.companyName')} className={fieldClass(!!errors.companyName)} aria-required="true" aria-invalid={!!errors.companyName} aria-describedby={errors.companyName ? 'checkout-company-name-error' : undefined} />
            <FieldError id="checkout-company-name-error" message={errors.companyName} />
          </div>
          <div className="checkout__field">
            <label htmlFor="checkout-reg-number" className="checkout__label mb-1 block text-sm font-medium text-foreground">{t('checkout.regNumber')} <span className="text-red-600">*</span></label>
            <Input id="checkout-reg-number" name="regNumber" value={formData.regNumber} onChange={onChange} placeholder={t('checkout.regNumber')} className={fieldClass(!!errors.regNumber)} aria-required="true" aria-invalid={!!errors.regNumber} aria-describedby={errors.regNumber ? 'checkout-reg-number-error' : undefined} />
            <FieldError id="checkout-reg-number-error" message={errors.regNumber} />
          </div>
          <div className="checkout__field">
            <label htmlFor="checkout-vat-number" className="checkout__label mb-1 block text-sm font-medium text-foreground">{t('checkout.vatNumber')}</label>
            <Input id="checkout-vat-number" name="vatNumber" value={formData.vatNumber} onChange={onChange} placeholder={t('checkout.vatNumber')} className={fieldClass(false)} />
          </div>
          <div className="checkout__field sm:col-span-3">
            <label htmlFor="checkout-legal-address" className="checkout__label mb-1 block text-sm font-medium text-foreground">{t('checkout.legalAddress')} <span className="text-red-600">*</span></label>
            <Input id="checkout-legal-address" name="legalAddress" value={formData.legalAddress} onChange={onChange} placeholder={t('checkout.legalAddress')} className={fieldClass(!!errors.legalAddress)} aria-required="true" aria-invalid={!!errors.legalAddress} aria-describedby={errors.legalAddress ? 'checkout-legal-address-error' : undefined} />
            <FieldError id="checkout-legal-address-error" message={errors.legalAddress} />
          </div>
          <div className="checkout__field">
            <label htmlFor="checkout-bank-name" className="checkout__label mb-1 block text-sm font-medium text-foreground">{t('checkout.bankName')}</label>
            <Input id="checkout-bank-name" name="bankName" value={formData.bankName} onChange={onChange} placeholder={t('checkout.bankName')} className={fieldClass(false)} />
          </div>
          <div className="checkout__field sm:col-span-2">
            <label htmlFor="checkout-iban" className="checkout__label mb-1 block text-sm font-medium text-foreground">{t('checkout.iban')}</label>
            <Input id="checkout-iban" name="iban" value={formData.iban} onChange={onChange} placeholder={t('checkout.iban')} className={fieldClass(false)} />
          </div>
        </div>
      )}
      {formData.customerType === 'company' && (
        <h3 className="checkout__subsection-title mb-3 text-sm font-semibold text-muted-foreground">{t('checkout.contactsHeading')}</h3>
      )}
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
      {formData.customerType === 'individual' && (
        <div className="checkout__field-grid mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="checkout__field">
            <label htmlFor="checkout-personal-code" className="checkout__label mb-1 block text-sm font-medium text-foreground">{t('checkout.personalCode')} <span className="text-red-600">*</span></label>
            <Input id="checkout-personal-code" name="personalCode" value={formData.personalCode} onChange={onChange} placeholder={t('checkout.personalCode')} className={fieldClass(!!errors.personalCode)} aria-required="true" aria-invalid={!!errors.personalCode} aria-describedby={errors.personalCode ? 'checkout-personal-code-error' : undefined} />
            <FieldError id="checkout-personal-code-error" message={errors.personalCode} />
          </div>
        </div>
      )}
      <div className="checkout__field-grid mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="checkout__field">
          <label htmlFor="checkout-email" className="checkout__label mb-1 block text-sm font-medium text-foreground">{t('checkout.email')} <span className="text-red-600">*</span></label>
          <Input id="checkout-email" type="email" name="email" value={formData.email} onChange={onChange} placeholder={t('checkout.email')} className={fieldClass(!!errors.email)} aria-required="true" aria-invalid={!!errors.email} aria-describedby={errors.email ? 'checkout-email-error' : undefined} />
          <FieldError id="checkout-email-error" message={errors.email} />
        </div>
        <div className="checkout__field">
          <label className="checkout__label mb-1 block text-sm font-medium text-foreground">
            {t('checkout.phone')} {formData.customerType === 'individual' && <span className="text-red-600">*</span>}
          </label>
          <PhoneInput value={formData.phone} onChange={(phone) => setFormData((previous) => ({ ...previous, phone }))} aria-required={formData.customerType === 'individual'} aria-invalid={!!errors.phone} />
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
