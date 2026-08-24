'use client';

import React from 'react';
import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import { translations } from '@/data/translations';
import { CONTENT_REGISTRY, type ContentEntry } from '@/lib/content-registry';
import AdminGate from '@/components/admin/AdminGate';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useAdminLocale } from '@/lib/use-admin-locale';

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

function ChangedBadge() {
    const { l } = useAdminLocale();
    return (
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
            {l('изменено', 'changed', 'mainīts')}
        </span>
    );
}

function TextEntryRow({
    entry,
    overrideValue,
    baseValue,
    onSave,
    onReset,
}: {
    entry: Extract<ContentEntry, { type: 'text' }>;
    overrideValue: string | undefined;
    baseValue: string | undefined;
    onSave: (value: string) => Promise<void>;
    onReset: () => Promise<void>;
}) {
    const { l } = useAdminLocale();
    const currentValue = overrideValue ?? baseValue ?? '';
    const [value, setValue] = React.useState(currentValue);
    const [busy, setBusy] = React.useState(false);
    const dirty = value !== currentValue;

    // Language switches remount rows via key={...} in the parent. This effect covers the
    // remaining path: a global «Сбросить все» clears the override without remounting the row,
    // and the stale local value would otherwise re-enable «Сохранить» with the cleared text.
    React.useEffect(() => {
        queueMicrotask(() => setValue(currentValue));
    }, [currentValue]);

    const save = async () => {
        setBusy(true);
        try {
            await onSave(value);
        } finally {
            setBusy(false);
        }
    };

    const reset = async () => {
        setBusy(true);
        try {
            await onReset();
            setValue(baseValue ?? '');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="rounded-md border border-border p-3 space-y-2">
            <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-foreground">{entry.label}</p>
                {overrideValue !== undefined && <ChangedBadge />}
                <code className="ml-auto text-[10px] text-muted-foreground">{entry.key}</code>
            </div>
            {entry.multiline ? (
                <Textarea
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    className="min-h-[96px]"
                />
            ) : (
                <Input value={value} onChange={(e) => setValue(e.target.value)} />
            )}
            <div className="flex gap-2">
                <Button size="sm" onClick={() => void save()} disabled={busy || !dirty}>
                    {l('Сохранить', 'Save', 'Saglabāt')}
                </Button>
                {overrideValue !== undefined && (
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void reset()}
                        disabled={busy}
                    >
                        {l('Сбросить к базовому', 'Reset to default', 'Atiestatīt uz pamata vērtību')}
                    </Button>
                )}
            </div>
        </div>
    );
}

function ImageEntryRow({
    entry,
    overridden,
    resolvedSrc,
    onUploadAndSet,
    onReset,
}: {
    entry: Extract<ContentEntry, { type: 'image' }>;
    overridden: boolean;
    resolvedSrc: string;
    onUploadAndSet: (file: File) => Promise<void>;
    onReset: () => Promise<void>;
}) {
    const { l } = useAdminLocale();
    const [busy, setBusy] = React.useState(false);

    const onFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        setBusy(true);
        try {
            await onUploadAndSet(file);
        } finally {
            setBusy(false);
            event.target.value = '';
        }
    };

    return (
        <div className="rounded-md border border-border p-3 space-y-2">
            <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-foreground">{entry.label}</p>
                {overridden && <ChangedBadge />}
                <code className="ml-auto text-[10px] text-muted-foreground">{entry.src}</code>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
                src={resolvedSrc}
                alt={entry.label}
                className="h-28 w-full rounded-md border border-border object-contain bg-muted"
            />
            <div className="flex flex-wrap items-center gap-2">
                <Input
                    type="file"
                    accept="image/*"
                    disabled={busy}
                    onChange={(e) => void onFileChange(e)}
                    className="max-w-xs"
                />
                {overridden && (
                    <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => {
                            setBusy(true);
                            void onReset().finally(() => setBusy(false));
                        }}
                    >
                        {l('Сбросить', 'Reset', 'Atiestatīt')}
                    </Button>
                )}
            </div>
        </div>
    );
}

import { useAdminContentPage } from './useAdminContentPage';

