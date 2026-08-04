import React, { useLayoutEffect, useRef } from 'react';
import { UserCircle2, ImagePlus } from 'lucide-react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import PhoneInput from '@/components/ui/phone-input';
import type { User } from '@/lib/auth';

const isInternalEmail = (email: string) => email.endsWith('@client.local');

type ProfileDraft = {
    name: string;
    email: string;
    phone: string;
    companyName: string;
    avatarUrl: string;
};

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
    const phoneWrapperRef = useRef<HTMLDivElement>(null);
    const companyRef = useRef<HTMLInputElement>(null);
    const didFocusRef = useRef(false);

    useLayoutEffect(() => {
        if (!isEditing) {
            didFocusRef.current = false;
            return;
        }
        if (didFocusRef.current || !profileDraft) return;
        didFocusRef.current = true;

        // Email is read-only, so it is not a focus target.
        const candidates: Array<{ empty: boolean; focus: () => void }> = [
            { empty: !profileDraft.name?.trim(),        focus: () => nameRef.current?.focus() },
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
                                    const img = new window.Image();
                                    const reader = new FileReader();
                                    reader.onload = (ev) => {
                                        img.onload = () => {
                                            // Создаем canvas для ресайза
                                            const canvas = document.createElement('canvas');
                                            const maxSize = 200;
                                            let w = img.width;
                                            let h = img.height;
                                            if (w > h) {
                                                if (w > maxSize) {
                                                    h = Math.round(h * (maxSize / w));
                                                    w = maxSize;
                                                }
                                            } else {
                                                if (h > maxSize) {
                                                    w = Math.round(w * (maxSize / h));
                                                    h = maxSize;
                                                }
                                            }
                                            canvas.width = w;
                                            canvas.height = h;
                                            const ctx = canvas.getContext('2d');
                                            ctx?.drawImage(img, 0, 0, w, h);
                                            // JPEG, качество 0.7
                                            const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
                                            onChange('avatarUrl', dataUrl);
                                        };
                                        img.src = ev.target?.result as string;
                                    };
                                    reader.readAsDataURL(file);
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
                                className={`account-profile__input ${
                                    profileErrors.name
                                        ? 'account-profile__input--error border-red-500'
                                        : ''
                                }`}
                                value={activeDraft.name}
                                onChange={(e) => onChange('name', e.target.value)}
                            />
                            {profileErrors.name && (
                                <p className="account-profile__error text-red-600 text-xs">
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
                                className="account-profile__input bg-muted text-muted-foreground cursor-not-allowed"
                                value={isInternalEmail(user.email) ? t('account.emailNotSet', 'Email не указан') : user.email}
                                readOnly
                                disabled
                                title={t('account.emailReadonlyHint', 'Email нельзя изменить здесь — обратитесь в поддержку')}
                            />
                        </div>
                        <div className="account-profile__field">
                            <label className="account-profile__label block text-xs text-muted-foreground mb-1">
                                {t('account.phone')}
                            </label>
                            <div ref={phoneWrapperRef}>
                            <PhoneInput
                                className={profileErrors.phone ? 'account-profile__input--error' : ''}
                                value={activeDraft.phone}
                                onChange={(val) => onChange('phone', val)}
                            />
                            </div>
                            {profileErrors.phone && (
                                <p className="account-profile__error text-red-600 text-xs">
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
                                className="account-profile__input"
                                value={activeDraft.companyName}
                                onChange={(e) => onChange('companyName', e.target.value)}
                            />
                        </div>
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
        </div>
    );
};

export default AccountProfileCard;
