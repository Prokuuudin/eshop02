import type { DeliveryMethod } from '@/lib/orders-store';
import type { CheckoutFormData } from './CheckoutFormSections';

type Translate = (key: string) => string;

export type CheckoutValidationInput = {
    formData: CheckoutFormData;
    deliveryMethod: DeliveryMethod;
    pickupStoreId: string;
    termsAccepted: boolean;
};

export function validateCheckoutForm(
    { formData, deliveryMethod, pickupStoreId, termsAccepted }: CheckoutValidationInput,
    t: Translate
): Record<string, string> {
    const errors: Record<string, string> = {};

    if (formData.customerType === 'individual') {
        if (!formData.personalCode.trim()) errors.personalCode = t('checkout.errors.personalCode');
        if (!formData.phone.trim()) errors.phone = t('checkout.errors.phone');
    } else {
        if (!formData.companyName.trim()) errors.companyName = t('checkout.errors.companyName');
        if (!formData.regNumber.trim()) errors.regNumber = t('checkout.errors.regNumber');
        if (!formData.legalAddress.trim()) errors.legalAddress = t('checkout.errors.legalAddress');
    }

    if (!formData.firstName.trim()) errors.firstName = t('checkout.errors.firstName');
    if (!formData.lastName.trim()) errors.lastName = t('checkout.errors.lastName');
    if (!formData.email.trim()) {
        errors.email = t('checkout.errors.email');
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
        errors.email = t('checkout.errors.emailInvalid');
    }
    if (!formData.address.trim()) errors.address = t('checkout.errors.address');
    if (!formData.city.trim()) errors.city = t('checkout.errors.city');
    if (deliveryMethod === 'pickup' && !pickupStoreId) {
        errors.pickupStore = t('checkout.errors.pickupStore');
    }
    if (!termsAccepted) errors.terms = t('checkout.errors.terms');

    return errors;
}
