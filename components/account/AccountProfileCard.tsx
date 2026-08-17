import React, { useLayoutEffect, useRef } from 'react';
import { UserCircle2, ImagePlus } from 'lucide-react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import PhoneInput from '@/components/ui/phone-input';
import type { User } from '@/lib/auth';
import { AvatarCropDialog } from '@/components/account/AvatarCropDialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import type { ProfileDraft } from '@/hooks/useAccountProfile';

const isInternalEmail = (email: string) => email.endsWith('@client.local');

interface AccountProfileCardProps {
    user: User;
    isEditing: boolean;
    profileDraft: ProfileDraft | null;
    profileErrors: Record<string, string>;
    onEdit: () => void;
    onCancel: () => void;
    onSave: () => void;
    onChange: (field: string, value: string) => void;
    t: (key: string, defaultValue?: string, params?: Record<string, string | number>) => string;
    tl: (key: string, ru: string, en: string, lv: string, params?: Record<string, string | number>) => string;
}

const AccountProfileCard: React.FC<AccountProfileCardProps> = ({
    user,
    isEditing,
    profileDraft,
    profileErrors,
    onEdit,
    onCancel,
    onSave,
    onChange,
    t,
    tl,
}) => {
    const nameRef = useRef<HTMLInputElement>(null);
    const emailRef = useRef<HTMLInputElement>(null);
    const phoneWrapperRef = useRef<HTMLDivElement>(null);
    const companyRef = useRef<HTMLInputElement>(null);
    const didFocusRef = useRef(false);
    const [avatarSource, setAvatarSource] = React.useState<string | null>(null);

    useLayoutEffect(() => {
        if (!isEditing) {
            didFocusRef.current = false;
            return;
        }
        if (didFocusRef.current || !profileDraft) return;
        didFocusRef.current = true;

        const candidates: Array<{ empty: boolean; focus: () => void }> = [
            { empty: !profileDraft.name?.trim(),        focus: () => nameRef.current?.focus() },
            { empty: !profileDraft.email?.trim(),       focus: () => emailRef.current?.focus() },
            { empty: !profileDraft.phone?.trim(),       focus: () => phoneWrapperRef.current?.querySelector<HTMLInputElement>('input')?.focus() },
            { empty: !profileDraft.companyName?.trim(), focus: () => companyRef.current?.focus() },
        ];

        const first = candidates.find((c) => c.empty);
        first?.focus();
    }, [isEditing, profileDraft]);

    const activeDraft: ProfileDraft = profileDraft ?? {
        name: user.name ?? '',
        email: user.email,
        phone: user.phone ?? '',
        companyName: user.companyName ?? '',
        avatarUrl: user.avatarUrl ?? '',
        password: '',
        customerType: user.checkoutProfile?.customerType ?? 'individual',
        personalCode: user.checkoutProfile?.personalCode ?? '',
        regNumber: user.checkoutProfile?.regNumber ?? '',
        vatNumber: user.checkoutProfile?.vatNumber ?? '',
        legalAddress: user.checkoutProfile?.legalAddress ?? '',
        bankName: user.checkoutProfile?.bankName ?? '',
        iban: user.checkoutProfile?.iban ?? '',
        firstName: user.checkoutProfile?.firstName ?? '',
        lastName: user.checkoutProfile?.lastName ?? '',
        address: user.checkoutProfile?.address ?? '',
        city: user.checkoutProfile?.city ?? '',
        postalCode: user.checkoutProfile?.postalCode ?? '',
    };
    const avatarUrl = isEditing ? activeDraft.avatarUrl : user.avatarUrl;

    return (
        <div className="account-profile rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-900 h-full">
            <div className="account-profile__header mb-6 flex items-center gap-4 text-left">
                <div className="account-profile__avatar flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm overflow-hidden relative">
                    {avatarUrl ? (
                        <Image
                            src={avatarUrl}
                            alt={user.name || 'avatar'}
                            width={64}
                            height={64}
                            className="object-cover w-16 h-16"
                        />
                    ) : (
                        <UserCircle2 className="h-8 w-8" />
                    )}
                    {isEditing && (
                        <label
                            className="absolute bottom-0 right-0 bg-white bg-opacity-80 rounded-full p-1 cursor-pointer border border-gray-300"
                            title={t('account.avatarHint')}
                        >
                            <ImagePlus className="w-4 h-4 text-primary" />
                            <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={async (e) => {
                                    const file = e.target.files?.[0];
                                    if (!file) return;
                                    const reader = new FileReader();
                                    reader.onload = (ev) => setAvatarSource(ev.target?.result as string);
                                    reader.readAsDataURL(file);
                                    e.target.value = '';
                                }}
                            />
                        </label>
                    )}
                </div>
                <div className="account-profile__info min-w-0">
                    <h2 className="account-profile__name truncate text-xl font-bold text-foreground">
                        {user.name || t('account.userDefault')}
                    </h2>
                    <p className="account-profile__email mt-1 break-all text-sm text-muted-foreground">
                        {isInternalEmail(user.email) ? t('account.emailNotSet', 'Email не указан') : user.email}
                    </p>
                    <p className="account-profile__phone mt-1 break-all text-sm text-muted-foreground">
                        {user.phone ? user.phone : t('account.phoneNotSet')}
                    </p>
                </div>
            </div>
            {!isEditing ? (
                <>
                    <div className="space-y-2">
                        <div className="text-sm">
                            <span className="text-muted-foreground font-medium">
                                {tl(
                                    'account.page.cardNumber',
                                    'Номер карты клиента',
                                    'Card number',
                                    'Kartes numurs'
                                )}
                            </span>
                            : <span className="font-mono">{user.cardNumber || '-'}</span>
                        </div>
                        <div className="text-sm">
                            <span className="text-muted-foreground font-medium">
                                {tl('account.page.company', 'Компания', 'Company', 'Uzņēmums')}
                            </span>
                            : <span>{user.companyName || '-'}</span>
                        </div>
                    </div>
                    <Button className="mt-4 w-full" onClick={onEdit}>
                        {t('account.editProfile')}
                    </Button>
                </>
            ) : (
                <form
                    className="account-profile__form mt-2"
                    onSubmit={(e) => {
                        e.preventDefault();
                        onSave();
                    }}
                >
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="account-profile__field">
                            <label htmlFor="profile-name" className="account-profile__label block text-xs text-muted-foreground mb-1">
                                {t('account.name')}
                            </label>
                            <Input
                                id="profile-name"
                                ref={nameRef}
                                className={`account-profile__input focus-visible:border-primary/60 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:shadow-[0_0_0_3px_rgba(59,130,246,0.10)] ${
                                    profileErrors.name
                                        ? 'account-profile__input--error border-red-500'
                                        : ''
                                }`}
                                value={activeDraft.name}
                                onChange={(e) => onChange('name', e.target.value)}
                            />
                            {profileErrors.name && (
                                <p className="account-profile__error mt-1.5 text-xs leading-4 text-red-600 dark:text-red-400">
                                    {profileErrors.name}
                                </p>
                            )}
                        </div>
                        <div className="account-profile__field">
                            <label htmlFor="profile-email" className="account-profile__label block text-xs text-muted-foreground mb-1">
                                Email
                            </label>
                            <Input
                                id="profile-email"
                                ref={emailRef}
                                type="email"
                                autoComplete="email"
                                className={`account-profile__input focus-visible:border-primary/60 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:shadow-[0_0_0_3px_rgba(59,130,246,0.10)] ${profileErrors.email ? 'account-profile__input--error border-red-500' : ''}`}
                                value={activeDraft.email}
                                onChange={(e) => onChange('email', e.target.value)}
                            />
                            {profileErrors.email && (
                                <p className="account-profile__error mt-1.5 text-xs leading-4 text-red-600 dark:text-red-400">{profileErrors.email}</p>
                            )}
                        </div>
                        <div className="account-profile__field">
                            <label className="account-profile__label block text-xs text-muted-foreground mb-1">
                                {t('account.phone')}
                            </label>
                            <div ref={phoneWrapperRef}>
                            <PhoneInput
                                className={`focus-visible:border-primary/60 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:shadow-[0_0_0_3px_rgba(59,130,246,0.10)] ${profileErrors.phone ? 'account-profile__input--error' : ''}`}
                                value={activeDraft.phone}
                                onChange={(val) => onChange('phone', val)}
                            />
                            </div>
                            {profileErrors.phone && (
                                <p className="account-profile__error mt-1.5 text-xs leading-4 text-red-600 dark:text-red-400">
                                    {profileErrors.phone}
                                </p>
                            )}
                        </div>
                        <div className="account-profile__field">
                            <label htmlFor="profile-company" className="account-profile__label block text-xs text-muted-foreground mb-1">
                                {t('account.company')}
                            </label>
                            <Input
                                id="profile-company"
                                ref={companyRef}
                                className="account-profile__input focus-visible:border-primary/60 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:shadow-[0_0_0_3px_rgba(59,130,246,0.10)]"
                                value={activeDraft.companyName}
                                onChange={(e) => onChange('companyName', e.target.value)}
                            />
                        </div>
                    </div>
                    <div className="my-5 border-t border-border" />
                    <h3 className="mb-3 text-sm font-semibold text-foreground">{t('checkout.delivery.title')}</h3>
                    <RadioGroup
                        value={activeDraft.customerType}
                        onValueChange={(value) => onChange('customerType', value)}
                        className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2"
                    >
                        {(['individual', 'company'] as const).map((type) => (
                            <label key={type} htmlFor={`profile-customer-type-${type}`} className="flex cursor-pointer items-center rounded border border-border p-3">
                                <RadioGroupItem id={`profile-customer-type-${type}`} value={type} className="mr-3" />
                                <span className="text-sm font-medium">{t(`checkout.customerType.${type}`)}</span>
                            </label>
                        ))}
                    </RadioGroup>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <ProfileInput field="firstName" label={t('checkout.firstName')} value={activeDraft.firstName} onChange={onChange} />
                        <ProfileInput field="lastName" label={t('checkout.lastName')} value={activeDraft.lastName} onChange={onChange} />
                        {activeDraft.customerType === 'individual' ? (
                            <ProfileInput field="personalCode" label={t('checkout.personalCode')} value={activeDraft.personalCode} onChange={onChange} />
                        ) : (
                            <>
                                <ProfileInput field="companyName" label={t('checkout.companyName')} value={activeDraft.companyName} onChange={onChange} />
                                <ProfileInput field="regNumber" label={t('checkout.regNumber')} value={activeDraft.regNumber} onChange={onChange} />
                                <ProfileInput field="vatNumber" label={t('checkout.vatNumber')} value={activeDraft.vatNumber} onChange={onChange} />
                                <ProfileInput field="legalAddress" label={t('checkout.legalAddress')} value={activeDraft.legalAddress} onChange={onChange} wide />
                                <ProfileInput field="bankName" label={t('checkout.bankName')} value={activeDraft.bankName} onChange={onChange} />
                                <ProfileInput field="iban" label={t('checkout.iban')} value={activeDraft.iban} onChange={onChange} />
                            </>
                        )}
                        <ProfileInput field="address" label={t('checkout.address')} value={activeDraft.address} onChange={onChange} wide />
                        <ProfileInput field="city" label={t('checkout.city')} value={activeDraft.city} onChange={onChange} />
                        <ProfileInput field="postalCode" label={t('checkout.postalCode')} value={activeDraft.postalCode} onChange={onChange} />
                    </div>
                    <div className="account-profile__actions flex gap-2 mt-4">
                        <Button size="sm" variant="outline" type="button" onClick={onCancel}>
                            {t('common.cancel')}
                        </Button>
                        <Button size="sm" type="submit">
                            {t('common.save')}
                        </Button>
                    </div>
                </form>
            )}
            <AvatarCropDialog
                source={avatarSource}
                onCancel={() => setAvatarSource(null)}
                onApply={(dataUrl) => { onChange('avatarUrl', dataUrl); setAvatarSource(null); }}
                labels={{
                    title: tl('account.avatarEditor.title', 'Настройка фото', 'Adjust photo', 'Pielāgot fotoattēlu'),
                    zoom: tl('account.avatarEditor.zoom', 'Масштаб', 'Zoom', 'Mērogs'),
                    reset: tl('account.avatarEditor.reset', 'Сбросить', 'Reset', 'Atiestatīt'),
                    cancel: t('common.cancel'),
                    apply: tl('account.avatarEditor.apply', 'Применить', 'Apply', 'Lietot'),
                }}
            />
        </div>
    );
};

function ProfileInput({ field, label, value, onChange, wide = false }: {
    field: string; label: string; value: string; onChange: (field: string, value: string) => void; wide?: boolean;
}): React.ReactElement {
    return (
        <div className={wide ? 'sm:col-span-2' : ''}>
            <label htmlFor={`profile-${field}`} className="mb-1 block text-xs text-muted-foreground">{label}</label>
            <Input id={`profile-${field}`} value={value} onChange={(event) => onChange(field, event.target.value)} />
        </div>
    );
}

export default AccountProfileCard;
