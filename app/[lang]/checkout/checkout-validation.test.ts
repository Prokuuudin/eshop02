import { describe, expect, it } from 'vitest';
import type { CheckoutFormData } from './CheckoutFormSections';
import { validateCheckoutForm } from './checkout-validation';

const validForm: CheckoutFormData = {
    customerType: 'individual',
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
    it('requires a selected locker for Omniva, Venipak and Unisend but not their couriers', () => {
        for (const method of ['post', 'venipak', 'unisend'] as const) {
            expect(validateCheckoutForm({ formData: validForm, deliveryMethod: method, pickupStoreId: '', termsAccepted: true }, t).deliveryLocationId).toBe('checkout.errors.deliveryLocation');
            expect(validateCheckoutForm({ formData: validForm, deliveryMethod: method, deliveryLocationId: '8144', pickupStoreId: '', termsAccepted: true }, t).deliveryLocationId).toBeUndefined();
        }
        expect(validateCheckoutForm({ formData: validForm, deliveryMethod: 'unisend_courier', pickupStoreId: '', termsAccepted: true }, t).deliveryLocationId).toBeUndefined();
    });
    it('does not require a home address for lockers or pickup', () => {
        const noAddress = { ...validForm, address: '', city: '', postalCode: '' };
        expect(validateCheckoutForm({ formData: noAddress, deliveryMethod: 'post', deliveryLocationId: '9192', pickupStoreId: '', termsAccepted: true }, t)).toEqual({});
        expect(validateCheckoutForm({ formData: noAddress, deliveryMethod: 'pickup', pickupStoreId: 'imanta', termsAccepted: true }, t)).toEqual({});
    });
    it('requires address, city and postal code for courier', () => {
        const errors = validateCheckoutForm({ formData: { ...validForm, address: '', city: '', postalCode: '' }, deliveryMethod: 'courier', pickupStoreId: '', termsAccepted: true }, t);
        expect(Object.keys(errors)).toEqual(expect.arrayContaining(['address', 'city', 'postalCode']));
    });
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
