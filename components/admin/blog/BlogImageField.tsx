'use client';

import React from 'react';
import Image from 'next/image';
import { Input } from '@/components/ui/input';

const ACCEPTED_IMAGE_TYPES = 'image/jpeg,image/png,image/webp,image/gif,image/avif';

type Props = {
    id: string;
    label: string;
    value: string;
    onChange: (path: string) => void;
    l: (ru: string, en: string, lv: string) => string;
    placeholder?: string;
};

export default function BlogImageField({ id, label, value, onChange, l, placeholder }: Props): React.ReactElement {
    const [uploading, setUploading] = React.useState(false);
    const [error, setError] = React.useState('');

    const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        setUploading(true);
        setError('');
        try {
            const formData = new FormData();
            formData.set('file', file);
            const response = await fetch('/api/admin/content/upload', { method: 'POST', body: formData });
            const result = (await response.json().catch(() => ({}))) as { path?: string; error?: string };
            if (!response.ok || !result.path) {
                throw new Error(
                    result.error === 'file_too_large'
                        ? l('Файл превышает 10 МБ', 'The file exceeds 10 MB', 'Fails pārsniedz 10 MB')
                        : result.error === 'unsupported_file_type'
                        ? l('Неподдерживаемый формат изображения', 'Unsupported image format', 'Neatbalstīts attēla formāts')
                        : l('Не удалось загрузить изображение', 'Failed to upload image', 'Neizdevās augšupielādēt attēlu')
                );
            }
            onChange(result.path);
        } catch (uploadError) {
            setError(uploadError instanceof Error ? uploadError.message : l('Ошибка загрузки', 'Upload failed', 'Augšupielādes kļūda'));
        } finally {
            setUploading(false);
        }
    };

    return (
        <label htmlFor={id} className="text-sm">
            <span className="block text-muted-foreground mb-1">{label}</span>
            <Input
                id={id}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="w-full rounded border border-border bg-card text-foreground px-3 py-2"
                placeholder={placeholder}
                required
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
                <label className="inline-flex cursor-pointer items-center">
                    <input
                        type="file"
                        accept={ACCEPTED_IMAGE_TYPES}
                        className="sr-only"
                        disabled={uploading}
                        onChange={(event) => void handleUpload(event)}
                    />
                    <span className="inline-flex h-9 items-center rounded-md border border-input bg-background px-3 text-sm font-medium shadow-sm hover:bg-accent hover:text-accent-foreground">
                        {uploading
                            ? l('Загрузка…', 'Uploading…', 'Augšupielāde…')
                            : l('Выбрать с компьютера', 'Choose from computer', 'Izvēlēties no datora')}
                    </span>
                </label>
                {value && (
                    <div className="h-12 w-12 shrink-0 overflow-hidden rounded border border-border bg-muted">
                        <Image unoptimized src={value} alt="" width={48} height={48} className="h-full w-full object-cover" />
                    </div>
                )}
            </div>
            {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
        </label>
    );
}
