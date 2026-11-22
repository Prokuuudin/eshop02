'use client';

import React from 'react';
import Image from 'next/image';
import { useController, useFieldArray, useFormContext, useWatch } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ImageIcon, Plus, Upload, X } from 'lucide-react';
import { AddProductFormValues } from './productFormSchema';
import ProductImageCropTool from './ProductImageCropTool';
import { useAdminLocale } from '@/lib/use-admin-locale';

const ACCEPTED_IMAGE_TYPES = 'image/jpeg,image/png,image/webp,image/gif,image/avif';

export interface ProductImageUploadState { pending: boolean; error: string }

const ProductGalleryFields: React.FC<{ productId?: string; onUploadStateChange?: (state: ProductImageUploadState) => void }> = ({ productId, onUploadStateChange }) => {
    const { register, control, setValue, getValues, formState: { errors } } = useFormContext<AddProductFormValues>();
    // useFieldArray supports objects, not a flat string array. Keep gallery URLs
    // controlled as one field so blank rows and multiple uploads are preserved.
    const { field: gallery } = useController({ control, name: 'images' });
    const videos = useFieldArray({ control, name: 'demoVideo' });
    const { l } = useAdminLocale();
    const image = useWatch({ control, name: 'image' });
    const images = gallery.value ?? [];
    const [uploadingMain, setUploadingMain] = React.useState(false);
    const [uploadingGallery, setUploadingGallery] = React.useState(false);
    const [uploadError, setUploadError] = React.useState('');

    React.useEffect(() => {
        onUploadStateChange?.({ pending: uploadingMain || uploadingGallery, error: uploadError });
    }, [uploadingMain, uploadingGallery, uploadError, onUploadStateChange]);

    const uploadImage = async (file: File): Promise<string> => {
        const formData = new FormData();
        formData.set('file', file);
        const response = await fetch('/api/admin/content/upload', { method: 'POST', body: formData });
        const result = await response.json().catch(() => ({})) as { path?: string; error?: string };
        if (!response.ok || !result.path) {
            const message = response.status === 413
                ? l('Файл слишком большой для загрузки. Уменьшите размер изображения и повторите.', 'The upload is too large. Reduce the image size and try again.', 'Fails ir pārāk liels. Samaziniet attēla izmēru un mēģiniet vēlreiz.')
                : response.status === 401 || response.status === 403
                    ? l('Нет доступа к загрузке изображений. Проверьте вход в аккаунт и права.', 'Image upload is not authorized. Check your login and permissions.', 'Attēlu augšupielāde nav atļauta. Pārbaudiet pieteikšanos un tiesības.')
                : result.error === 'file_too_large'
                ? l('Файл превышает 10 МБ', 'The file exceeds 10 MB', 'Fails pārsniedz 10 MB')
                : result.error === 'unsupported_file_type'
                    ? l('Неподдерживаемый формат изображения', 'Unsupported image format', 'Neatbalstīts attēla formāts')
                    : l('Не удалось загрузить изображение', 'Failed to upload image', 'Neizdevās augšupielādēt attēlu');
            throw new Error(message);
        }
        return result.path;
    };

    const handleMainUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        setUploadingMain(true);
        setUploadError('');
        try {
            const path = await uploadImage(file);
            setValue('image', path, { shouldDirty: true, shouldValidate: true });
        } catch (error) {
            setUploadError(error instanceof Error ? error.message : l('Ошибка загрузки', 'Upload failed', 'Augšupielādes kļūda'));
        } finally {
            setUploadingMain(false);
        }
    };

    const handleGalleryUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(event.target.files ?? []);
        event.target.value = '';
        if (!files.length) return;
        setUploadingGallery(true);
        setUploadError('');
        try {
            const paths = await Promise.all(files.map(uploadImage));
            setValue('images', [...getValues('images'), ...paths], { shouldDirty: true, shouldValidate: true });
        } catch (error) {
            setUploadError(error instanceof Error ? error.message : l('Ошибка загрузки', 'Upload failed', 'Augšupielādes kļūda'));
        } finally {
            setUploadingGallery(false);
        }
    };

    // File inputs are wrapped in a label styled as a shadcn Button so every action in the
    // block shares one size; focus-within keeps the keyboard focus ring visible.
    const uploadButtonClass = (busy: boolean) =>
        `cursor-pointer focus-within:ring-1 focus-within:ring-ring ${busy ? 'pointer-events-none opacity-50' : ''}`;

    return (
        <div className="add-product__section add-product__section--gallery">
            <h2 className="add-product__section-title">{l('Изображения', 'Images', 'Attēli')}</h2>
            <div className="add-product__fields-grid add-product__gallery-grid">
                <div className="add-product__gallery-column">
                    <label className="add-product__gallery-label" htmlFor="add-product-image">
                        {l('Главное изображение (URL)', 'Main image (URL)', 'Galvenais attēls (URL)')}
                    </label>
                    <Input id="add-product-image" placeholder="https://example.com/image.jpg" {...register('image')} />
                    {errors.image?.message && <p className="text-xs text-destructive">{errors.image.message}</p>}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <Button asChild type="button" variant="outline" size="sm" className={uploadButtonClass(uploadingMain)}>
                            <label>
                                <input type="file" accept={ACCEPTED_IMAGE_TYPES} className="sr-only" disabled={uploadingMain} onChange={(event) => void handleMainUpload(event)} />
                                <Upload />
                                {uploadingMain ? l('Загрузка…', 'Uploading…', 'Augšupielāde…') : l('Выбрать с компьютера', 'Choose from computer', 'Izvēlēties no datora')}
                            </label>
                        </Button>
                        <span className="text-xs text-muted-foreground">JPEG, PNG, WebP, GIF, AVIF · {l('до 10 МБ', 'up to 10 MB', 'līdz 10 MB')}</span>
                    </div>
                    {(image || productId) && (
                        <div className="mt-1 flex flex-wrap items-stretch gap-3">
                            <div className="product-image-surface flex min-h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border">
                                {image ? (
                                    <Image unoptimized src={image} alt={l('Главное изображение товара', 'Main product image', 'Preces galvenais attēls')} width={112} height={112} className="h-full max-h-36 w-full object-contain p-2" />
                                ) : (
                                    <ImageIcon className="h-6 w-6 text-muted-foreground" aria-hidden />
                                )}
                            </div>
                            {productId && <ProductImageCropTool productId={productId} />}
                        </div>
                    )}
                </div>

                <div className="add-product__gallery-column">
                    <p className="add-product__gallery-label">{l('Галерея', 'Gallery', 'Galerija')}</p>
                    {images.length === 0 && (
                        <p className="text-xs text-muted-foreground">{l('Дополнительных изображений нет', 'No additional images', 'Nav papildu attēlu')}</p>
                    )}
                    {images.map((url, index) => (
                        <div key={index} className="flex items-center gap-2">
                            <div className="product-image-surface flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border">
                                {url ? (
                                    <Image unoptimized src={url} alt="" width={40} height={40} className="h-full w-full object-contain p-1" />
                                ) : (
                                    <ImageIcon className="h-4 w-4 text-muted-foreground" aria-hidden />
                                )}
                            </div>
                            <Input className="min-w-0 flex-1" placeholder={l(`Изображение ${index + 1} (URL)`, `Image ${index + 1} (URL)`, `Attēls ${index + 1} (URL)`)} value={url} onBlur={gallery.onBlur} onChange={(event) => gallery.onChange(images.map((value, i) => i === index ? event.target.value : value))} />
                            <Button type="button" variant="outline" size="icon" className="h-10 w-10 shrink-0 text-muted-foreground hover:border-destructive/50 hover:text-destructive" aria-label={l(`Удалить изображение ${index + 1}`, `Remove image ${index + 1}`, `Noņemt attēlu ${index + 1}`)} onClick={() => gallery.onChange(images.filter((_, i) => i !== index))}>
                                <X />
                            </Button>
                        </div>
                    ))}
                    <div className="flex flex-col items-start gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={() => gallery.onChange([...images, ''])}>
                            <Plus />
                            {l('Добавить URL', 'Add URL', 'Pievienot URL')}
                        </Button>
                        <Button asChild type="button" variant="outline" size="sm" className={uploadButtonClass(uploadingGallery)}>
                            <label>
                                <input type="file" accept={ACCEPTED_IMAGE_TYPES} multiple className="sr-only" disabled={uploadingGallery} onChange={(event) => void handleGalleryUpload(event)} />
                                <Upload />
                                {uploadingGallery ? l('Загрузка…', 'Uploading…', 'Augšupielāde…') : l('Загрузить с компьютера', 'Upload from computer', 'Augšupielādēt no datora')}
                            </label>
                        </Button>
                    </div>
                </div>

                <div className="add-product__gallery-column">
                    <p className="add-product__gallery-label">{l('Демо-видео', 'Demo videos', 'Demonstrācijas video')}</p>
                    {videos.fields.length === 0 && (
                        <p className="text-xs text-muted-foreground">{l('Видео не добавлены', 'No videos added', 'Video nav pievienoti')}</p>
                    )}
                    {videos.fields.map((field, index) => (
                        <div key={field.id} className="flex items-start gap-2">
                            <div className="flex min-w-0 flex-1 flex-col gap-2">
                                <Input placeholder={l('URL видео (src)', 'Video URL (src)', 'Video URL (src)')} {...register(`demoVideo.${index}.src` as const)} />
                                <Input placeholder={l('URL постера (необязательно)', 'Poster URL (optional)', 'Plakāta URL (neobligāti)')} {...register(`demoVideo.${index}.poster` as const)} />
                            </div>
                            <Button type="button" variant="outline" size="icon" className="h-10 w-10 shrink-0 text-muted-foreground hover:border-destructive/50 hover:text-destructive" aria-label={l(`Удалить видео ${index + 1}`, `Remove video ${index + 1}`, `Noņemt video ${index + 1}`)} onClick={() => videos.remove(index)}>
                                <X />
                            </Button>
                        </div>
                    ))}
                    <div>
                        <Button type="button" variant="outline" size="sm" onClick={() => videos.append({ src: '', poster: '' })}>
                            <Plus />
                            {l('Добавить видео', 'Add video', 'Pievienot video')}
                        </Button>
                    </div>
                </div>
            </div>
            {uploadError && <div className="mt-3 space-y-2">
                <p role="alert" className="text-sm text-destructive">{uploadError}</p>
                <Button type="button" variant="outline" size="sm" onClick={() => setUploadError('')}>
                    {l('Отменить неудачную загрузку', 'Discard failed upload', 'Atcelt neizdevušos augšupielādi')}
                </Button>
            </div>}
        </div>
    );
};

export default ProductGalleryFields;
