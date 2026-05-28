'use client';
import React, { useRef, useState } from 'react';
import { Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import PhoneInput from '@/components/ui/phone-input';
import { useTranslation } from '@/lib/use-translation';
import { submitNoCardRequest } from '@/lib/auth';

type Props = {
    onClose?: () => void;
};

const readFileAsBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('Не удалось прочитать файл'));
        reader.readAsDataURL(file);
    });

export default function RegisterNoCardForm({ onClose }: Props) {
    const { t } = useTranslation();
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [certificate, setCertificate] = useState<File | null>(null);
    const [fileKey, setFileKey] = useState(0);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [message, setMessage] = useState('');
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!certificate) {
            setError(t('auth.certificateRequired', 'Необходимо приложить сертификат мастера'));
            return;
        }

        setSubmitting(true);
        setError('');

        try {
            const certificateData = await readFileAsBase64(certificate);

            const result = submitNoCardRequest({
                name: name.trim(),
                email: email.trim(),
                phone: phone || undefined,
                certificateData,
                certificateName: certificate.name,
                message: message.trim() || undefined,
            });

            if (!result.success) {
                setError(result.error || t('common.error', 'Произошла ошибка'));
                return;
            }

            setSuccess(true);
            setName('');
            setEmail('');
            setPhone('');
            setCertificate(null);
            setFileKey((k) => k + 1);
            setMessage('');
        } catch {
            setError(t('common.error', 'Произошла ошибка при отправке заявки'));
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <form
            onSubmit={handleSubmit}
            className="register-form space-y-3 bg-white dark:bg-gray-900 p-3 rounded-lg"
        >
            {error && (
                <p className="register-form__error text-red-600 dark:text-red-400 mb-2">{error}</p>
            )}
            {success && (
                <p className="register-form__success rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                    {t(
                        'auth.requestNoCardSent',
                        'Заявка отправлена. После проверки администратор свяжется с вами и выдаст номер карты.'
                    )}
                </p>
            )}
            <p className="register-form__hint text-sm text-gray-500 dark:text-gray-400">
                {t('auth.registerNoCardHint', 'Для регистрации необходимо прислать основные данные и сертификат мастера. Администратор пришлет вам номер вашей карты и пароль.')}
            </p>
            <div className="register-form__field">
                <label className="register-form__label block mb-1 text-sm text-gray-900 dark:text-gray-100">
                    {t('auth.name')}
                </label>
                <Input
                    className="register-form__input"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={t('auth.namePlaceholder')}
                    required
                />
            </div>
            <div className="register-form__field">
                <label className="register-form__label block mb-1 text-sm text-gray-900 dark:text-gray-100">
                    {t('auth.email')}
                </label>
                <Input
                    className="register-form__input"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t('auth.emailPlaceholder')}
                    required
                />
            </div>
            <div className="register-form__field">
                <label className="register-form__label block mb-1 text-sm text-gray-900 dark:text-gray-100">
                    {t('auth.phone', 'Телефон')}
                </label>
                <PhoneInput
                    value={phone}
                    onChange={(val) => setPhone(val)}
                    required
                />
            </div>
            <div className="register-form__field">
                <label className="register-form__label block mb-1 text-sm text-gray-900 dark:text-gray-100">
                    {t('auth.certificate')}
                </label>
                <input
                    key={fileKey}
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,application/pdf"
                    className="sr-only"
                    onChange={(e) => setCertificate(e.target.files?.[0] ?? null)}
                    required
                />
                <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className={`register-form__file-upload w-full flex flex-col items-center gap-2 rounded-lg border-2 border-dashed px-4 py-5 text-sm transition-colors ${
                        certificate
                            ? 'border-indigo-400 bg-indigo-50 dark:border-indigo-600 dark:bg-indigo-950/30'
                            : 'border-gray-300 bg-gray-50 hover:border-indigo-400 hover:bg-indigo-50 dark:border-gray-600 dark:bg-gray-800 dark:hover:border-indigo-500'
                    }`}
                >
                    {certificate ? (
                        <div className="register-form__file-selected flex items-center gap-2 text-indigo-700 dark:text-indigo-300">
                            <Upload className="w-4 h-4 shrink-0" />
                            <span className="register-form__file-name truncate max-w-[220px]">{certificate.name}</span>
                            <span
                                role="button"
                                aria-label="Удалить файл"
                                className="register-form__file-clear ml-1 rounded-full p-0.5 hover:bg-indigo-200 dark:hover:bg-indigo-800"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setCertificate(null);
                                    setFileKey((k) => k + 1);
                                }}
                            >
                                <X className="w-3.5 h-3.5" />
                            </span>
                        </div>
                    ) : (
                        <>
                            <Upload className="register-form__file-icon w-6 h-6 text-gray-400 dark:text-gray-500" />
                            <span className="register-form__file-placeholder text-gray-500 dark:text-gray-400">
                                {t('auth.certificateDropzone')}
                            </span>
                            <span className="register-form__file-formats text-xs text-gray-400 dark:text-gray-500">
                                {t('auth.certificateFormats')}
                            </span>
                        </>
                    )}
                </button>
            </div>
            <div className="register-form__field">
                <label className="register-form__label block mb-1 text-sm text-gray-900 dark:text-gray-100">
                    {t('auth.message', 'Комментарий для администратора')}
                </label>
                <Input
                    className="register-form__input"
                    type="text"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder={t('auth.messagePlaceholder')}
                />
            </div>
            <div className="register-form__actions flex gap-2">
                <Button type="submit" className="register-form__submit flex-1" disabled={submitting}>
                    {submitting
                        ? t('common.sending', 'Отправка...')
                        : t('auth.sendRequest', 'Отправить заявку')}
                </Button>
                {onClose && (
                    <Button type="button" variant="outline" className="register-form__close" onClick={onClose}>
                        {t('common.close', 'Закрыть')}
                    </Button>
                )}
            </div>
        </form>
    );
}
