type ProfileDraft = {
    name: string;
    email: string;
    password?: string;
};

type AddressDraft = {
    firstName: string;
    lastName: string;
    phone: string;
    address: string;
    city: string;
};

export function validateProfile(
    draft: ProfileDraft,
    t: (key: string) => string,
    emailOptional = false
): Record<string, string> {
    const errors: Record<string, string> = {};
    if (!draft.name.trim()) errors.name = t('account.errors.name');
    if (!emailOptional && !draft.email.trim()) errors.email = t('account.errors.email');
    if (draft.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email.trim()))
        errors.email = t('account.errors.emailInvalid');
    if (draft.password && draft.password.length < 6)
        errors.password = t('account.errors.password');
    return errors;
}

export function validateAddress(draft: AddressDraft, t: (key: string) => string): Record<string, string> {
    const errors: Record<string, string> = {};
    if (!draft.firstName.trim()) errors.firstName = t('checkout.errors.firstName');
    if (!draft.lastName.trim()) errors.lastName = t('checkout.errors.lastName');
    if (!draft.phone.trim()) errors.phone = t('checkout.errors.phone');
    if (!draft.address.trim()) errors.address = t('checkout.errors.address');
    if (!draft.city.trim()) errors.city = t('checkout.errors.city');
    return errors;
}
