export function validateProfile(draft: any, t: (key: string) => string) {
    const errors: any = {};
    if (!draft.name.trim()) errors.name = t('account.errors.name');
    if (!draft.email.trim()) errors.email = t('account.errors.email');
    if (draft.password && draft.password.length < 6)
        errors.password = t('account.errors.password');
    return errors;
}

export function validateAddress(draft: any, t: (key: string) => string) {
    const errors: Record<string, string> = {};
    if (!draft.firstName.trim()) errors.firstName = t('checkout.errors.firstName');
    if (!draft.lastName.trim()) errors.lastName = t('checkout.errors.lastName');
    if (!draft.phone.trim()) errors.phone = t('checkout.errors.phone');
    if (!draft.address.trim()) errors.address = t('checkout.errors.address');
    if (!draft.city.trim()) errors.city = t('checkout.errors.city');
    return errors;
}