export default function AdminContentPage(): React.ReactElement {
    const { l } = useAdminLocale();
    const pageState = useAdminContentPage();
    const {
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
            saving,
            textKey,
            setTextKey,
            textValue,
            setTextValue,
            imageFrom,
            setImageFrom,
            imageTo,
            setImageTo,
            uploadingImage,
            sourcePreviewFailed,
            setSourcePreviewFailed,
            targetPreviewFailed,
            setTargetPreviewFailed,
            normalizedTextKey,
            baseTranslation,
            currentText,
            nextText,
            run,
            onUploadImage,
          } = pageState;
    return (
        <AdminGate>
            <main className="w-full py-4 space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h1 className="text-2xl md:text-3xl font-bold text-foreground">
                            {l('Управление контентом сайта', 'Website content management', 'Vietnes satura pārvaldība')}
                        </h1>
                        <p className="text-sm text-muted-foreground mt-1">
                            {l('Тексты и изображения сайта по разделам. Изменения применяются сразу, без деплоя.', 'Website text and images organized by section. Changes apply immediately without a deployment.', 'Vietnes teksti un attēli pa sadaļām. Izmaiņas stājas spēkā uzreiz bez izvietošanas.')}
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <Link href="/admin/content/banners">
                            <Button variant="outline">{l('Баннеры', 'Banners', 'Baneri')}</Button>
                        </Link>
                        <Link href="/admin">
                            <Button variant="outline">{l('Назад в админку', 'Back to admin', 'Atpakaļ uz administrāciju')}</Button>
                        </Link>
                        <Button
                            variant="destructive"
                            disabled={saving}
                            onClick={() =>
                                void run(
                                    clearAll,
                                    l('Все переопределения очищены.', 'All overrides cleared.', 'Visi pārrakstījumi notīrīti.'),
                                    l('Не удалось очистить переопределения.', 'Failed to clear overrides.', 'Neizdevās notīrīt pārrakstījumus.')
                                )
                            }
                        >
                            {l('Сбросить все', 'Reset all', 'Atiestatīt visu')}
                        </Button>
                    </div>
                </div>

                {message && (
                    <div className="rounded-md border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-900/20 dark:text-green-300">
                        {message}
                    </div>
                )}

                <div className="flex flex-wrap gap-2">
                    {(['ru', 'en', 'lv'] as Language[]).map((lang) => (
                        <Button
                            key={lang}
                            variant={language === lang ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setLanguage(lang)}
                        >
                            {lang.toUpperCase()}
                        </Button>
                    ))}
                </div>

                {/* Registry sections */}
                <section className="space-y-3">
                    {CONTENT_REGISTRY.map((section) => {
                        const isOpen = openSectionId === section.id;
                        const changedCount = section.entries.filter((entry) =>
                            entry.type === 'text'
                                ? overrides.text[language]?.[entry.key] !== undefined
                                : overrides.images[entry.src] !== undefined
                        ).length;

                        return (
                            <div
                                key={section.id}
                                className="rounded-lg border border-border bg-card"
                            >
                                <button
                                    type="button"
                                    className="flex w-full items-center gap-2 px-4 py-3 text-left"
                                    aria-expanded={isOpen}
                                    onClick={() => setOpenSectionId(isOpen ? null : section.id)}
                                >
                                    <span className="font-semibold text-foreground">
                                        {section.title}
                                    </span>
                                    {changedCount > 0 && (
                                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                                            {changedCount} {l('изм.', 'changed', 'mainīti')}
                                        </span>
                                    )}
                                    <ChevronDown
                                        className={`ml-auto h-4 w-4 transition-transform ${
                                            isOpen ? 'rotate-180' : ''
                                        }`}
                                    />
                                </button>

                                {isOpen && (
                                    <div className="ui-disclosure-in grid grid-cols-1 gap-3 border-t border-border p-4 lg:grid-cols-2">
                                        {section.entries.map((entry) =>
                                            entry.type === 'text' ? (
                                                <TextEntryRow
                                                    key={`${language}-${entry.key}`}
                                                    entry={entry}
                                                    overrideValue={
                                                        overrides.text[language]?.[entry.key]
                                                    }
                                                    baseValue={translations[language][entry.key]}
                                                    onSave={(value) =>
                                                        run(
                                                            () =>
                                                                setText(language, entry.key, value),
                                                            l('Текст сохранён.', 'Text saved.', 'Teksts saglabāts.'),
                                                            l('Не удалось сохранить текст.', 'Failed to save text.', 'Neizdevās saglabāt tekstu.')
                                                        )
                                                    }
                                                    onReset={() =>
                                                        run(
                                                            () => removeText(language, entry.key),
                                                            l('Переопределение удалено.', 'Override removed.', 'Pārrakstījums noņemts.'),
                                                            l('Не удалось удалить переопределение.', 'Failed to remove override.', 'Neizdevās noņemt pārrakstījumu.')
                                                        )
                                                    }
                                                />
                                            ) : (
                                                <ImageEntryRow
                                                    key={entry.src}
                                                    entry={entry}
                                                    overridden={
                                                        overrides.images[entry.src] !== undefined
                                                    }
                                                    resolvedSrc={resolveImageSrc(entry.src)}
                                                    onUploadAndSet={async (file) => {
                                                        await run(
                                                            async () => {
                                                                const path = await uploadImageFile(
                                                                    file
                                                                );
                                                                await setImage(entry.src, path);
                                                            },
                                                            l('Изображение заменено.', 'Image replaced.', 'Attēls aizstāts.'),
                                                            l('Не удалось заменить изображение.', 'Failed to replace image.', 'Neizdevās aizstāt attēlu.')
                                                        );
                                                    }}
                                                    onReset={() =>
                                                        run(
                                                            () => removeImage(entry.src),
                                                            l('Переопределение удалено.', 'Override removed.', 'Pārrakstījums noņemts.'),
                                                            l('Не удалось удалить переопределение.', 'Failed to remove override.', 'Neizdevās noņemt pārrakstījumu.')
                                                        )
                                                    }
                                                />
                                            )
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </section>

                {/* Expert mode: free-form editors + active override lists (logic unchanged) */}
                <details className="rounded-lg border border-border bg-card">
                    <summary className="cursor-pointer px-4 py-3 font-semibold text-foreground">
                        {l('Экспертный режим (произвольные ключи и пути)', 'Expert mode (custom keys and paths)', 'Eksperta režīms (pielāgotas atslēgas un ceļi)')}
                    </summary>
                    <div className="space-y-4 border-t border-border p-4">
                        <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            <div className="rounded-lg border border-border bg-card p-4 space-y-3">
                                <h2 className="text-lg font-semibold text-foreground">{l('Тексты', 'Text', 'Teksti')}</h2>
                                <p className="text-sm text-muted-foreground">
                                    {l('Редактируйте тексты по ключам переводов (например: hero.title, newsletter.title).', 'Edit text using translation keys (for example: hero.title, newsletter.title).', 'Rediģējiet tekstus pēc tulkojumu atslēgām (piemēram: hero.title, newsletter.title).')}
                                </p>

                                <Input
                                    value={textKey}
                                    onChange={(e) => setTextKey(e.target.value)}
                                    placeholder={l('Ключ текста, например hero.title', 'Text key, for example hero.title', 'Teksta atslēga, piemēram, hero.title')}
                                />
                                <Textarea
                                    value={textValue}
                                    onChange={(e) => setTextValue(e.target.value)}
                                    placeholder={l('Новое значение текста', 'New text value', 'Jaunā teksta vērtība')}
                                    className="min-h-[120px]"
                                />

                                {(normalizedTextKey || textValue.trim()) && (
                                    <div className="space-y-2 rounded-md border border-border p-3">
                                        <p className="text-xs text-muted-foreground">
                                            {l('Сравнение текста до сохранения:', 'Text comparison before saving:', 'Teksta salīdzinājums pirms saglabāšanas:')}
                                        </p>

                                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                            <div className="space-y-2">
                                                <p className="text-xs font-medium text-foreground">
                                                    {l('Было (Текущее на сайте)', 'Before (Currently on the site)', 'Pirms (Pašlaik vietnē)')}
                                                </p>
                                                <div className="min-h-[96px] rounded-md border border-border bg-muted px-3 py-2 text-sm text-foreground whitespace-pre-wrap">
                                                    {currentText ||
                                                        l('Значение для этого ключа пока не найдено.', 'No value has been found for this key yet.', 'Šai atslēgai vērtība vēl nav atrasta.')}
                                                </div>
                                            </div>

                                            <div className="space-y-2">
                                                <p className="text-xs font-medium text-foreground">
                                                    {l('Стало (После сохранения)', 'After (Once saved)', 'Pēc (Pēc saglabāšanas)')}
                                                </p>
                                                <div className="min-h-[96px] rounded-md border border-border bg-muted px-3 py-2 text-sm text-foreground whitespace-pre-wrap">
                                                    {nextText ||
                                                        l('Пусто. При сохранении переопределение будет удалено.', 'Empty. Saving will remove the override.', 'Tukšs. Saglabājot pārrakstījums tiks noņemts.')}
                                                </div>
                                            </div>
                                        </div>

                                        {normalizedTextKey && !baseTranslation && (
                                            <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
                                                {l('Ключ не найден в базовом словаре переводов. Будет создано только переопределение.', 'The key was not found in the base translation dictionary. Only an override will be created.', 'Atslēga nav atrasta pamata tulkojumu vārdnīcā. Tiks izveidots tikai pārrakstījums.')}
                                            </div>
                                        )}
                                    </div>
                                )}

                                <Button
                                    onClick={() => {
                                        if (!textKey.trim()) return;
                                        void run(
                                            () => setText(language, textKey, textValue),
                                            l('Текст сохранён.', 'Text saved.', 'Teksts saglabāts.'),
                                            l('Не удалось сохранить текст.', 'Failed to save text.', 'Neizdevās saglabāt tekstu.')
                                        );
                                    }}
                                    disabled={saving}
                                >
                                    {l('Сохранить текст', 'Save text', 'Saglabāt tekstu')}
                                </Button>
                            </div>

                            <div className="rounded-lg border border-border bg-card p-4 space-y-3">
                                <h2 className="text-lg font-semibold text-foreground">{l('Изображения', 'Images', 'Attēli')}</h2>
                                <p className="text-sm text-muted-foreground">
                                    {l('Заменяйте изображения, подменяя исходный src на новый путь или URL.', 'Replace images by mapping the original src to a new path or URL.', 'Aizstājiet attēlus, piesaistot sākotnējo src jaunam ceļam vai URL.')}
                                </p>

                                <Input
                                    value={imageFrom}
                                    onChange={(e) => {
                                        setImageFrom(e.target.value);
                                        setSourcePreviewFailed(false);
                                    }}
                                    placeholder={l('Исходный src, например /icons/originals.svg', 'Original src, for example /icons/originals.svg', 'Sākotnējais src, piemēram, /icons/originals.svg')}
                                />
                                <Input
                                    value={imageTo}
                                    onChange={(e) => {
                                        setImageTo(e.target.value);
                                        setTargetPreviewFailed(false);
                                    }}
                                    placeholder={l('Новый src, например /api/media/new-icon.png', 'New src, for example /api/media/new-icon.png', 'Jaunais src, piemēram, /api/media/new-icon.png')}
                                />

                                {(imageFrom.trim() || imageTo.trim()) && (
                                    <div className="space-y-2 rounded-md border border-border p-3">
                                        <p className="text-xs text-muted-foreground">
                                            {l('Сравнение изображений до сохранения:', 'Image comparison before saving:', 'Attēlu salīdzinājums pirms saglabāšanas:')}
                                        </p>

                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                            <div className="space-y-2">
                                                <p className="text-xs font-medium text-foreground">
                                                    {l('Было (Исходный src)', 'Before (Original src)', 'Pirms (Sākotnējais src)')}
                                                </p>
                                                {imageFrom.trim() ? (
                                                    !sourcePreviewFailed ? (
                                                        // eslint-disable-next-line @next/next/no-img-element
                                                        <img
                                                            src={imageFrom}
                                                            alt={l('Исходное изображение', 'Original image', 'Sākotnējais attēls')}
                                                            className="h-36 w-full rounded-md border border-border object-contain bg-muted"
                                                            onLoad={() =>
                                                                setSourcePreviewFailed(false)
                                                            }
                                                            onError={() =>
                                                                setSourcePreviewFailed(true)
                                                            }
                                                        />
                                                    ) : (
                                                        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
                                                            {l('Не удалось загрузить исходное изображение.', 'Failed to load the original image.', 'Neizdevās ielādēt sākotnējo attēlu.')}
                                                        </div>
                                                    )
                                                ) : (
                                                    <div className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
                                                        {l('Укажите исходный src для предпросмотра.', 'Enter the original src for preview.', 'Norādiet sākotnējo src priekšskatījumam.')}
                                                    </div>
                                                )}
                                            </div>

                                            <div className="space-y-2">
                                                <p className="text-xs font-medium text-foreground">
                                                    {l('Стало (Новый src)', 'After (New src)', 'Pēc (Jaunais src)')}
                                                </p>
                                                {imageTo.trim() ? (
                                                    !targetPreviewFailed ? (
                                                        // eslint-disable-next-line @next/next/no-img-element
                                                        <img
                                                            src={imageTo}
                                                            alt={l('Новое изображение', 'New image', 'Jaunais attēls')}
                                                            className="h-36 w-full rounded-md border border-border object-contain bg-muted"
                                                            onLoad={() =>
                                                                setTargetPreviewFailed(false)
                                                            }
                                                            onError={() =>
                                                                setTargetPreviewFailed(true)
                                                            }
                                                        />
                                                    ) : (
                                                        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
                                                            {l('Не удалось загрузить новое изображение.', 'Failed to load the new image.', 'Neizdevās ielādēt jauno attēlu.')}
                                                        </div>
                                                    )
                                                ) : (
                                                    <div className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
                                                        {l('Укажите новый src для предпросмотра.', 'Enter the new src for preview.', 'Norādiet jauno src priekšskatījumam.')}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                <div className="space-y-2 rounded-md border border-dashed border-border p-3">
                                    <p className="text-xs text-muted-foreground">
                                        {l('Или загрузите новый файл изображения (до 10 МБ):', 'Or upload a new image file (up to 10 MB):', 'Vai augšupielādējiet jaunu attēla failu (līdz 10 MB):')}
                                    </p>
                                    <Input
                                        type="file"
                                        accept="image/*"
                                        disabled={uploadingImage || saving}
                                        onChange={(e) => void onUploadImage(e)}
                                    />
                                </div>
                                <Button
                                    onClick={() => {
                                        if (!imageFrom.trim()) return;
                                        void run(
                                            () => setImage(imageFrom, imageTo),
                                            l('Переопределение изображения сохранено.', 'Image override saved.', 'Attēla pārrakstījums saglabāts.'),
                                            l('Не удалось сохранить переопределение изображения.', 'Failed to save the image override.', 'Neizdevās saglabāt attēla pārrakstījumu.')
                                        );
                                    }}
                                    disabled={saving}
                                >
                                    {l('Сохранить изображение', 'Save image', 'Saglabāt attēlu')}
                                </Button>
                            </div>
                        </section>

                        <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            <div className="rounded-lg border border-border bg-card p-4">
                                <h3 className="font-semibold mb-3 text-foreground">
                                    {l('Текущие переопределения текста', 'Current text overrides', 'Pašreizējie teksta pārrakstījumi')} ({language.toUpperCase()})
                                </h3>
                                <div className="space-y-2 max-h-[380px] overflow-auto pr-1">
                                    {Object.entries(overrides.text[language] ?? {}).map(
                                        ([key, value]) => (
                                            <div
                                                key={key}
                                                className="rounded border border-border p-2"
                                            >
                                                <p className="text-xs text-muted-foreground">
                                                    {key}
                                                </p>
                                                <p className="text-sm text-foreground whitespace-pre-wrap">
                                                    {value}
                                                </p>
                                                <div className="mt-2">
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        disabled={saving}
                                                        onClick={() =>
                                                            void run(
                                                                () => removeText(language, key),
                                                                l('Переопределение текста удалено.', 'Text override removed.', 'Teksta pārrakstījums noņemts.'),
                                                                l('Не удалось удалить переопределение текста.', 'Failed to remove the text override.', 'Neizdevās noņemt teksta pārrakstījumu.')
                                                            )
                                                        }
                                                    >
                                                        {l('Удалить', 'Delete', 'Dzēst')}
                                                    </Button>
                                                </div>
                                            </div>
                                        )
                                    )}
                                    {Object.keys(overrides.text[language] ?? {}).length === 0 && (
                                        <p className="text-sm text-muted-foreground">
                                            {l('Для этого языка пока нет переопределений.', 'There are no overrides for this language yet.', 'Šai valodai vēl nav pārrakstījumu.')}
                                        </p>
                                    )}
                                </div>
                            </div>

                            <div className="rounded-lg border border-border bg-card p-4">
                                <h3 className="font-semibold mb-3 text-foreground">
                                    {l('Текущие переопределения изображений', 'Current image overrides', 'Pašreizējie attēlu pārrakstījumi')}
                                </h3>
                                <div className="space-y-2 max-h-[380px] overflow-auto pr-1">
                                    {Object.entries(overrides.images).map(([from, to]) => (
                                        <div
                                            key={from}
                                            className="rounded border border-border p-2"
                                        >
                                            <p className="text-xs text-muted-foreground">{from}</p>
                                            <p className="text-sm text-foreground break-all">
                                                {to}
                                            </p>
                                            <div className="mt-2">
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    disabled={saving}
                                                    onClick={() =>
                                                        void run(
                                                            () => removeImage(from),
                                                            l('Переопределение изображения удалено.', 'Image override removed.', 'Attēla pārrakstījums noņemts.'),
                                                            l('Не удалось удалить переопределение изображения.', 'Failed to remove the image override.', 'Neizdevās noņemt attēla pārrakstījumu.')
                                                        )
                                                    }
                                                >
                                                    {l('Удалить', 'Delete', 'Dzēst')}
                                                </Button>
                                            </div>
                                        </div>
                                    ))}
                                    {Object.keys(overrides.images).length === 0 && (
                                        <p className="text-sm text-muted-foreground">
                                            {l('Переопределений изображений пока нет.', 'There are no image overrides yet.', 'Attēlu pārrakstījumu vēl nav.')}
                                        </p>
                                    )}
                                </div>
                            </div>
                        </section>
                    </div>
                </details>
            </main>
        </AdminGate>
    );
}
