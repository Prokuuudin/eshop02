'use client';

import React from 'react';
import { useSiteContent } from '@/lib/use-site-content';
import { translations } from '@/data/translations';
import { CONTENT_REGISTRY } from '@/lib/content-registry';

type Language = 'ru' | 'en' | 'lv';

async function uploadImageFile(file: File): Promise<string> {
    const formData = new FormData();
    formData.append('file', file);
    const response = await fetch('/api/admin/content/upload', { method: 'POST', body: formData });
    if (!response.ok) throw new Error('failed_to_upload_image');
    const data = (await response.json()) as { path?: string };
    if (!data.path) throw new Error('invalid_upload_response');
    return data.path;
}

function useAdminContentPageState() {
    const { overrides, resolveImageSrc, setText, setImage, removeText, removeImage, clearAll } =
        useSiteContent();

    const [language, setLanguage] = React.useState<Language>('ru');
    const [openSectionId, setOpenSectionId] = React.useState<string | null>(
        CONTENT_REGISTRY[0]?.id ?? null
    );
    const [message, setMessage] = React.useState('');
    const [saving, setSaving] = React.useState(false);

    // Expert mode state (free-form editors, unchanged logic from the previous page version)
    const [textKey, setTextKey] = React.useState('');
    const [textValue, setTextValue] = React.useState('');
    const [imageFrom, setImageFrom] = React.useState('');
    const [imageTo, setImageTo] = React.useState('');
    const [uploadingImage, setUploadingImage] = React.useState(false);
    const [sourcePreviewFailed, setSourcePreviewFailed] = React.useState(false);
    const [targetPreviewFailed, setTargetPreviewFailed] = React.useState(false);

    const normalizedTextKey = textKey.trim();
    const baseTranslation = normalizedTextKey
        ? translations[language][normalizedTextKey]
        : undefined;
    const existingOverride = normalizedTextKey
        ? overrides.text[language]?.[normalizedTextKey]
        : undefined;
    const currentText = existingOverride ?? baseTranslation;
    const nextText = textValue.trim() ? textValue : baseTranslation;

    const run = async (action: () => Promise<void>, ok: string, fail: string) => {
        setSaving(true);
        try {
            await action();
            setMessage(ok);
        } catch {
            setMessage(fail);
        } finally {
            setSaving(false);
        }
    };

    const onUploadImage = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        setUploadingImage(true);
        try {
            const path = await uploadImageFile(file);
            setImageTo(path);
            setTargetPreviewFailed(false);
            setMessage('Файл загружен. Новый путь подставлен в поле "Новый src".');
        } catch {
            setMessage('Не удалось загрузить файл.');
        } finally {
            setUploadingImage(false);
            event.target.value = '';
        }
    };

    return {
        overrides,
        resolveImageSrc,
        setText,
        setImage,
        removeText,
        removeImage,
        clearAll,
        language,
        setLanguage,
        openSectionId,
        setOpenSectionId,
        message,
        setMessage,
        saving,
        setSaving,
        textKey,
        setTextKey,
        textValue,
        setTextValue,
        imageFrom,
        setImageFrom,
        imageTo,
        setImageTo,
        uploadingImage,
        setUploadingImage,
        sourcePreviewFailed,
        setSourcePreviewFailed,
        targetPreviewFailed,
        setTargetPreviewFailed,
        normalizedTextKey,
        baseTranslation,
        existingOverride,
        currentText,
        nextText,
        run,
        onUploadImage,
    };
}

export function useAdminContentPage(): ReturnType<typeof useAdminContentPageState> {
  return useAdminContentPageState()
}
