import { describe, expect, it } from 'vitest';
import type { CheckoutFormData } from './CheckoutFormSections';
import { validateCheckoutForm } from './checkout-validation';

const validForm: CheckoutFormData = {
    customerType: 'individual',
    personalCode: '010190-12345',
    companyName: '',
    regNumber: '',
    vatNumber: '',
    legalAddress: '',
    bankName: '',
    iban: '',
    firstName: 'Anna',
    lastName: 'Bērziņa',
    email: 'anna@example.com',
    phone: '+37120000000',
    address: 'Brīvības iela 1',
    city: 'Rīga',
    postalCode: 'LV-1001',
    paymentMethod: 'bank',
};

const t = (key: string) => key;

describe('validateCheckoutForm', () => {
    it('accepts a complete individual delivery order', () => {
        expect(validateCheckoutForm({ formData: validForm, deliveryMethod: 'courier', pickupStoreId: '', termsAccepted: true }, t)).toEqual({});
    });

    it('requires company details, a pickup store and accepted terms', () => {
        const errors = validateCheckoutForm({
            formData: { ...validForm, customerType: 'company', companyName: '', regNumber: '', legalAddress: '' },
            deliveryMethod: 'pickup',
            pickupStoreId: '',
            termsAccepted: false,
        }, t);

        expect(Object.keys(errors)).toEqual(expect.arrayContaining(['companyName', 'regNumber', 'legalAddress', 'pickupStore', 'terms']));
    });

    it('rejects an invalid email address', () => {
        const errors = validateCheckoutForm({
            formData: { ...validForm, email: 'invalid' },
            deliveryMethod: 'courier',
            pickupStoreId: '',
            termsAccepted: true,
        }, t);

        expect(errors.email).toBe('checkout.errors.emailInvalid');
    });
});
