import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { UserCircle2, ImagePlus } from 'lucide-react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface AccountProfileCardProps {
    user: any;
    isEditing: boolean;
    profileDraft: any;
    profileErrors: any;
    onEdit: () => void;
    onCancel: () => void;
    onSave: () => void;
    onChange: (field: string, value: string) => void;
    t: (key: string) => string;
    tl: (...args: any[]) => string;
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
    // Состояния для показа/скрытия пароля
    const [showPassword, setShowPassword] = useState(false);
    const [showRepeatPassword, setShowRepeatPassword] = useState(false);
    return (
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-900">
            <div className="account-profile__header mb-6 flex items-center gap-4 text-left">
                <div className="account-profile__avatar flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-sm overflow-hidden relative">
                    {(isEditing ? profileDraft?.avatarUrl : user.avatarUrl) ? (
                        <Image
                            src={isEditing ? profileDraft?.avatarUrl : user.avatarUrl}
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
                            <ImagePlus className="w-4 h-4 text-indigo-600" />
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
                    <h2 className="account-profile__name truncate text-xl font-bold text-gray-900 dark:text-gray-100">
                        {user.name || t('account.userDefault')}
                    </h2>
                    <p className="account-profile__email mt-1 break-all text-sm text-gray-600 dark:text-gray-300">
                        {user.email}
                    </p>
                </div>
            </div>
            {!isEditing ? (
                <>
                    <div className="space-y-2">
                        <div className="text-sm">
                            <span className="text-gray-600 dark:text-gray-300 font-medium">
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
                            <span className="text-gray-600 dark:text-gray-300 font-medium">
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
                    className="account-profile__form space-y-3 mt-2"
                    onSubmit={(e) => {
                        e.preventDefault();
                        onSave();
                    }}
                >
                    <div className="account-profile__field">
                        <label className="account-profile__label block text-xs text-gray-600 dark:text-gray-300 mb-1">
                            {t('account.name')}
                        </label>
                        <Input
                            className={`account-profile__input ${
                                profileErrors.name
                                    ? 'account-profile__input--error border-red-500'
                                    : ''
                            }`}
                            value={profileDraft.name}
                            onChange={(e) => onChange('name', e.target.value)}
                        />
                        {profileErrors.name && (
                            <p className="account-profile__error text-red-600 text-xs">
                                {profileErrors.name}
                            </p>
                        )}
                    </div>
                    <div className="account-profile__field">
                        <label className="account-profile__label block text-xs text-gray-600 dark:text-gray-300 mb-1">
                            Email
                        </label>
                        <Input
                            className={`account-profile__input ${
                                profileErrors.email
                                    ? 'account-profile__input--error border-red-500'
                                    : ''
                            }`}
                            value={profileDraft.email}
                            onChange={(e) => onChange('email', e.target.value)}
                        />
                        {profileErrors.email && (
                            <p className="account-profile__error text-red-600 text-xs">
                                {profileErrors.email}
                            </p>
                        )}
                    </div>
                    <div className="account-profile__field">
                        <label className="account-profile__label block text-xs text-gray-600 dark:text-gray-300 mb-1">
                            {t('account.company')}
                        </label>
                        <Input
                            className="account-profile__input"
                            value={profileDraft.companyName}
                            onChange={(e) => onChange('companyName', e.target.value)}
                        />
                    </div>
                    <div className="account-profile__field">
                        <label className="account-profile__label block text-xs text-gray-600 dark:text-gray-300 mb-1">
                            {t('account.passwordNew')}
                        </label>
                        <div className="relative flex items-center">
                            <Input
                                type={showPassword ? 'text' : 'password'}
                                className={`account-profile__input pr-10 ${
                                    profileErrors.password
                                        ? 'account-profile__input--error border-red-500'
                                        : ''
                                }`}
                                value={profileDraft.password}
                                onChange={(e) => onChange('password', e.target.value)}
                                placeholder={t('account.passwordNewPlaceholder')}
                            />
                            <button
                                type="button"
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400"
                                tabIndex={-1}
                                onClick={() => setShowPassword((v) => !v)}
                                aria-label={
                                    showPassword
                                        ? t('account.hidePassword')
                                        : t('account.showPassword')
                                }
                            >
                                {showPassword ? (
                                    <EyeOff className="w-5 h-5" />
                                ) : (
                                    <Eye className="w-5 h-5" />
                                )}
                            </button>
                        </div>
                        {profileErrors.password && (
                            <p className="account-profile__error text-red-600 text-xs">
                                {profileErrors.password}
                            </p>
                        )}
                    </div>
                    <div className="account-profile__field">
                        <label className="account-profile__label block text-xs text-gray-600 dark:text-gray-300 mb-1">
                            {t('account.passwordRepeat')}
                        </label>
                        <div className="relative flex items-center">
                            <Input
                                type={showRepeatPassword ? 'text' : 'password'}
                                className={`account-profile__input pr-10 ${
                                    profileErrors.passwordRepeat
                                        ? 'account-profile__input--error border-red-500'
                                        : ''
                                }`}
                                value={profileDraft.passwordRepeat || ''}
                                onChange={(e) => onChange('passwordRepeat', e.target.value)}
                                placeholder={t('account.passwordRepeatPlaceholder')}
                            />
                            <button
                                type="button"
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400"
                                tabIndex={-1}
                                onClick={() => setShowRepeatPassword((v) => !v)}
                                aria-label={
                                    showRepeatPassword
                                        ? t('account.hidePassword')
                                        : t('account.showPassword')
                                }
                            >
                                {showRepeatPassword ? (
                                    <EyeOff className="w-5 h-5" />
                                ) : (
                                    <Eye className="w-5 h-5" />
                                )}
                            </button>
                        </div>
                        {profileErrors.passwordRepeat && (
                            <p className="account-profile__error text-red-600 text-xs">
                                {profileErrors.passwordRepeat}
                            </p>
                        )}
                    </div>
                    <div className="account-profile__actions flex gap-2 mt-2">
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
