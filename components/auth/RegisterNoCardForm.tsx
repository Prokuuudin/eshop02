'use client';
import React, { useRef, useState } from 'react';
import { Upload, X, Camera } from 'lucide-react';
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
        reader.onerror = () => reject(new Error('file_read_error'));
        reader.readAsDataURL(file);
    });

export default function RegisterNoCardForm({ onClose }: Props) {
    const { t, language } = useTranslation();
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [certificate, setCertificate] = useState<File | null>(null);
    const [fileKey, setFileKey] = useState(0);
    const galleryRef = useRef<HTMLInputElement>(null);
    const cameraRef = useRef<HTMLInputElement>(null);
    const [message, setMessage] = useState('');
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!certificate) {
            setError(t('auth.certificateRequired', 'Необходимо приложить сертификат или лицензию мастера'));
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
                language: language as 'ru' | 'en' | 'lv',
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

    if (success) {
        return (
            <div className="register-form bg-card p-3 rounded-lg space-y-4">
                <p className="register-form__success rounded-md border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                    {t(
                        'auth.requestNoCardSent',
                        'Заявка отправлена. После проверки администратор свяжется с вами и выдаст номер карты.'
                    )}
                </p>
                {onClose && (
                    <Button type="button" variant="outline" className="register-form__close w-full" onClick={onClose}>
                        {t('common.close', 'Закрыть')}
                    </Button>
                )}
            </div>
        );
    }

    return (
        <form
            onSubmit={handleSubmit}
            className="register-form space-y-3 bg-card p-3 rounded-lg"
        >
            {error && (
                <p className="register-form__error text-red-600 dark:text-red-400 mb-2">{error}</p>
            )}
            <p className="register-form__hint text-sm text-muted-foreground">
                {t('auth.registerNoCardHint', 'Пришлите свои данные и сертификат/лицензию мастера — администратор выдаст вам номер карты и пароль.')}
            </p>
            <div className="register-form__field">
                <label className="register-form__label block mb-1 text-sm text-foreground">
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
                <label className="register-form__label block mb-1 text-sm text-foreground">
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
                <label className="register-form__label block mb-1 text-sm text-foreground">
                    {t('auth.phone', 'Телефон')}
                </label>
                <PhoneInput
                    value={phone}
                    onChange={(val) => setPhone(val)}
                    required
                />
            </div>
            <div className="register-form__field">
                <label className="register-form__label block mb-1 text-sm text-foreground">
                    {t('auth.certificate')}
                </label>
                <input
                    key={`gallery-${fileKey}`}
                    ref={galleryRef}
                    type="file"
                    accept="image/*,application/pdf"
                    className="sr-only"
                    onChange={(e) => setCertificate(e.target.files?.[0] ?? null)}
                />
                <input
                    key={`camera-${fileKey}`}
                    ref={cameraRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="sr-only"
                    onChange={(e) => setCertificate(e.target.files?.[0] ?? null)}
                />
                <div className={`register-form__file-upload w-full rounded-lg border-2 border-dashed px-4 py-4 transition-colors ${
                    certificate
                        ? 'border-primary/70 bg-primary/5 dark:border-primary dark:bg-indigo-950/30'
                        : 'border-gray-300 bg-gray-50 dark:border-gray-600 dark:bg-gray-800'
                }`}>
                    {certificate ? (
                        <div className="register-form__file-selected flex items-center gap-2 text-primary dark:text-primary">
                            <Upload className="w-4 h-4 shrink-0" />
                            <span className="register-form__file-name truncate max-w-[220px]">{certificate.name}</span>
                            <span
                                role="button"
                                aria-label="Удалить файл"
                                className="register-form__file-clear ml-1 rounded-full p-0.5 hover:bg-primary/20 dark:hover:bg-indigo-800"
                                onClick={() => {
                                    setCertificate(null);
                                    setFileKey((k) => k + 1);
                                }}
                            >
                                <X className="w-3.5 h-3.5" />
                            </span>
                        </div>
                    ) : (
                        <>
                            <div className="flex gap-2 justify-center">
                                <button
                                    type="button"
                                    onClick={() => galleryRef.current?.click()}
                                    className="flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:border-primary/70 hover:text-primary dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:hover:border-primary dark:hover:text-primary/80 transition-colors"
                                >
                                    <Upload className="w-4 h-4" />
                                    {t('auth.uploadFromGallery')}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => cameraRef.current?.click()}
                                    className="flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:border-primary/70 hover:text-primary dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:hover:border-primary dark:hover:text-primary/80 transition-colors"
                                >
                                    <Camera className="w-4 h-4" />
                                    {t('auth.takePhoto')}
                                </button>
                            </div>
                            <p className="mt-2 text-center text-xs text-gray-400 dark:text-gray-500">
                                {t('auth.certificateFormats')}
                            </p>
                        </>
                    )}
                </div>
            </div>
            <div className="register-form__field">
                <label className="register-form__label block mb-1 text-sm text-foreground">
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
